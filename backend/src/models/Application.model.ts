import mongoose, { Document, Schema } from 'mongoose';

export enum ApplicationStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  FAILED = 'failed',
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
  TALEO = 'taleo',
  ICIMS = 'icims',
  JOBVITE = 'jobvite',
  GENERIC = 'generic',
  UNKNOWN = 'unknown'
}

export interface IApplication extends Document {
  userId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  resumeId: string;
  coverLetterId?: string;
  status: ApplicationStatus;
  appliedDate: Date;
  submissionType: SubmissionType;
  atsType?: ATSType;
  notes?: string;
  screenshots?: string[];
  errorLog?: string;
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
      required: true
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
