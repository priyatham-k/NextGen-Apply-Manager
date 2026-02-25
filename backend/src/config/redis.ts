import Redis from 'ioredis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false // Changed to false - connect immediately
});

redisClient.on('connect', () => {
  logger.info('✅ Redis connected successfully');
});

redisClient.on('ready', () => {
  logger.info('✅ Redis is ready to accept commands');
});

redisClient.on('error', (err) => {
  logger.error(`Redis connection error: ${err.message}`);
});

redisClient.on('reconnecting', () => {
  logger.info('🔄 Redis reconnecting...');
});

export default redisClient;
