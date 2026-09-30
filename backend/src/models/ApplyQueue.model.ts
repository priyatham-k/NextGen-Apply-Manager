import mongoose, { Document, Schema } from 'mongoose';
import { LogLevel } from './Application.model';

/**
 * The extension-driven apply flow (isolated from the Puppeteer autopilot):
 * a daily queue of matched jobs that the user applies to in their own Chrome,
 * with the extension filling each form and the user clicking Submit.
 */

export enum QueueItemStatus {
  QUEUED = 'queued',
  OPENED = 'opened',       // the job's form is open in the user's browser
  FILLED = 'filled',       // the extension filled what it could
  SUBMITTED = 'submitted', // confirmation detected, or the user marked it submitted
  SKIPPED = 'skipped'
}

export interface QueueStep {
  at: Date;
  message: string;
  level: LogLevel;
}

export interface IApplyQueueItem extends Document {
  userId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  /** Local date (YYYY-MM-DD) of the queue this item belongs to */
  queueDate: string;
  position: number;
  matchScore: number;
  matchReason?: string;
  formUrl: string;
  status: QueueItemStatus;
  /** Fields the extension could not fill (shown in the panel and the app) */
  missingFields: string[];
  filledCount: number;
  steps: QueueStep[];
  /** Created in Applications when the item is submitted */
  applicationId?: mongoose.Types.ObjectId;
  openedAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema = {
  _id: false,
  at: { type: Date, default: Date.now },
  message: { type: String, required: true },
  level: { type: String, enum: ['info', 'success', 'warn', 'error'], default: 'info' }
};

const applyQueueItemSchema = new Schema<IApplyQueueItem>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    queueDate: { type: String, required: true },
    position: { type: Number, required: true },
    matchScore: { type: Number, required: true },
    matchReason: { type: String },
    formUrl: { type: String, required: true },
    status: { type: String, enum: Object.values(QueueItemStatus), default: QueueItemStatus.QUEUED },
    missingFields: [{ type: String }],
    filledCount: { type: Number, default: 0 },
    steps: [stepSchema],
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application' },
    openedAt: { type: Date },
    submittedAt: { type: Date }
  },
  { timestamps: true }
);

// A job is queued at most once per user
applyQueueItemSchema.index({ userId: 1, jobId: 1 }, { unique: true });
applyQueueItemSchema.index({ userId: 1, queueDate: 1, position: 1 });

export const ApplyQueueItem = mongoose.model<IApplyQueueItem>('ApplyQueueItem', applyQueueItemSchema);

export type QueueBuildPhase = 'start' | 'fetch' | 'match' | 'queue' | 'done';

export interface IQueueBuild extends Document {
  userId: mongoose.Types.ObjectId;
  trigger: 'schedule' | 'manual';
  queueDate: string;
  startedAt: Date;
  finishedAt?: Date;
  queued: number;
  error?: string;
  steps: (QueueStep & { phase: QueueBuildPhase })[];
}

const queueBuildSchema = new Schema<IQueueBuild>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trigger: { type: String, enum: ['schedule', 'manual'], required: true },
    queueDate: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    queued: { type: Number, default: 0 },
    error: { type: String },
    steps: [{ ...stepSchema, phase: { type: String, enum: ['start', 'fetch', 'match', 'queue', 'done'], required: true } }]
  },
  { timestamps: true }
);

export const QueueBuild = mongoose.model<IQueueBuild>('QueueBuild', queueBuildSchema);
