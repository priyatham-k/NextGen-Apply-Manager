import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { HttpError } from '../utils/httpErrors';
import { logger } from '../config/logger';

// Global error handler for errors passed to next() or thrown by middleware (multer, body parser)
export default function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    res.status(400).json({ success: false, message });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }

  // body-parser errors (malformed JSON, payload too large) carry a 4xx status
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    res.status(status).json({ success: false, message: err.message });
    return;
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
}
