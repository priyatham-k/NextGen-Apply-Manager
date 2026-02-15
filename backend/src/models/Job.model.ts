import mongoose, { Document, Schema } from 'mongoose';

export enum JobType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance'
}

export enum ExperienceLevel {
  ENTRY = 'entry',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
  EXECUTIVE = 'executive'
}

export enum JobStatus {
  NEW = 'new',
  REVIEWED = 'reviewed',
  APPLIED = 'applied',
  REJECTED = 'rejected',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  EXPIRED = 'expired'
}

export interface IJob extends Document {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary?: {
    min?: number;
    max?: number;
    currency: string;
  };
  description: string;
  requirements: string[];
  benefits?: string[];
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  applicationUrl: string;
  companyWebsite?: string;
  companyLogo?: string;
  source: string;
  sourceId: string;
  postedDate: Date;
  expiryDate?: Date;
  matchScore?: number;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    company: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      required: true,
      trim: true
    },
    remote: {
      type: Boolean,
      default: false
    },
    salary: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: 'USD' }
    },
    description: {
      type: String,
      required: true
    },
    requirements: [{ type: String }],
    benefits: [{ type: String }],
    jobType: {
      type: String,
      enum: Object.values(JobType),
      default: JobType.FULL_TIME
    },
    experienceLevel: {
      type: String,
      enum: Object.values(ExperienceLevel),
      default: ExperienceLevel.MID
    },
    applicationUrl: {
      type: String,
      required: true
    },
    companyWebsite: { type: String },
    companyLogo: { type: String },
    source: {
      type: String,
      required: true
    },
    sourceId: {
      type: String,
      required: true
    },
    postedDate: {
      type: Date,
      default: Date.now
    },
    expiryDate: { type: Date },
    matchScore: {
      type: Number,
      min: 0,
      max: 100
    },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.NEW
    }
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

// Indexes
jobSchema.index({ source: 1, sourceId: 1 }, { unique: true });
jobSchema.index({ title: 'text', company: 'text', description: 'text' });
jobSchema.index({ postedDate: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ matchScore: -1 });
jobSchema.index({ jobType: 1, experienceLevel: 1, remote: 1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
