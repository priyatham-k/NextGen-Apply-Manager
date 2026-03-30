import { Request, Response } from 'express';
import { getAutomationQueue } from '../config/bullQueue';
import { Application, ApplicationStatus, SubmissionType } from '../models/Application.model';
import { Job } from '../models/Job.model';
import { Profile } from '../models/Profile.model';
import { logger } from '../config/logger';
import { profileCompletionService } from '../services/profileCompletion.service';

/**
 * POST /api/v1/automation/apply
 * Queue a single job application for automation
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
    if (!job.applicationUrl) {
      return res.status(400).json({ message: 'Job application URL is required for automation' });
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
    const queue = getAutomationQueue();
    if (!queue) {
      await Application.findByIdAndDelete(application._id);
      return res.status(503).json({ message: 'Automation queue is not available. Please ensure Redis is running.' });
    }

    logger.info(`Adding job to queue for application ${application._id}`);

    const queueJob = await queue.add({
      applicationId: application._id.toString(),
      userId: userId.toString(),
      jobId: jobId.toString(),
      jobUrl: job.applicationUrl,
      resumeId,
      coverLetterId
    });

    logger.info(`Queued automation for application ${application._id}, Job ID: ${queueJob.id}`);

    // Return 202 Accepted with application ID
    return res.status(202).json({
      message: 'Application queued for automation',
      applicationId: application._id
    });

  } catch (error: any) {
    logger.error(`Error queueing automation: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to queue automation',
      error: error.message
    });
  }
};

/**
 * POST /api/v1/automation/apply-bulk
 * Queue multiple job applications for automation
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
        if (!job || !job.applicationUrl) {
          errors.push({ jobId, error: 'Job not found or missing application URL' });
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
        const queue = getAutomationQueue();
        if (!queue) {
          errors.push({ jobId, error: 'Automation queue not available' });
          continue;
        }
        await queue.add({
          applicationId: application._id.toString(),
          userId: userId.toString(),
          jobId: jobId.toString(),
          jobUrl: job.applicationUrl,
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

    if (application.status !== ApplicationStatus.FAILED) {
      return res.status(400).json({ message: 'Can only retry failed applications' });
    }

    const job = application.jobId as any;
    if (!job.applicationUrl) {
      return res.status(400).json({ message: 'Job application URL not found' });
    }

    // Reset status and re-queue
    await Application.findByIdAndUpdate(applicationId, {
      status: ApplicationStatus.PENDING,
      errorLog: null,
      screenshots: []
    });

    const retryQueue = getAutomationQueue();
    if (!retryQueue) {
      return res.status(503).json({ message: 'Automation queue not available' });
    }

    await retryQueue.add({
      applicationId: application._id.toString(),
      userId: application.userId.toString(),
      jobId: job._id.toString(),
      jobUrl: job.applicationUrl,
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
    const cancelQueue = getAutomationQueue();
    if (!cancelQueue) {
      return res.status(503).json({ message: 'Automation queue not available' });
    }

    const jobs = await cancelQueue.getJobs(['waiting', 'active', 'delayed']);
    const queueJob = jobs.find(j => j.data.applicationId === applicationId);

    if (queueJob) {
      await queueJob.remove();
      await Application.findByIdAndUpdate(applicationId, {
        status: ApplicationStatus.CANCELLED
      });

      logger.info(`❌ Cancelled automation for application ${applicationId}`);

      return res.json({ message: 'Automation cancelled' });
    }

    return res.status(404).json({ message: 'Job not found in queue' });

  } catch (error: any) {
    logger.error(`Error cancelling automation: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to cancel',
      error: error.message
    });
  }
};

/**
 * GET /api/v1/automation/queue/stats
 * Get queue statistics
 */
export const getQueueStats = async (req: Request, res: Response) => {
  try {
    const statsQueue = getAutomationQueue();
    if (!statsQueue) {
      return res.json({
        waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0,
        available: false
      });
    }

    const waiting = await statsQueue.getWaitingCount();
    const active = await statsQueue.getActiveCount();
    const completed = await statsQueue.getCompletedCount();
    const failed = await statsQueue.getFailedCount();
    const delayed = await statsQueue.getDelayedCount();

    return res.json({
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
      available: true
    });

  } catch (error: any) {
    logger.error(`Error getting queue stats: ${error.message}`);
    return res.status(500).json({
      message: 'Failed to get queue stats',
      error: error.message
    });
  }
};
