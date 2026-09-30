import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

/**
 * Error carrying an HTTP status code, for client errors raised outside controllers
 * (e.g. multer file filters) so the global error handler can respond correctly.
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Responds with 400 for Mongoose validation / cast errors caused by bad client input.
 * Returns true when a response was sent, so callers can `return` early from their catch block.
 */
export function handleClientDataError(res: Response, error: any): boolean {
  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(error.errors).map(e => e.message);
    res.status(400).json({
      success: false,
      message: `Validation failed: ${errors.join(', ')}`,
      errors
    });
    return true;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      message: `Invalid value for ${error.path}: ${JSON.stringify(error.value)}`
    });
    return true;
  }

  return false;
}

/**
 * router.param handler that rejects malformed MongoDB ObjectIds with 400
 * before they reach a controller.
 */
export function validateObjectIdParam(req: Request, res: Response, next: NextFunction, value: string, name: string): void {
  if (!mongoose.isValidObjectId(value)) {
    res.status(400).json({
      success: false,
      message: `Invalid ${name}: ${value}`
    });
    return;
  }
  next();
}
