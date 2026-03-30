import Queue from 'bull';
import redisClient, { redisAvailable } from './redis';
import { logger } from './logger';

export interface AutomationJobData {
  applicationId: string;
  userId: string;
  jobId: string;
  jobUrl: string;
  resumeId?: string;
  coverLetterId?: string;
}

let _automationQueue: Queue.Queue<AutomationJobData> | null = null;

export function getAutomationQueue(): Queue.Queue<AutomationJobData> | null {
  return _automationQueue;
}

export function initializeQueue(): Queue.Queue<AutomationJobData> | null {
  if (!redisAvailable) {
    logger.warn('Redis not available — automation queue disabled');
    return null;
  }

  _automationQueue = new Queue<AutomationJobData>('job-automation', {
    createClient: (type) => {
      switch (type) {
        case 'client':
          return redisClient;
        case 'subscriber':
          return redisClient.duplicate();
        case 'bclient':
          return redisClient.duplicate();
        default:
          return redisClient;
      }
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 200,
      timeout: 300000 // 5 minutes max per job
    }
  });

  _automationQueue.on('error', (error) => {
    logger.error(`Queue error: ${error.message}`);
  });

  _automationQueue.on('waiting', (jobId) => {
    logger.info(`Job ${jobId} is waiting`);
  });

  _automationQueue.on('active', (job) => {
    logger.info(`Job ${job.id} started processing`);
  });

  _automationQueue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  _automationQueue.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('Bull queue initialized');
  return _automationQueue;
}

