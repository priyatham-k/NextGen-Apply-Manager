import mongoose, { Document, Schema } from 'mongoose';

// ─── Sub-schemas ────────────────────────────────────────────────

const personalInfoSchema = new Schema({
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  linkedin: String,
  github: String,
  portfolio: String,
  website: String
}, { _id: false });

const professionalSummarySchema = new Schema({
  summary: { type: String, maxlength: 1000 },
  yearsOfExperience: { type: Number, min: 0 },
  coreCompetencies: [String],
  specialization: String
}, { _id: false });

const workExperienceSchema = new Schema({
  company: { type: String, required: true },
  position: { type: String, required: true },
  location: String,
  startDate: Date,
  endDate: Date,
  current: { type: Boolean, default: false },
  description: String,
  achievements: [String],
  technologies: [String]
});

const projectSchema = new Schema({
  name: { type: String, required: true },
  description: String,
  role: String,
  technologies: [String],
  startDate: Date,
  endDate: Date,
  current: { type: Boolean, default: false },
  githubUrl: String,
  demoUrl: String
});

const educationSchema = new Schema({
  institution: { type: String, required: true },
  degree: { type: String, required: true },
  field: String,
  location: String,
  startDate: Date,
  endDate: Date,
  gpa: Number,
  achievements: [String]
});

const skillSchema = new Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['frontend', 'backend', 'database', 'devops', 'cloud', 'mobile', 'design', 'soft_skills', 'other'],
    required: true
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    required: true
  },
  yearsOfExperience: Number
}, { _id: false });

const certificationSchema = new Schema({
  name: { type: String, required: true },
  issuer: { type: String, required: true },
  issueDate: Date,
  expiryDate: Date,
  credentialId: String,
  credentialUrl: String
});

const awardSchema = new Schema({
  title: { type: String, required: true },
  issuer: String,
  date: Date,
  description: String
});

const publicationSchema = new Schema({
  title: { type: String, required: true },
  publisher: String,
  publishDate: Date,
  url: String,
  authors: [String]
});

const languageSchema = new Schema({
  name: { type: String, required: true },
  proficiency: {
    type: String,
    enum: ['elementary', 'limited_working', 'professional_working', 'full_professional', 'native'],
    required: true
  }
}, { _id: false });

const volunteerExperienceSchema = new Schema({
  organization: { type: String, required: true },
  role: { type: String, required: true },
  startDate: Date,
  endDate: Date,
  current: { type: Boolean, default: false },
  description: String
});

// ─── Main Profile Schema ────────────────────────────────────────

export interface IProfile extends Document {
  userId: mongoose.Types.ObjectId;
  personalInfo: {
    firstName: string;
    middleName?: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
      zipCode?: string;
    };
    linkedin?: string;
    github?: string;
    portfolio?: string;
    website?: string;
  };
  professionalSummary?: {
    summary?: string;
    yearsOfExperience?: number;
    coreCompetencies?: string[];
    specialization?: string;
  };
  workExperience: any[];
  projects: any[];
  education: any[];
  skills: any[];
  certifications: any[];
  additionalInfo: {
    awards: any[];
    publications: any[];
    languages: any[];
    volunteerExperience: any[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    personalInfo: {
      type: personalInfoSchema,
      required: true
    },
    professionalSummary: professionalSummarySchema,
    workExperience: [workExperienceSchema],
    projects: [projectSchema],
    education: [educationSchema],
    skills: [skillSchema],
    certifications: [certificationSchema],
    additionalInfo: {
      awards: [awardSchema],
      publications: [publicationSchema],
      languages: [languageSchema],
      volunteerExperience: [volunteerExperienceSchema]
    }
  },
  {
    timestamps: true
  }
);

export const Profile = mongoose.model<IProfile>('Profile', profileSchema);
