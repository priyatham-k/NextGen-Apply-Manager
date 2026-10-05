import { Request, Response } from 'express';
import { handleClientDataError } from '../utils/httpErrors';
import { Application, ApplicationStatus, SubmissionType } from '../models/Application.model';
import { Job } from '../models/Job.model';
import { Profile } from '../models/Profile.model';
import { logger } from '../config/logger';
import { profileCompletionService } from '../services/profileCompletion.service';
import { localAutomationQueue } from '../services/automation/localAutomationQueue.service';
import { automationEngine } from '../services/automation/automationEngine.service';
import { isAutoApplySupported } from '../services/automation/atsDetector.service';
import { needsSponsorship } from '../services/workAuthorization.service';
import { runAutopilot, isAutopilotRunning, getAutopilotStatus, autopilotBlocker } from '../services/autopilot.service';

const MANUAL_APPLY_MESSAGE =
  'Auto Apply only works on company application forms (Greenhouse, Lever, Ashby). Please apply to this job manually.';

/** Why this candidate can't apply (posting needs citizenship / a Green Card / no sponsorship), or null */
function workAuthBlock(job: { workAuthRestriction?: string }, profile: unknown): string | null {
  return job.workAuthRestriction && needsSponsorship(profile)
    ? `Not applying: ${job.workAuthRestriction}, and your profile says you need visa sponsorship.`
    : null;
}

/** The URL automation should open, or null when the job can only be applied to manually */
function automationUrlFor(job: { atsApplyUrl?: string; applicationUrl?: string }): string | null {
  if (job.atsApplyUrl && isAutoApplySupported(job.atsApplyUrl)) return job.atsApplyUrl;
  if (isAutoApplySupported(job.applicationUrl)) return job.applicationUrl!;
  return null;
}

/**
 * POST /api/v1/automation/apply
 * Submit a single job application for automation
 */
export const applyToJob = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { jobId, resumeId, coverLetterId } = req.body;

    // Check profile completion FIRST - critical for automation
    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Please create your profile before using Auto Apply',
        action: 'create_profile'
      });
    }

    const completionCheck = profileCompletionService.checkAutomationReadiness(profile);
    if (!completionCheck.isComplete) {
      const message = profileCompletionService.getCompletionMessage(completionCheck);
      return res.status(400).json({
        success: false,
        message,
        completionScore: completionCheck.completionScore,
        missingFields: completionCheck.missingFields,
        criticalMissing: completionCheck.criticalMissing,
        action: 'complete_profile'
      });
    }

    // Validate job exists and has application URL
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    const restricted = workAuthBlock(job, profile);
    if (restricted) {
      return res.status(400).json({ message: restricted, action: 'work_authorization' });
    }
    const jobUrl = automationUrlFor(job);
    if (!jobUrl) {
      return res.status(400).json({
        message: MANUAL_APPLY_MESSAGE,
        action: 'apply_manually',
        applicationUrl: job.applicationUrl
      });
    }

    // Check if already applied
    const existing = await Application.findOne({ userId, jobId });
    if (existing) {
      return res.status(400).json({ message: 'Already applied to this job' });
    }

    // Create application record with PENDING status
    const application = await Application.create({
      userId,
      jobId,
      resumeId,
      coverLetterId,
      status: ApplicationStatus.PENDING,
      submissionType: SubmissionType.AUTOMATED
    });

    // Add to automation queue
    localAutomationQueue.enqueue({
      applicationId: application._id.toString(),
      userId: userId.toString(),
      jobId: jobId.toString(),
      jobUrl,
      resumeId,
      coverLetterId
    });

    logger.info(`Accepted automation for application ${application._id}`);

    // Return 202 Accepted with application ID
    return res.status(202).json({
      message: 'Application accepted for automation',
      applicationId: application._id
    });

  } catch (error: any) {
    if (handleClientDataError(res, error)) return;
    logger.error(`Error starting automation: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to start automation',
      error: error.message
    });
  }
};

/**
 * POST /api/v1/automation/apply-bulk
 * Submit multiple job applications for automation
 */
export const applyToBulk = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { jobIds, resumeId, coverLetterId } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ message: 'jobIds array is required' });
    }

    // Check profile completion FIRST - critical for automation
    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Please create your profile before using Auto Apply',
        action: 'create_profile'
      });
    }

    const completionCheck = profileCompletionService.checkAutomationReadiness(profile);
    if (!completionCheck.isComplete) {
      const message = profileCompletionService.getCompletionMessage(completionCheck);
      return res.status(400).json({
        success: false,
        message,
        completionScore: completionCheck.completionScore,
        missingFields: completionCheck.missingFields,
        criticalMissing: completionCheck.criticalMissing,
        action: 'complete_profile'
      });
    }

    const applications = [];
    const errors = [];

    for (const jobId of jobIds) {
      try {
        // Validate job
        const job = await Job.findById(jobId);
        if (!job) {
          errors.push({ jobId, error: 'Job not found' });
          continue;
        }
        const restricted = workAuthBlock(job, profile);
        if (restricted) {
          errors.push({ jobId, error: restricted });
          continue;
        }
        const jobUrl = automationUrlFor(job);
        if (!jobUrl) {
          errors.push({ jobId, error: MANUAL_APPLY_MESSAGE });
          continue;
        }

        // Check if already applied
        const existing = await Application.findOne({ userId, jobId });
        if (existing) {
          errors.push({ jobId, error: 'Already applied' });
          continue;
        }

        // Create application
        const application = await Application.create({
          userId,
          jobId,
          resumeId,
          coverLetterId,
          status: ApplicationStatus.PENDING,
          submissionType: SubmissionType.AUTOMATED
        });

        // Add to queue
        localAutomationQueue.enqueue({
          applicationId: application._id.toString(),
          userId: userId.toString(),
          jobId: jobId.toString(),
          jobUrl,
          resumeId,
          coverLetterId
        });

        applications.push(application);

      } catch (error: any) {
        errors.push({ jobId, error: error.message });
      }
    }

    logger.info(`📋 Queued ${applications.length} applications for automation`);

    return res.status(202).json({
      message: `${applications.length} applications queued`,
      applications,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    if (handleClientDataError(res, error)) return;
    logger.error(`Error queueing bulk automation: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to queue bulk automation',
      error: error.message
    });
  }
};

/**
 * GET /api/v1/automation/status/:applicationId
 * Get automation status for an application
 */
export const getAutomationStatus = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user owns this application
    if (application.userId.toString() !== req.user!.userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return res.json({
      applicationId: application._id,
      status: application.status,
      submissionType: application.submissionType,
      atsType: application.atsType,
      errorLog: application.errorLog,
      screenshots: application.screenshots,
      submittedAt: application.submittedAt
    });

  } catch (error: any) {
    logger.error(`Error getting automation status: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to get status',
      error: error.message
    });
  }
};

/**
 * POST /api/v1/automation/retry/:applicationId
 * Retry a failed automation
 */
export const retryAutomation = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findById(applicationId).populate('jobId');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user owns this application
    if (application.userId.toString() !== req.user!.userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (![ApplicationStatus.FAILED, ApplicationStatus.UNCONFIRMED, ApplicationStatus.CANCELLED].includes(application.status)) {
      return res.status(400).json({ message: 'Can only retry failed, unconfirmed or cancelled applications' });
    }

    const job = application.jobId as any;
    const jobUrl = job ? automationUrlFor(job) : null;
    if (!jobUrl) {
      return res.status(400).json({ message: MANUAL_APPLY_MESSAGE, action: 'apply_manually' });
    }

    // Reset status and re-queue
    await Application.findByIdAndUpdate(applicationId, {
      status: ApplicationStatus.PENDING,
      errorLog: null,
      screenshots: [],
      automationLog: []
    });

    localAutomationQueue.enqueue({
      applicationId: application._id.toString(),
      userId: application.userId.toString(),
      jobId: job._id.toString(),
      jobUrl,
      resumeId: application.resumeId,
      coverLetterId: application.coverLetterId
    });

    logger.info(`🔄 Retrying automation for application ${applicationId}`);

    return res.json({ message: 'Application re-queued for automation' });

  } catch (error: any) {
    logger.error(`Error retrying automation: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to retry',
      error: error.message
    });
  }
};

/**
 * DELETE /api/v1/automation/cancel/:applicationId
 * Cancel a pending automation
 */
export const cancelAutomation = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if user owns this application
    if (application.userId.toString() !== req.user!.userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Find job in queue
    if (localAutomationQueue.cancel(applicationId)) {
      await Application.findByIdAndUpdate(applicationId, {
        status: ApplicationStatus.CANCELLED
      });

      logger.info(`❌ Cancelled automation for application ${applicationId}`);

      return res.json({ message: 'Automation cancelled' });
    }

    return res.status(409).json({
      message: localAutomationQueue.isActive(applicationId)
        ? 'Automation is already running and cannot be cancelled'
        : 'Application is not waiting in the automation queue'
    });

  } catch (error: any) {
    logger.error(`Error cancelling automation: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to cancel',
      error: error.message
    });
  }
};

/**
 * POST /api/v1/automation/submit/:applicationId
 * Submit a filled form after the user has reviewed it
 */
export const submitReviewedApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    if (application.userId.toString() !== req.user!.userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!automationEngine.hasPendingReview(applicationId)) {
      return res.status(409).json({ message: 'This form is no longer open. Retry the automation to fill it again.' });
    }

    const status = await automationEngine.submitReviewed(applicationId);
    const messages: Partial<Record<ApplicationStatus, string>> = {
      [ApplicationStatus.SUBMITTED]: 'Application submitted successfully',
      [ApplicationStatus.AWAITING_REVIEW]: 'The site needs you to finish this one (e.g. a verification code). The tab is still open.'
    };
    return res.json({
      status,
      message: messages[status] || 'Submit was clicked, but no confirmation appeared. Check the screenshot.'
    });

  } catch (error: any) {
    logger.error(`Error submitting reviewed application: ${error.message}`);
    return res.status(500).json({ message: 'Failed to submit application', error: error.message });
  }
};

/** Loads an application and checks it belongs to the requesting user; sends the error response otherwise */
async function ownApplication(req: Request, res: Response) {
  const application = await Application.findById(req.params.applicationId);
  if (!application) {
    res.status(404).json({ message: 'Application not found' });
    return null;
  }
  if (application.userId.toString() !== req.user!.userId.toString()) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }
  return application;
}

/**
 * POST /api/v1/automation/confirm-submitted/:applicationId
 * The user finished the application in the held tab (e.g. entered an email code) — record it
 */
export const confirmSubmittedByUser = async (req: Request, res: Response) => {
  try {
    if (!(await ownApplication(req, res))) return;
    const { applicationId } = req.params;
    if (!automationEngine.hasPendingReview(applicationId)) {
      return res.status(409).json({ message: 'This form is no longer open.' });
    }
    const { confirmationSeen } = await automationEngine.confirmSubmittedByUser(applicationId);
    return res.json({
      status: ApplicationStatus.SUBMITTED,
      message: confirmationSeen
        ? 'Marked as submitted — the confirmation page was detected'
        : 'Marked as submitted. No confirmation page was detected, so double-check your email for the company\'s confirmation.'
    });
  } catch (error: any) {
    logger.error(`Error confirming user submission: ${error.message}`);
    return res.status(500).json({ message: 'Failed to update the application', error: error.message });
  }
};

/**
 * POST /api/v1/automation/focus/:applicationId
 * Bring the held tab to the front of the automation browser window
 */
export const focusHeldTab = async (req: Request, res: Response) => {
  try {
    if (!(await ownApplication(req, res))) return;
    await automationEngine.focusReview(req.params.applicationId);
    return res.json({ message: 'The tab is now in front in the automation browser window' });
  } catch (error: any) {
    return res.status(409).json({ message: error.message });
  }
};

/**
 * POST /api/v1/automation/discard/:applicationId
 * Close a filled form without submitting
 */
export const discardReviewedApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    if (application.userId.toString() !== req.user!.userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (automationEngine.hasPendingReview(applicationId)) {
      await automationEngine.discardReview(applicationId);
    } else if (application.status === ApplicationStatus.AWAITING_REVIEW) {
      await Application.findByIdAndUpdate(applicationId, { status: ApplicationStatus.CANCELLED });
    }

    return res.json({ message: 'Application discarded without submitting' });

  } catch (error: any) {
    logger.error(`Error discarding application: ${error.message}`);
    return res.status(500).json({ message: 'Failed to discard application', error: error.message });
  }
};

/**
 * GET /api/v1/automation/queue/stats
 * Get queue statistics
 */
export const getQueueStats = async (req: Request, res: Response) => {
  try {
    return res.json(localAutomationQueue.stats());

  } catch (error: any) {
    logger.error(`Error getting queue stats: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to get queue stats',
      error: error.message
    });
  }
};

/**
 * POST /api/v1/automation/autopilot/run
 * Run the autopilot now for the current user (fetch → match → queue). Runs in the background.
 */
export const runAutopilotNow = async (req: Request, res: Response) => {
  if (isAutopilotRunning()) {
    return res.status(409).json({ message: 'Autopilot is already running' });
  }

  const userId = req.user!.userId.toString();
  try {
    // Fail fast: fetching and scoring take minutes, so check readiness first
    const blocker = await autopilotBlocker(userId);
    if (blocker) {
      return res.status(400).json({ message: blocker, action: 'complete_profile' });
    }
  } catch (error: any) {
    logger.error(`Error checking autopilot readiness: ${error.message}`);
    return res.status(500).json({ message: 'Failed to start autopilot', error: error.message });
  }

  runAutopilot('manual', userId).catch(error => logger.error(`Manual autopilot run failed: ${error.message}`));
  return res.status(202).json({
    message: 'Autopilot started: fetching jobs, scoring matches and applying. This takes a few minutes.'
  });
};

/**
 * GET /api/v1/automation/autopilot/status
 */
export const getAutopilotStatusHandler = async (req: Request, res: Response) => {
  try {
    return res.json(await getAutopilotStatus(req.user!.userId.toString()));
  } catch (error: any) {
    logger.error(`Error getting autopilot status: ${error.message}`);
    return res.status(500).json({ message: 'Failed to get autopilot status', error: error.message });
  }
};
