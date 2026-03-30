import { getAutomationQueue } from '../config/bullQueue';
import { automationEngine } from '../services/automation/automationEngine.service';
import { logger } from '../config/logger';

export function startWorker(): void {
  const queue = getAutomationQueue();

  if (!queue) {
    logger.warn('Automation worker not started: Redis/queue not available');
    return;
  }

  // Process automation jobs from the queue
  queue.process(async (job) => {
    const { applicationId, userId, jobId, jobUrl, resumeId, coverLetterId } = job.data;

    logger.info(`[Worker] Processing automation job ${job.id} for application ${applicationId}`);

    try {
      await automationEngine.executeAutomation({
        applicationId,
        userId,
        jobId,
        jobUrl,
        resumeId,
        coverLetterId
      });

      logger.info(`[Worker] Automation job ${job.id} completed for application ${applicationId}`);
      return { success: true, applicationId };

    } catch (error: any) {
      logger.error(`[Worker] Automation job ${job.id} failed for application ${applicationId}: ${error.message}`);
      throw error; // Bull will handle retries
    }
  });

  // Queue event listeners
  queue.on('completed', (job, result) => {
    logger.info(`[Event] Job ${job.id} completed with result:`, result);
  });

  queue.on('failed', (job, error) => {
    logger.error(`[Event] Job ${job?.id} failed with error: ${error.message}`);
  });

  queue.on('error', (error) => {
    logger.error(`[Event] Queue error: ${error.message}`);
  });

  logger.info('Automation worker started and listening for jobs');
}
