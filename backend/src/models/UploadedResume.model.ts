import mongoose, { Document, Schema } from 'mongoose';

export interface IUploadedResume extends Document {
  userId: mongoose.Types.ObjectId;
  filename: string; // Original filename
  storedFilename: string; // Filename on disk (e.g., userId-timestamp.pdf)
  filePath: string; // Full path to the file
  fileSize: number; // Size in bytes
  mimeType: string; // application/pdf
  isPrimary: boolean; // Is this the user's primary resume?
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const uploadedResumeSchema = new Schema<IUploadedResume>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    filename: {
      type: String,
      required: true
    },
    storedFilename: {
      type: String,
      required: true,
      unique: true
    },
    filePath: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true,
      default: 'application/pdf'
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
uploadedResumeSchema.index({ userId: 1, uploadedAt: -1 });
uploadedResumeSchema.index({ userId: 1, isPrimary: 1 });

export const UploadedResume = mongoose.model<IUploadedResume>('UploadedResume', uploadedResumeSchema);
