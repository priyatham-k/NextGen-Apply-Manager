export type StepLevel = 'info' | 'success' | 'warn' | 'error';

export interface QueueItem {
  id: string;
  position: number;
  status: 'queued' | 'opened' | 'filled' | 'submitted' | 'skipped';
  matchScore: number;
  formUrl: string;
  filledCount: number;
  missingFields: string[];
  job: { id: string; title: string; company: string; location?: string } | null;
}

export interface FillProfile {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: { street?: string; city?: string; state?: string; country?: string; zipCode?: string };
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  currentCompany?: string;
  currentTitle?: string;
  yearsOfExperience?: number;
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
  resumeFileName?: string | null;
}

export type QuestionType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'combobox' | 'yesno' | 'listbutton';

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
}

export interface Answer {
  values: string[];
  source: 'rule' | 'ai' | 'none';
}

export interface QueueEvent {
  type: 'opened' | 'filled' | 'submitted' | 'skipped' | 'step';
  message?: string;
  level?: StepLevel;
  filledCount?: number;
  missingFields?: string[];
}

/** Content script → background */
export type Request =
  /** href: the requesting frame's URL — inside the app, the job form is an iframe with its own "#nextgen-item=" */
  | { kind: 'context'; href?: string }
  | { kind: 'answers'; questions: FormQuestion[]; itemId?: string; job?: { title: string; company: string } }
  | { kind: 'resume' }
  | { kind: 'event'; itemId: string; event: QueueEvent }
  | { kind: 'next'; delayMs?: number }
  | { kind: 'setAutoNext'; value: boolean }
  // popup → background
  | { kind: 'pair'; code: string; apiUrl: string }
  | { kind: 'unpair' }
  | { kind: 'status' }
  | { kind: 'start' };

export interface Context {
  paired: boolean;
  item: QueueItem | null;
  profile: FillProfile | null;
  autoNext: boolean;
  /** Show per-question details in the panel (chrome.storage.local "debug": true) */
  debug: boolean;
  error?: string;
}

export const ITEM_HASH = 'nextgen-item=';
