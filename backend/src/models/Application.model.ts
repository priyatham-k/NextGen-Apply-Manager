import mongoose, { Document, Schema } from 'mongoose';

export enum ApplicationStatus {
  PENDING = 'pending',
  // Form filled by automation, waiting for the user to approve submission
  AWAITING_REVIEW = 'awaiting_review',
  SUBMITTED = 'submitted',
  // Submit was clicked but no confirmation message was detected
  UNCONFIRMED = 'unconfirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  IN_REVIEW = 'in_review',
  REJECTED = 'rejected',
  INTERVIEW_SCHEDULED = 'interview_scheduled',
  OFFER_RECEIVED = 'offer_received',
  ACCEPTED = 'accepted',
  DECLINED = 'declined'
}

export enum SubmissionType {
  AUTOMATED = 'automated',
  MANUAL = 'manual',
  HYBRID = 'hybrid'
}

export enum ATSType {
  WORKDAY = 'workday',
  GREENHOUSE = 'greenhouse',
  LEVER = 'lever',
  ASHBY = 'ashby',
  SMARTRECRUITERS = 'smartrecruiters',
  WORKABLE = 'workable',
  BAMBOOHR = 'bamboohr',
  TALEO = 'taleo',
  ICIMS = 'icims',
  JOBVITE = 'jobvite',
  GENERIC = 'generic',
  UNKNOWN = 'unknown'
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface AutomationLogEntry {
  at: Date;
  step?: number;
  message: string;
  level: LogLevel;
}

export interface IApplication extends Document {
  userId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  resumeId?: string;
  coverLetterId?: string;
  status: ApplicationStatus;
  appliedDate: Date;
  submittedAt?: Date; // When automation completed successfully
  submissionType: SubmissionType;
  atsType?: ATSType;
  notes?: string;
  screenshots?: string[];
  errorLog?: string;
  /** Every automation step, shown to the user as a progress timeline */
  automationLog?: AutomationLogEntry[];
  interviewDate?: Date;
  followUpDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true
    },
    resumeId: {
      type: String,
      required: false
    },
    coverLetterId: { type: String },
    status: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.PENDING
    },
    appliedDate: {
      type: Date,
      default: Date.now
    },
    submittedAt: { type: Date }, // When automation completed successfully
    submissionType: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.MANUAL
    },
    atsType: {
      type: String,
      enum: Object.values(ATSType)
    },
    notes: { type: String },
    screenshots: [{ type: String }],
    errorLog: { type: String },
    automationLog: [{
      _id: false,
      at: { type: Date, default: Date.now },
      step: { type: Number },
      message: { type: String, required: true },
      level: { type: String, enum: ['info', 'success', 'warn', 'error'], default: 'info' }
    }],
    interviewDate: { type: Date },
    followUpDate: { type: Date }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc: any, ret: Record<string, any>) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
applicationSchema.index({ userId: 1, status: 1 });
applicationSchema.index({ appliedDate: -1 });

export const Application = mongoose.model<IApplication>('Application', applicationSchema);
