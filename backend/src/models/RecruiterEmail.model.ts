import mongoose, { Document, Schema } from 'mongoose';

/**
 * An email from the user's Gmail inbox, classified by the recruiter inbox.
 * Only job opportunities get a drafted reply; the user reviews it and sends it (with the resume) from the app.
 */
export type RecruiterEmailCategory = 'job_opportunity' | 'application_update' | 'job_alert' | 'other';
export type RecruiterEmailStatus = 'ignored' | 'drafting' | 'draft_ready' | 'sending' | 'sent' | 'dismissed' | 'error';

export interface IRecruiterEmail extends Document {
  userId: mongoose.Types.ObjectId;
  /** Message-ID header: identifies the email across polls */
  messageId: string;
  references: string[];
  from: { name?: string; address: string };
  /** Reply-To when the email sets one, else the sender */
  replyTo: string;
  subject: string;
  receivedAt: Date;
  /** Plain-text body (shortened for emails that are not job opportunities) */
  text: string;
  category: RecruiterEmailCategory;
  /** Why the classifier decided this (shown in the app) */
  reason?: string;
  /** Possible scam signals (asks for money, bank details, SSN, chat apps...) */
  suspicious?: string;
  company?: string;
  position?: string;
  location?: string;
  status: RecruiterEmailStatus;
  draft?: { subject: string; body: string; generatedAt: Date };
  /** Things the profile could not answer; left as [brackets] in the draft */
  needsYou: string[];
  attachment?: { filename: string };
  sentAt?: Date;
  sentMessageId?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const recruiterEmailSchema = new Schema<IRecruiterEmail>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageId: { type: String, required: true },
    references: [String],
    from: { name: String, address: { type: String, required: true } },
    replyTo: { type: String, required: true },
    subject: { type: String, default: '' },
    receivedAt: { type: Date, required: true },
    text: { type: String, default: '' },
    category: { type: String, enum: ['job_opportunity', 'application_update', 'job_alert', 'other'], required: true },
    reason: String,
    suspicious: String,
    company: String,
    position: String,
    location: String,
    status: {
      type: String,
      enum: ['ignored', 'drafting', 'draft_ready', 'sending', 'sent', 'dismissed', 'error'],
      required: true
    },
    draft: { subject: String, body: String, generatedAt: Date },
    needsYou: [String],
    attachment: { filename: String },
    sentAt: Date,
    sentMessageId: String,
    error: String
  },
  { timestamps: true }
);

recruiterEmailSchema.index({ userId: 1, messageId: 1 }, { unique: true });
recruiterEmailSchema.index({ userId: 1, receivedAt: -1 });

export const RecruiterEmail = mongoose.model<IRecruiterEmail>('RecruiterEmail', recruiterEmailSchema);
