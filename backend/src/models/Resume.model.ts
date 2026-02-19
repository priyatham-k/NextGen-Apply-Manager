import mongoose, { Document, Schema } from 'mongoose';

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  template: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  summary: string;
  experiences: {
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
    description: string;
  }[];
  skills: string;
  createdAt: Date;
  updatedAt: Date;
}

const experienceSchema = new Schema(
  {
    company: { type: String, required: true },
    position: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String },
    current: { type: Boolean, default: false },
    description: { type: String, required: true }
  },
  { _id: false }
);

const educationSchema = new Schema(
  {
    school: { type: String, required: true },
    degree: { type: String, required: true },
    field: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String },
    description: { type: String }
  },
  { _id: false }
);

const resumeSchema = new Schema<IResume>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: { type: String, required: true },
    template: {
      type: String,
      enum: ['classic', 'modern', 'minimal', 'professional'],
      default: 'classic'
    },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    location: { type: String, required: true },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    website: { type: String, default: '' },
    summary: { type: String, required: true },
    experiences: [experienceSchema],
    education: [educationSchema],
    skills: { type: String, required: true }
  },
  {
    timestamps: true
  }
);

resumeSchema.index({ userId: 1, title: 1 }, { unique: true });
resumeSchema.index({ userId: 1, updatedAt: -1 });

export const Resume = mongoose.model<IResume>('Resume', resumeSchema);
