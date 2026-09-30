import mongoose, { Document, Schema } from 'mongoose';
import { LogLevel } from './Application.model';

export interface AutopilotUserResult {
  userId: string;
  queued: number;
  skippedReason?: string;
}

export type AutopilotPhase = 'start' | 'fetch' | 'match' | 'queue' | 'done';

export interface AutopilotStep {
  at: Date;
  phase: AutopilotPhase;
  message: string;
  level: LogLevel;
}

export interface IAutopilotRun extends Document {
  /** Local date (YYYY-MM-DD) of a scheduled run; manual runs use a unique key */
  runKey: string;
  trigger: 'schedule' | 'manual';
  /** Who started a manual run (scheduled runs cover every user) */
  userId?: string;
  startedAt: Date;
  finishedAt?: Date;
  results: AutopilotUserResult[];
  /** Progress timeline shown on the dashboard */
  steps: AutopilotStep[];
  /** Applications this run queued (their own steps live on each Application) */
  applicationIds: string[];
  error?: string;
}

const autopilotRunSchema = new Schema<IAutopilotRun>(
  {
    runKey: { type: String, required: true, unique: true },
    trigger: { type: String, enum: ['schedule', 'manual'], required: true },
    userId: { type: String },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    results: [{
      _id: false,
      userId: { type: String, required: true },
      queued: { type: Number, required: true },
      skippedReason: { type: String }
    }],
    steps: [{
      _id: false,
      at: { type: Date, default: Date.now },
      phase: { type: String, enum: ['start', 'fetch', 'match', 'queue', 'done'], required: true },
      message: { type: String, required: true },
      level: { type: String, enum: ['info', 'success', 'warn', 'error'], default: 'info' }
    }],
    applicationIds: [{ type: String }],
    error: { type: String }
  },
  { timestamps: true }
);

export const AutopilotRun = mongoose.model<IAutopilotRun>('AutopilotRun', autopilotRunSchema);
