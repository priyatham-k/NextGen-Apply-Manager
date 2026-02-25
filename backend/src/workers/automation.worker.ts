import { automationQueue } from '../config/bullQueue';
import { automationEngine } from '../services/automation/automationEngine.service';
import { logger } from '../config/logger';
import redisClient from '../config/redis';

// Wait for Redis to be ready before starting the worker
async function startWorker() {
  logger.info('🔄 Waiting for Redis connection before starting worker...');

  // Wait for Redis to be ready
  if (redisClient.status !== 'ready') {
    await new Promise<void>((resolve) => {
      redisClient.once('ready', () => {
        logger.info('✅ Redis is ready, starting worker...');
        resolve();
      });
    });
  } else {
    logger.info('✅ Redis already ready');
  }

  // Process automation jobs from the queue
  automationQueue.process(async (job) => {
    const { applicationId, userId, jobId, jobUrl, resumeId, coverLetterId } = job.data;

    logger.info(`🤖 [Worker] Processing automation job ${job.id} for application ${applicationId}`);

    try {
      await automationEngine.executeAutomation({
        applicationId,
        userId,
        jobId,
        jobUrl,
        resumeId,
        coverLetterId
      });

      logger.info(`✅ [Worker] Automation job ${job.id} completed for application ${applicationId}`);
      return { success: true, applicationId };

    } catch (error: any) {
      logger.error(`❌ [Worker] Automation job ${job.id} failed for application ${applicationId}: ${error.message}`);
      throw error; // Bull will handle retries
    }
  });

  // Queue event listeners
  automationQueue.on('completed', (job, result) => {
    logger.info(`✅ [Event] Job ${job.id} completed with result:`, result);
  });

  automationQueue.on('failed', (job, error) => {
    logger.error(`❌ [Event] Job ${job?.id} failed with error: ${error.message}`);
  });

  automationQueue.on('error', (error) => {
    logger.error(`❌ [Event] Queue error: ${error.message}`);
  });

  logger.info('✅ Automation worker started and listening for jobs');
}

// Start the worker
startWorker().catch((err) => {
  logger.error(`Failed to start automation worker: ${err.message}`);
});

export default automationQueue;
