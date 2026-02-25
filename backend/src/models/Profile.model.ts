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

// ─── Application Screening Questions (USA-specific) ─────────────

const screeningQuestionsSchema = new Schema({
  // Work Authorization
  workAuthorization: {
    type: String,
    enum: ['us_citizen', 'permanent_resident', 'work_visa', 'require_sponsorship', 'not_authorized'],
    required: false
  },
  requiresSponsorship: {
    type: Boolean,
    default: false
  },

  // Relocation & Availability
  willingToRelocate: {
    type: Boolean,
    default: false
  },
  preferredLocations: [String], // Cities/states willing to work in
  remoteWorkPreference: {
    type: String,
    enum: ['remote_only', 'hybrid', 'onsite', 'flexible'],
    default: 'flexible'
  },
  earliestStartDate: Date,
  noticePeriod: {
    type: String,
    enum: ['immediate', '2_weeks', '1_month', '2_months', '3_months'],
    default: '2_weeks'
  },

  // Compensation
  desiredSalary: {
    min: Number,
    max: Number,
    currency: { type: String, default: 'USD' }
  },
  currentSalary: {
    amount: Number,
    currency: { type: String, default: 'USD' }
  },

  // Security & Background
  securityClearance: {
    type: String,
    enum: ['none', 'confidential', 'secret', 'top_secret'],
    default: 'none'
  },
  willingToUndergoBackgroundCheck: {
    type: Boolean,
    default: true
  },
  willingToTakeDrugTest: {
    type: Boolean,
    default: true
  },

  // Legal & Compliance
  hasNonCompeteAgreement: {
    type: Boolean,
    default: false
  },
  hasConvictions: {
    type: Boolean,
    default: false
  },

  // EEO (Optional - for voluntary disclosure)
  eeoData: {
    veteranStatus: {
      type: String,
      enum: ['not_veteran', 'protected_veteran', 'not_protected_veteran', 'prefer_not_to_say'],
      default: 'prefer_not_to_say'
    },
    disabilityStatus: {
      type: String,
      enum: ['no_disability', 'has_disability', 'prefer_not_to_say'],
      default: 'prefer_not_to_say'
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'non_binary', 'prefer_not_to_say'],
      default: 'prefer_not_to_say'
    },
    ethnicity: {
      type: String,
      enum: [
        'hispanic_latino',
        'white',
        'black_african_american',
        'native_american',
        'asian',
        'pacific_islander',
        'two_or_more',
        'prefer_not_to_say'
      ],
      default: 'prefer_not_to_say'
    }
  }
}, { _id: false });

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
  screeningQuestions?: {
    workAuthorization?: string;
    requiresSponsorship?: boolean;
    willingToRelocate?: boolean;
    preferredLocations?: string[];
    remoteWorkPreference?: string;
    earliestStartDate?: Date;
    noticePeriod?: string;
    desiredSalary?: {
      min?: number;
      max?: number;
      currency?: string;
    };
    currentSalary?: {
      amount?: number;
      currency?: string;
    };
    securityClearance?: string;
    willingToUndergoBackgroundCheck?: boolean;
    willingToTakeDrugTest?: boolean;
    hasNonCompeteAgreement?: boolean;
    hasConvictions?: boolean;
    eeoData?: {
      veteranStatus?: string;
      disabilityStatus?: string;
      gender?: string;
      ethnicity?: string;
    };
  };
  additionalInfo: {
    awards: any[];
    publications: any[];
    languages: any[];
    volunteerExperience: any[];
  };
  profileCompletionScore?: number;
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
    screeningQuestions: screeningQuestionsSchema,
    additionalInfo: {
      awards: [awardSchema],
      publications: [publicationSchema],
      languages: [languageSchema],
      volunteerExperience: [volunteerExperienceSchema]
    },
    profileCompletionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// ─── Profile Completion Calculator ─────────────────────────────

profileSchema.methods.calculateCompletionScore = function(): number {
  let score = 0;
  let totalFields = 0;

  // Required fields (40 points)
  totalFields += 8;
  if (this.personalInfo?.firstName) score += 5;
  if (this.personalInfo?.lastName) score += 5;
  if (this.personalInfo?.email) score += 5;
  if (this.personalInfo?.phone) score += 5;
  if (this.personalInfo?.address?.city) score += 5;
  if (this.personalInfo?.address?.state) score += 5;
  if (this.personalInfo?.address?.country) score += 5;
  if (this.personalInfo?.address?.zipCode) score += 5;

  // Professional Summary (10 points)
  totalFields += 2;
  if (this.professionalSummary?.summary) score += 5;
  if (this.professionalSummary?.yearsOfExperience !== undefined) score += 5;

  // Work Experience (15 points)
  totalFields += 1;
  if (this.workExperience && this.workExperience.length > 0) score += 15;

  // Education (10 points)
  totalFields += 1;
  if (this.education && this.education.length > 0) score += 10;

  // Skills (10 points)
  totalFields += 1;
  if (this.skills && this.skills.length >= 5) score += 10;

  // Screening Questions (15 points) - CRITICAL for automation
  totalFields += 5;
  if (this.screeningQuestions?.workAuthorization) score += 5;
  if (this.screeningQuestions?.requiresSponsorship !== undefined) score += 2;
  if (this.screeningQuestions?.willingToRelocate !== undefined) score += 2;
  if (this.screeningQuestions?.desiredSalary?.min) score += 3;
  if (this.screeningQuestions?.earliestStartDate) score += 3;

  return Math.min(100, score);
};

// Auto-calculate completion score before saving
profileSchema.pre('save', function(next) {
  this.profileCompletionScore = this.calculateCompletionScore();
  next()
});

export const Profile = mongoose.model<IProfile>('Profile', profileSchema);
