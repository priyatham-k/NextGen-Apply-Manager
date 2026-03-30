import { Browser, Page } from 'puppeteer';
import { browserManager } from './browserManager.service';
import { detectATS, ATSType } from './atsDetector.service';
import { BaseATSStrategy } from './strategies/BaseStrategy';
import { GreenhouseStrategy } from './strategies/GreenhouseStrategy';
import { LinkedInEasyApplyStrategy } from './strategies/LinkedInEasyApplyStrategy';
import { GenericStrategy } from './strategies/GenericStrategy';
import { Application, ApplicationStatus, SubmissionType } from '../../models/Application.model';
import { Profile } from '../../models/Profile.model';
import { UploadedResume } from '../../models/UploadedResume.model';
import { CoverLetter } from '../../models/CoverLetter.model';
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
}

export class AutomationEngine {
  private io: any;

  setSocketIO(socketIO: any) {
    this.io = socketIO;
  }

  /**
   * Execute the full automation workflow for a job application
   */
  async executeAutomation(jobData: AutomationJobData): Promise<void> {
    const { applicationId, userId, jobId, jobUrl, resumeId, coverLetterId } = jobData;

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      // Step 1: Initialize browser
      this.emitProgress(userId, applicationId, 1, 15, 'Initializing browser...');
      browser = await browserManager.getBrowser();
      page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Step 2: Navigate to job URL
      this.emitProgress(userId, applicationId, 2, 15, 'Loading job page...');
      logger.info(`📄 Loading job page: ${jobUrl}`);
      await page.goto(jobUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Step 3: Take initial screenshot
      this.emitProgress(userId, applicationId, 3, 15, 'Analyzing page...');
      const screenshot1 = await this.captureScreenshot(page, userId, applicationId, 'initial');

      // Step 4: Detect ATS platform
      this.emitProgress(userId, applicationId, 4, 15, 'Detecting application system...');
      const atsType = await detectATS(page, jobUrl);
      await Application.findByIdAndUpdate(applicationId, { atsType });
      logger.info(`🔍 Detected ATS: ${atsType}`);

      // Step 5: Load user profile
      this.emitProgress(userId, applicationId, 5, 15, 'Loading your profile...');
      const profile = await Profile.findOne({ userId });
      if (!profile) {
        throw new Error('Profile not found. Please complete your profile first.');
      }

      // Step 6-13: Execute ATS-specific strategy
      const strategy = this.createStrategy(atsType, page, profile, (step, total, message) => {
        this.emitProgress(userId, applicationId, step, total, message);
      });

      // Get file paths if provided
      let resumePath: string | undefined;
      let coverLetterPath: string | undefined;

      if (resumeId) {
        const resumeFile = await UploadedResume.findById(resumeId);
        if (resumeFile) {
          // Check if file exists
          try {
            await fs.access(resumeFile.filePath);
            resumePath = resumeFile.filePath;
            logger.info(`✓ Resume file found: ${resumePath}`);
          } catch {
            logger.warn(`⚠️ Resume file not found: ${resumeFile.filePath}`);
          }
        } else {
          logger.warn(`⚠️ Resume document ${resumeId} not found in database`);
        }
      }

      // If no resumeId provided, try to find the user's primary resume
      if (!resumePath) {
        const primaryResume = await UploadedResume.findOne({ userId, isPrimary: true });
        if (primaryResume) {
          try {
            await fs.access(primaryResume.filePath);
            resumePath = primaryResume.filePath;
            logger.info(`✓ Using primary resume: ${resumePath}`);
          } catch {
            logger.warn(`⚠️ Primary resume file not found: ${primaryResume.filePath}`);
          }
        }
      }

      // Cover letter support: fetch from DB and generate temp PDF
      if (coverLetterId) {
        try {
          const coverLetter = await CoverLetter.findById(coverLetterId);
          if (coverLetter?.content) {
            coverLetterPath = await this.generateCoverLetterPDF(
              coverLetter.content,
              userId,
              applicationId
            );
            logger.info(`✓ Cover letter PDF generated: ${coverLetterPath}`);
          } else {
            logger.warn(`⚠️ Cover letter ${coverLetterId} not found or empty`);
          }
        } catch (err: any) {
          logger.warn(`⚠️ Failed to prepare cover letter: ${err.message}`);
        }
      }

      // Execute the strategy
      await strategy.execute(resumePath, coverLetterPath);

      // Step 14: Capture success screenshot
      this.emitProgress(userId, applicationId, 14, 15, 'Capturing confirmation...');
      const screenshot2 = await this.captureScreenshot(page, userId, applicationId, 'success');

      // Step 15: Update application status
      this.emitProgress(userId, applicationId, 15, 15, 'Application submitted successfully!');
      await Application.findByIdAndUpdate(applicationId, {
        status: ApplicationStatus.SUBMITTED,
        submissionType: SubmissionType.AUTOMATED,
        screenshots: [screenshot1, screenshot2],
        submittedAt: new Date()
      });

      // Emit completion event
      this.emitComplete(userId, applicationId, 'success');
      logger.info(`✅ Automation completed successfully for application ${applicationId}`);

    } catch (error: any) {
      logger.error(`❌ Automation failed for application ${applicationId}: ${error.message}`);

      // Capture error screenshot
      let errorScreenshot: string | undefined;
      if (page) {
        try {
          errorScreenshot = await this.captureScreenshot(page, userId, applicationId, 'error');
        } catch (screenshotError: any) {
          logger.error(`Failed to capture error screenshot: ${screenshotError.message}`);
        }
      }

      // Update application with failure
      await Application.findByIdAndUpdate(applicationId, {
        status: ApplicationStatus.FAILED,
        errorLog: error.message,
        screenshots: errorScreenshot ? [errorScreenshot] : []
      });

      // Emit failure event
      this.emitComplete(userId, applicationId, 'failed', error.message);

      throw error;

    } finally {
      // Always release the browser back to the pool
      if (browser) {
        await browserManager.releaseBrowser(browser);
      }
    }
  }

  /**
   * Create the appropriate strategy based on ATS type
   */
  private createStrategy(
    atsType: ATSType,
    page: Page,
    profile: any,
    onProgress: (step: number, total: number, message: string) => void
  ): BaseATSStrategy {
    switch (atsType) {
      case 'LINKEDIN_EASY_APPLY':
        return new LinkedInEasyApplyStrategy(page, profile, onProgress);
      case 'GREENHOUSE':
        return new GreenhouseStrategy(page, profile, onProgress);
      // Add more strategies as implemented
      // case 'WORKDAY':
      //   return new WorkdayStrategy(page, profile, onProgress);
      // case 'LEVER':
      //   return new LeverStrategy(page, profile, onProgress);
      default:
        return new GenericStrategy(page, profile, onProgress);
    }
  }

  /**
   * Emit progress update via Socket.IO
   */
  private emitProgress(
    userId: string,
    applicationId: string,
    step: number,
    total: number,
    message: string
  ): void {
    if (!this.io) return;

    const percentage = Math.round((step / total) * 100);
    this.io.to(`user:${userId}`).emit('automation:progress', {
      applicationId,
      step,
      totalSteps: total,
      percentage,
      message
    });
  }

  /**
   * Emit completion event via Socket.IO
   */
  private emitComplete(
    userId: string,
    applicationId: string,
    status: 'success' | 'failed',
    error?: string
  ): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('automation:complete', {
      applicationId,
      status,
      error
    });
  }

  /**
   * Capture a screenshot
   */
  private async captureScreenshot(
    page: Page,
    userId: string,
    applicationId: string,
    type: string
  ): Promise<string> {
    const filename = `screenshot-${type}-${Date.now()}.png`;
    const filepath = path.join(process.cwd(), 'uploads', 'screenshots', userId, applicationId, filename);

    // Create directory if needed
    const fs = await import('fs/promises');
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });

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
    }
  }

  /**
   * Get file path for resume or cover letter
   */
  private getFilePath(fileId: string, folder: string): string {
    return path.join(process.cwd(), 'uploads', folder, `${fileId}.pdf`);
  }
}

export const automationEngine = new AutomationEngine();
