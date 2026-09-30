import { Browser, Page } from 'puppeteer';
import { browserManager } from './browserManager.service';
import { detectATS, applicationFormUrl } from './atsDetector.service';
import { BaseATSStrategy } from './strategies/BaseStrategy';
import { ApplicationFormStrategy } from './strategies/ApplicationFormStrategy';
import { Application, ApplicationStatus, SubmissionType, LogLevel } from '../../models/Application.model';
import { Profile } from '../../models/Profile.model';
import { UploadedResume } from '../../models/UploadedResume.model';
import { CoverLetter } from '../../models/CoverLetter.model';
import { Job } from '../../models/Job.model';
import { NotificationType } from '../../models/Notification.model';
import { createNotification } from '../notification.service';
import { logger } from '../../config/logger';
import path from 'path';
import fs from 'fs/promises';

export interface AutomationJobData {
  applicationId: string;
  userId: string;
  jobId: string;
  jobUrl: string;
  resumeId?: string;
  coverLetterId?: string;
  /** Queued by the daily autopilot: submits without review and reports back via notifications */
  autopilot?: boolean;
}

// 'action': the site wants a person (verification code, spam check) and the tab is held open
type CompletionStatus = 'success' | 'unconfirmed' | 'review' | 'action' | 'failed';

interface PendingReview {
  page: Page;
  strategy: BaseATSStrategy;
  jobData: AutomationJobData;
  screenshots: string[];
  timeout: NodeJS.Timeout;
  /** Why the user is needed (e.g. a verification code); absent for a normal pre-submit review */
  reason?: string;
  since: Date;
  expiresAt: Date;
}

export interface PendingReviewInfo {
  applicationId: string;
  reason?: string;
  since: Date;
  expiresAt: Date;
}

// A filled form waits this long for the user's decision before it is discarded
const REVIEW_TIMEOUT_MS = 30 * 60 * 1000;
// A tab stopped by a human check waits longer: the user may be away when autopilot runs
const actionTimeoutMs = () => Math.max(5, parseInt(process.env.AUTOPILOT_ACTION_TIMEOUT_MINUTES || '120', 10)) * 60 * 1000;

// Read lazily: dotenv.config() runs after module imports
const autoSubmitEnabled = () => process.env.AUTO_SUBMIT === 'true';

export class AutomationEngine {
  private io: any;
  private readonly pendingReviews = new Map<string, PendingReview>();

  setSocketIO(socketIO: any) {
    this.io = socketIO;
  }

  /**
   * Fill the application form. In review mode (default) the page stays open and the
   * application waits in AWAITING_REVIEW for submitReviewed()/discardReview();
   * with AUTO_SUBMIT=true it is submitted immediately.
   */
  async executeAutomation(jobData: AutomationJobData): Promise<void> {
    const { applicationId, userId, jobUrl, resumeId, coverLetterId } = jobData;

    let browser: Browser | null = null;
    let page: Page | null = null;
    let keepPageOpen = false;

    try {
      // Step 1: Initialize browser
      this.emitProgress(jobData, 1, 'Initializing browser...');
      browser = await browserManager.getBrowser();
      page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 900 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Step 2: Navigate to job URL
      this.emitProgress(jobData, 2, 'Loading job page...');
      const formUrl = applicationFormUrl(jobUrl);
      logger.info(`📄 Loading application page: ${formUrl}`);
      await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Step 3: Take initial screenshot
      this.emitProgress(jobData, 3, 'Analyzing page...');
      const initialScreenshot = await this.captureScreenshot(page, userId, applicationId, 'initial');

      // Step 4: Detect ATS platform
      this.emitProgress(jobData, 4, 'Detecting application system...');
      const atsType = await detectATS(page, jobUrl);
      await Application.findByIdAndUpdate(applicationId, { atsType });

      // Step 5: Load user profile
      this.emitProgress(jobData, 5, 'Loading your profile...');
      const profile = await Profile.findOne({ userId });
      if (!profile) {
        throw new Error('Profile not found. Please complete your profile first.');
      }

      // The job's details help the form-question answers stay relevant
      const job = await Job.findById(jobData.jobId).select('title company description');
      const strategy = new ApplicationFormStrategy(page, profile, (step, _total, message, level) => {
        this.emitProgress(jobData, step, message, level);
      }, job ? { title: job.title, company: job.company, description: job.description } : undefined);

      const resumePath = await this.resolveResumePath(userId, resumeId);
      const coverLetterPath = coverLetterId
        ? await this.prepareCoverLetter(coverLetterId, userId, applicationId)
        : undefined;

      // Steps 6-11: Fill the form (no submit yet)
      await strategy.fillForm(resumePath, coverLetterPath);
      const filledScreenshot = await this.captureScreenshot(page, userId, applicationId, 'filled');
      const screenshots = [initialScreenshot, filledScreenshot];

      const unanswered = strategy.unansweredRequired;
      if (autoSubmitEnabled() || jobData.autopilot) {
        // Never send an incomplete application: the ATS would reject it or the company would see gaps
        if (unanswered.length) {
          await this.recordNeedsAnswers(jobData, screenshots, unanswered);
          return;
        }
        const outcome = await this.finishSubmission(jobData, page, strategy, screenshots);
        keepPageOpen = outcome.held;
        return;
      }

      // Hold the filled form open for the user's review
      keepPageOpen = true;
      await this.holdForUser(jobData, page, strategy, screenshots, undefined,
        unanswered.length ? `Answer these required questions in the browser before submitting: ${unanswered.join(' | ')}` : null);

    } catch (error: any) {
      logger.error(`❌ Automation failed for application ${applicationId}: ${error.message}`);
      await this.recordFailure(jobData, page, error.message);
      throw error;

    } finally {
      if (page && !keepPageOpen) {
        await page.close().catch(() => undefined);
      }
      // The browser is shared; a page held for review stays open inside it
      if (browser) {
        await browserManager.releaseBrowser(browser);
      }
    }
  }

  hasPendingReview(applicationId: string): boolean {
    return this.pendingReviews.has(applicationId);
  }

  /** Submit a form the user has reviewed. Returns the resulting application status. */
  async submitReviewed(applicationId: string): Promise<ApplicationStatus> {
    const review = this.pendingReviews.get(applicationId);
    if (!review) {
      throw new Error('This form is no longer open. Retry the automation to fill it again.');
    }
    this.pendingReviews.delete(applicationId);
    clearTimeout(review.timeout);

    const { page, strategy, jobData, screenshots } = review;
    let held = false;
    try {
      if (page.isClosed()) {
        throw new Error('The browser tab was closed before submitting. Retry the automation.');
      }
      const outcome = await this.finishSubmission(jobData, page, strategy, screenshots);
      held = outcome.held;
      return outcome.status;
    } catch (error: any) {
      await this.recordFailure(jobData, page, error.message);
      throw error;
    } finally {
      if (!held) await page.close().catch(() => undefined);
    }
  }

  /**
   * The user finished the application themselves in the held tab (e.g. entered the email code
   * and clicked the site's Submit). Records it as submitted and closes the tab.
   */
  async confirmSubmittedByUser(applicationId: string): Promise<{ confirmationSeen: boolean }> {
    const review = this.pendingReviews.get(applicationId);
    if (!review) throw new Error('This form is no longer open.');
    this.pendingReviews.delete(applicationId);
    clearTimeout(review.timeout);

    const { page, strategy, jobData } = review;
    const confirmationSeen = !page.isClosed() && await strategy.isConfirmationShown();
    const screenshot = page.isClosed()
      ? null
      : await this.captureScreenshot(page, jobData.userId, applicationId, 'after-submit').catch(() => null);

    await Application.findByIdAndUpdate(applicationId, {
      status: ApplicationStatus.SUBMITTED,
      submissionType: SubmissionType.HYBRID,
      submittedAt: new Date(),
      errorLog: null,
      ...(screenshot && { $push: { screenshots: screenshot } })
    });
    this.emitProgress(jobData, 15, confirmationSeen
      ? 'You completed the submission — confirmation page detected'
      : 'Marked as submitted by you (no confirmation page was detected on the tab)', 'success');
    this.emitComplete(jobData, 'success');
    await page.close().catch(() => undefined);
    return { confirmationSeen };
  }

  /** Bring a held tab to the front of the automation browser window */
  async focusReview(applicationId: string): Promise<void> {
    const review = this.pendingReviews.get(applicationId);
    if (!review || review.page.isClosed()) throw new Error('This form is no longer open.');
    await review.page.bringToFront();
  }

  listPendingReviews(userId: string): PendingReviewInfo[] {
    return [...this.pendingReviews.entries()]
      .filter(([, r]) => r.jobData.userId === userId)
      .map(([applicationId, r]) => ({ applicationId, reason: r.reason, since: r.since, expiresAt: r.expiresAt }));
  }

  /** Keep a filled tab open for the user: a normal review, or an "action needed" human check */
  private async holdForUser(
    jobData: AutomationJobData,
    page: Page,
    strategy: BaseATSStrategy,
    screenshots: string[],
    reason?: string,
    note?: string | null
  ): Promise<void> {
    const { applicationId } = jobData;
    const timeoutMs = reason ? actionTimeoutMs() : REVIEW_TIMEOUT_MS;
    const minutes = Math.round(timeoutMs / 60000);

    await page.bringToFront().catch(() => undefined);
    this.pendingReviews.set(applicationId, {
      page, strategy, jobData, screenshots, reason,
      since: new Date(),
      expiresAt: new Date(Date.now() + timeoutMs),
      timeout: setTimeout(() => {
        void this.discardReview(applicationId, `Nobody completed this within ${minutes} minutes, so the tab was closed. Retry, or apply manually.`);
      }, timeoutMs)
    });

    await Application.findByIdAndUpdate(applicationId, {
      status: ApplicationStatus.AWAITING_REVIEW,
      submissionType: SubmissionType.AUTOMATED,
      screenshots,
      errorLog: reason ? `Action needed: ${reason}.` : note ?? null
    });

    if (reason) {
      this.emitProgress(jobData, 15, `Action needed: ${reason}. The tab stays open for ${minutes} min — complete it there, then click "I submitted it"`, 'warn');
      this.emitComplete(jobData, 'action', reason);
      const job = await Job.findById(jobData.jobId).select('title company').catch(() => null);
      await createNotification(jobData.userId, NotificationType.SYSTEM, 'Action needed',
        `${job ? `${job.title} at ${job.company}` : 'An application'}: ${reason}. Open the Dashboard to finish it (tab open for ${minutes} min).`,
        { applicationId, jobId: jobData.jobId });
      logger.info(`✋ Application ${applicationId} held for the user: ${reason}`);
    } else {
      this.emitProgress(jobData, 12, 'Form filled — waiting for your review. Check it in the browser window, then Submit or Discard', 'success');
      this.emitComplete(jobData, 'review');
      logger.info(`📝 Application ${applicationId} filled and awaiting review`);
    }
  }

  /** Close a filled form without submitting it */
  async discardReview(applicationId: string, reason?: string): Promise<void> {
    const review = this.pendingReviews.get(applicationId);
    if (!review) return;
    this.pendingReviews.delete(applicationId);
    clearTimeout(review.timeout);

    await review.page.close().catch(() => undefined);
    await Application.findByIdAndUpdate(applicationId, reason
      ? { status: ApplicationStatus.FAILED, errorLog: reason }
      : { status: ApplicationStatus.CANCELLED });
    this.emitProgress(review.jobData, 12, reason || 'Discarded without submitting', reason ? 'error' : 'warn');
    this.emitComplete(review.jobData, 'failed', reason || 'Discarded without submitting');
    logger.info(`🗑️ Discarded filled form for application ${applicationId}${reason ? `: ${reason}` : ''}`);
  }

  /**
   * Queued and awaiting-review automations live in memory, so they are lost when the server
   * restarts. Mark them failed on startup so the user can retry them.
   */
  async recoverInterruptedAutomations(): Promise<void> {
    const result = await Application.updateMany(
      {
        submissionType: SubmissionType.AUTOMATED,
        status: { $in: [ApplicationStatus.PENDING, ApplicationStatus.AWAITING_REVIEW] }
      },
      { status: ApplicationStatus.FAILED, errorLog: 'Interrupted by a server restart. Retry to fill the form again.' }
    );
    if (result.modifiedCount > 0) {
      logger.warn(`Marked ${result.modifiedCount} interrupted automation(s) as failed`);
    }
  }

  private async finishSubmission(
    jobData: AutomationJobData,
    page: Page,
    strategy: BaseATSStrategy,
    screenshots: string[]
  ): Promise<{ status: ApplicationStatus; held: boolean }> {
    const { applicationId, userId } = jobData;

    const confirmed = await strategy.submit();

    this.emitProgress(jobData, 14, 'Capturing confirmation...');
    const afterScreenshot = await this.captureScreenshot(page, userId, applicationId, 'after-submit');

    const humanCheck = confirmed ? null : await strategy.detectHumanCheck();
    if (humanCheck && !page.isClosed()) {
      // The site wants a person: keep the tab so the user can finish it instead of starting over
      await this.holdForUser(jobData, page, strategy, [...screenshots, afterScreenshot], humanCheck);
      return { status: ApplicationStatus.AWAITING_REVIEW, held: true };
    }

    const status = confirmed ? ApplicationStatus.SUBMITTED : ApplicationStatus.UNCONFIRMED;
    await Application.findByIdAndUpdate(applicationId, {
      status,
      submissionType: SubmissionType.AUTOMATED,
      screenshots: [...screenshots, afterScreenshot],
      submittedAt: new Date(),
      errorLog: confirmed
        ? null
        : humanCheck
          ? `Not submitted: ${humanCheck}. Open the job and submit it yourself.`
          : 'Submit was clicked but no confirmation message appeared. Check the "After Submit" screenshot — the form may have validation errors or a CAPTCHA.'
    });

    this.emitProgress(jobData, 15, confirmed
      ? 'Application submitted — confirmation page detected'
      : humanCheck
        ? `Not submitted: ${humanCheck}. Submit it yourself.`
        : 'Submit clicked, but no confirmation appeared (check the After Submit screenshot)', confirmed ? 'success' : 'warn');
    if (jobData.autopilot) {
      await this.notifyAutopilot(jobData, confirmed ? 'Autopilot applied' : 'Autopilot: check this application',
        confirmed ? 'submitted your application' : 'clicked submit, but no confirmation appeared. Check the screenshots');
    }
    this.emitComplete(jobData, confirmed ? 'success' : 'unconfirmed');
    logger.info(`${confirmed ? '✅' : '⚠️'} Application ${applicationId} ${status}`);
    return { status, held: false };
  }

  private async recordFailure(jobData: AutomationJobData, page: Page | null, message: string): Promise<void> {
    let errorScreenshot: string | undefined;
    if (page && !page.isClosed()) {
      errorScreenshot = await this.captureScreenshot(page, jobData.userId, jobData.applicationId, 'error')
        .catch(() => undefined);
    }

    await Application.findByIdAndUpdate(jobData.applicationId, {
      status: ApplicationStatus.FAILED,
      errorLog: message,
      ...(errorScreenshot && { $push: { screenshots: errorScreenshot } })
    });
    this.emitProgress(jobData, 15, `Failed: ${message}`, 'error');
    this.emitComplete(jobData, 'failed', message);
    if (jobData.autopilot) {
      await this.notifyAutopilot(jobData, 'Autopilot could not apply', `could not apply: ${message}`);
    }
  }

  /** Autopilot left the form unsubmitted because required questions had no answer from the profile */
  private async recordNeedsAnswers(jobData: AutomationJobData, screenshots: string[], unanswered: string[]): Promise<void> {
    const message = `Not submitted: these required questions need your answers: ${unanswered.join(' | ')}. Retry to review the form, or apply manually.`;
    await Application.findByIdAndUpdate(jobData.applicationId, {
      status: ApplicationStatus.FAILED,
      submissionType: SubmissionType.AUTOMATED,
      screenshots,
      errorLog: message
    });
    this.emitProgress(jobData, 12, `Not submitted — required questions need your answers: ${unanswered.join(' | ')}`, 'warn');
    this.emitComplete(jobData, 'failed', message);
    if (jobData.autopilot) {
      await this.notifyAutopilot(jobData, 'Autopilot needs your answers',
        `skipped this application because ${unanswered.length} required question(s) need your answers`);
    }
    logger.info(`⏸️ Application ${jobData.applicationId} not submitted: ${unanswered.length} required question(s) unanswered`);
  }

  private async notifyAutopilot(jobData: AutomationJobData, title: string, action: string): Promise<void> {
    const job = await Job.findById(jobData.jobId).select('title company').catch(() => null);
    const jobName = job ? `${job.title} at ${job.company}` : 'a job';
    await createNotification(jobData.userId, NotificationType.APPLICATION_SUBMITTED, title,
      `Autopilot ${action} — ${jobName}.`, { applicationId: jobData.applicationId, jobId: jobData.jobId });
  }

  private async resolveResumePath(userId: string, resumeId?: string): Promise<string | undefined> {
    const resume = resumeId
      ? await UploadedResume.findById(resumeId)
      : await UploadedResume.findOne({ userId, isPrimary: true });

    if (!resume) {
      logger.warn('⚠️ No resume found for this application');
      return undefined;
    }
    try {
      await fs.access(resume.filePath);
    } catch {
      logger.warn(`⚠️ Resume file not found on disk: ${resume.filePath}`);
      return undefined;
    }

    // Stored files have generated names; recruiters see the uploaded file name, so use the original one
    const originalName = (resume.filename || 'Resume.pdf').replace(/[^\w.\- ]+/g, '_');
    const dir = path.join(process.cwd(), 'uploads', 'tmp', resume._id.toString());
    const namedCopy = path.join(dir, /\.pdf$/i.test(originalName) ? originalName : `${originalName}.pdf`);
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(resume.filePath, namedCopy);
    return namedCopy;
  }

  private async prepareCoverLetter(coverLetterId: string, userId: string, applicationId: string): Promise<string | undefined> {
    try {
      const coverLetter = await CoverLetter.findById(coverLetterId);
      if (!coverLetter?.content) {
        logger.warn(`⚠️ Cover letter ${coverLetterId} not found or empty`);
        return undefined;
      }
      return await this.generateCoverLetterPDF(coverLetter.content, userId, applicationId);
    } catch (err: any) {
      logger.warn(`⚠️ Failed to prepare cover letter: ${err.message}`);
      return undefined;
    }
  }

  private emitProgress(jobData: AutomationJobData, step: number, message: string, level: LogLevel = 'info'): void {
    // Saved so the progress timeline survives page reloads (fire-and-forget keeps automation fast)
    void Application.updateOne(
      { _id: jobData.applicationId },
      { $push: { automationLog: { at: new Date(), step, message, level } } }
    ).catch(error => logger.warn(`Could not record automation step: ${error.message}`));

    if (!this.io) return;

    const total = 15;
    this.io.to(`user:${jobData.userId}`).emit('automation:progress', {
      applicationId: jobData.applicationId,
      jobId: jobData.jobId,
      step,
      totalSteps: total,
      percentage: Math.round((step / total) * 100),
      message
    });
  }

  private emitComplete(jobData: AutomationJobData, status: CompletionStatus, error?: string): void {
    if (!this.io) return;

    this.io.to(`user:${jobData.userId}`).emit('automation:complete', {
      applicationId: jobData.applicationId,
      jobId: jobData.jobId,
      status,
      error
    });
  }

  private async captureScreenshot(
    page: Page,
    userId: string,
    applicationId: string,
    type: string
  ): Promise<string> {
    const filename = `screenshot-${type}-${Date.now()}.png`;
    const filepath = path.join(process.cwd(), 'uploads', 'screenshots', userId, applicationId, filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  /**
   * Generate a PDF from cover letter text content
   */
  private async generateCoverLetterPDF(
    content: string,
    userId: string,
    applicationId: string
  ): Promise<string> {
    const dir = path.join(process.cwd(), 'uploads', 'cover-letters', 'temp');
    await fs.mkdir(dir, { recursive: true });

    const filepath = path.join(dir, `${userId}-${applicationId}.pdf`);

    // Use a headless browser page to render HTML to PDF
    const browser = await browserManager.getBrowser();
    const pdfPage = await browser.newPage();

    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Georgia', 'Times New Roman', serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 60px 72px;
            }
            p { margin: 0 0 12px 0; }
          </style>
        </head>
        <body>${content.replace(/\n/g, '<br/>')}</body>
        </html>
      `;

      await pdfPage.setContent(html, { waitUntil: 'networkidle0' });
      await pdfPage.pdf({
        path: filepath,
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', bottom: '0.5in', left: '0.75in', right: '0.75in' }
      });

      return filepath;
    } finally {
      await pdfPage.close();
      await browserManager.releaseBrowser(browser);
    }
  }
}

export const automationEngine = new AutomationEngine();
