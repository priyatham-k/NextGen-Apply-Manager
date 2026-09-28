import mongoose, { Document, Schema } from 'mongoose';

export interface IUserSettings extends Document {
  userId: mongoose.Types.ObjectId;
  notifications: {
    emailNotifications: boolean;
    applicationUpdates: boolean;
    jobRecommendations: boolean;
    systemNotifications: boolean;
  };
  jobPreferences: {
    preferredJobTypes: string[];
    preferredLocations: string[];
    salaryMin?: number;
    salaryCurrency: string;
    willingToRelocate: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'private';
    showEmail: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    notifications: {
      emailNotifications: { type: Boolean, default: true },
      applicationUpdates: { type: Boolean, default: true },
      jobRecommendations: { type: Boolean, default: true },
      systemNotifications: { type: Boolean, default: true }
    },
    jobPreferences: {
      preferredJobTypes: { type: [String], default: [] },
      preferredLocations: { type: [String], default: [] },
      salaryMin: { type: Number },
      salaryCurrency: { type: String, default: 'USD' },
      willingToRelocate: { type: Boolean, default: false }
    },
    privacy: {
      profileVisibility: { type: String, enum: ['public', 'private'], default: 'private' },
      showEmail: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true
  }
);

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);
