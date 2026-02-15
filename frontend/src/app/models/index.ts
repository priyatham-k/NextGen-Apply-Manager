// User Model
export interface User {
  id: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  profilePicture?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Job Model
export interface Job {
  id: string;
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
  source: string; // API source
  sourceId: string; // ID from source API
  postedDate: Date;
  expiryDate?: Date;
  matchScore?: number;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

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

// Application Model
export interface Application {
  id: string;
  userId: string;
  jobId: string;
  job?: Job;
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

// Profile Model
export interface Profile {
  id: string;
  userId: string;
  personalInfo: PersonalInfo;
  professionalSummary?: ProfessionalSummary;
  workExperience: WorkExperience[];
  projects: Project[];
  education: Education[];
  skills: Skill[];
  certifications: Certification[];
  additionalInfo?: AdditionalInfo;
  preferences: JobPreferences;
  resumes: Resume[];
  coverLetters: CoverLetter[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country: string;
    zipCode?: string;
  };
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  location: string;
  startDate: Date;
  endDate?: Date;
  current: boolean;
  description: string;
  achievements: string[];
  technologies?: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location: string;
  startDate: Date;
  endDate?: Date;
  gpa?: number;
  achievements?: string[];
}

export interface Skill {
  name: string;
  category: SkillCategory;
  level: SkillLevel;
  yearsOfExperience?: number;
}

export enum SkillCategory {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  DATABASE = 'database',
  DEVOPS = 'devops',
  CLOUD = 'cloud',
  MOBILE = 'mobile',
  DESIGN = 'design',
  SOFT_SKILLS = 'soft_skills',
  OTHER = 'other'
}

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issueDate: Date;
  expiryDate?: Date;
  credentialId?: string;
  credentialUrl?: string;
}

export interface ProfessionalSummary {
  summary: string;
  yearsOfExperience: number;
  coreCompetencies: string[];
  specialization: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  role: string;
  technologies: string[];
  startDate: Date;
  endDate?: Date;
  current: boolean;
  githubUrl?: string;
  demoUrl?: string;
}

export interface Award {
  id: string;
  title: string;
  issuer: string;
  date: Date;
  description?: string;
}

export interface Publication {
  id: string;
  title: string;
  publisher: string;
  publishDate: Date;
  url?: string;
  authors?: string[];
}

export interface Language {
  name: string;
  proficiency: LanguageProficiency;
}

export enum LanguageProficiency {
  ELEMENTARY = 'elementary',
  LIMITED_WORKING = 'limited_working',
  PROFESSIONAL_WORKING = 'professional_working',
  FULL_PROFESSIONAL = 'full_professional',
  NATIVE = 'native'
}

export interface VolunteerExperience {
  id: string;
  organization: string;
  role: string;
  startDate: Date;
  endDate?: Date;
  current: boolean;
  description: string;
}

export interface AdditionalInfo {
  awards: Award[];
  publications: Publication[];
  languages: Language[];
  volunteerExperience: VolunteerExperience[];
}

export interface JobPreferences {
  jobTypes: JobType[];
  experienceLevels: ExperienceLevel[];
  locations: string[];
  remoteOnly: boolean;
  salaryMin?: number;
  salaryCurrency: string;
  keywords: string[];
  excludedCompanies?: string[];
  autoApplyThreshold: number; // Minimum match score to auto-apply
  maxApplicationsPerDay: number;
}

export interface Resume {
  id: string;
  name: string;
  filename: string;
  url: string;
  fileSize: number;
  uploadDate: Date;
  isDefault: boolean;
}

export interface CoverLetter {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics Models
export interface DashboardStats {
  totalJobs: number;
  totalApplications: number;
  successfulApplications: number;
  failedApplications: number;
  pendingApplications: number;
  averageMatchScore: number;
  applicationsToday: number;
  applicationsThisWeek: number;
  applicationsThisMonth: number;
  topCompanies: CompanyStats[];
  applicationsByStatus: StatusCount[];
  applicationTimeline: TimelineData[];
}

export interface CompanyStats {
  company: string;
  count: number;
  successRate: number;
}

export interface StatusCount {
  status: ApplicationStatus;
  count: number;
}

export interface TimelineData {
  date: string;
  applications: number;
  successful: number;
  failed: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ApiError[];
}

export interface ApiError {
  field?: string;
  message: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Filter & Search Types
export interface JobFilters {
  search?: string;
  jobTypes?: JobType[];
  experienceLevels?: ExperienceLevel[];
  locations?: string[];
  remote?: boolean;
  minSalary?: number;
  maxSalary?: number;
  minMatchScore?: number;
  status?: JobStatus[];
  companies?: string[];
  datePosted?: DateRange;
  sortBy?: 'matchScore' | 'postedDate' | 'salary' | 'company';
  sortOrder?: 'asc' | 'desc';
}

export interface ApplicationFilters {
  search?: string;
  status?: ApplicationStatus[];
  submissionType?: SubmissionType[];
  atsType?: ATSType[];
  dateRange?: DateRange;
  sortBy?: 'appliedDate' | 'status' | 'company';
  sortOrder?: 'asc' | 'desc';
}

export interface DateRange {
  start: Date;
  end: Date;
}
