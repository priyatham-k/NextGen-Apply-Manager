export type ResumeTemplate = 'classic' | 'modern' | 'minimal' | 'professional';

export interface ResumeExperience {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface ResumeEducation {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ResumeData {
  _id?: string;
  title: string;
  template: ResumeTemplate;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  summary: string;
  experiences: ResumeExperience[];
  education: ResumeEducation[];
  skills: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResumeTemplateData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  summary: string;
  experiences: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
}

export const TEMPLATE_OPTIONS: { value: ResumeTemplate; label: string; icon: string; description: string }[] = [
  { value: 'classic', label: 'Classic', icon: 'bi-file-earmark-text', description: 'Centered header with blue accents' },
  { value: 'modern', label: 'Modern', icon: 'bi-layout-sidebar', description: 'Sidebar layout with dark panel' },
  { value: 'minimal', label: 'Minimal', icon: 'bi-file-earmark', description: 'Clean monochrome, elegant typography' },
  { value: 'professional', label: 'Professional', icon: 'bi-briefcase', description: 'Two-column header, serif accents' }
];
