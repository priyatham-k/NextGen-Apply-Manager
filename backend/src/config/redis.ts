import Redis from 'ioredis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export let redisAvailable = false;

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 5) {
      logger.warn('Redis: max retries reached, stopping reconnection attempts');
      return null; // Stop retrying
    }
    return Math.min(times * 1000, 5000);
  }
});

redisClient.on('connect', () => {
  logger.info('Redis connected successfully');
});

redisClient.on('ready', () => {
  redisAvailable = true;
  logger.info('Redis is ready to accept commands');
});

redisClient.on('error', (err) => {
  redisAvailable = false;
  logger.warn(`Redis connection error: ${err.message}`);
});

redisClient.on('close', () => {
  redisAvailable = false;
});

redisClient.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

// Attempt to connect but don't crash if unavailable
export async function connectRedis(): Promise<boolean> {
  try {
    await redisClient.connect();
    redisAvailable = true;
    return true;
  } catch (err: any) {
    logger.warn(`Redis not available: ${err.message}. Automation queue will be disabled.`);
    redisAvailable = false;
    return false;
  }
}

export default redisClient;
