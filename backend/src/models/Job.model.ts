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
  url?: string; // Direct job page URL for automation
  atsApplyUrl?: string; // Company application form on a supported ATS (Greenhouse, Lever, Ashby)
  autoApplySupported: boolean;
  /** The Chrome extension can fill this job's form (a wider set of ATS than server-side automation) */
  extensionSupported: boolean;
  /** Set when the posting rules out candidates who need sponsorship (citizens / Green Card only, no sponsorship...) */
  workAuthRestriction?: string;
  /** The posting's words that set the restriction */
  workAuthEvidence?: string;
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
    url: { type: String }, // Direct job page URL for automation
    atsApplyUrl: { type: String },
    autoApplySupported: { type: Boolean, default: false },
    extensionSupported: { type: Boolean, default: false },
    workAuthRestriction: { type: String },
    workAuthEvidence: { type: String },
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
jobSchema.index(
  { title: 'text', company: 'text', location: 'text', description: 'text' },
  { name: 'job_text_search' }
);
jobSchema.index({ postedDate: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ matchScore: -1 });
jobSchema.index({ jobType: 1, experienceLevel: 1, remote: 1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);

/**
 * MongoDB allows one text index per collection, so an older text index without
 * `location` blocks autoIndex from creating the current one. Replace it if present.
 */
export async function ensureJobTextIndex(): Promise<void> {
  // createCollection is a no-op if it exists; listing indexes on a missing collection throws
  await Job.createCollection();
  const indexes = await Job.collection.indexes();
  const staleTextIndex = indexes.find(
    idx => idx.key?._fts === 'text' && idx.name !== 'job_text_search'
  );
  if (staleTextIndex?.name) {
    await Job.collection.dropIndex(staleTextIndex.name);
  }
  await Job.createIndexes();
}
