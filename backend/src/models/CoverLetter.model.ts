import mongoose, { Document, Schema } from 'mongoose';

export interface ICoverLetter extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  company: string;
  position: string;
  jobDescription: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const coverLetterSchema = new Schema<ICoverLetter>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
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
    position: {
      type: String,
      required: true,
      trim: true
    },
    jobDescription: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
coverLetterSchema.index({ userId: 1, createdAt: -1 });
coverLetterSchema.index({ userId: 1, company: 1, position: 1 });

export const CoverLetter = mongoose.model<ICoverLetter>('CoverLetter', coverLetterSchema);
