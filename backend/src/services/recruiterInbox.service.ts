import fs from 'fs';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser, AddressObject } from 'mailparser';
import { logger } from '../config/logger';
import { User } from '../models/User.model';
import { Profile } from '../models/Profile.model';
import { UploadedResume } from '../models/UploadedResume.model';
import { NotificationType } from '../models/Notification.model';
import { IRecruiterEmail, RecruiterEmail, RecruiterEmailCategory } from '../models/RecruiterEmail.model';
import { chatCompletion, parseJsonResponse } from './openai.service';
import { createNotification } from './notification.service';
import { profileForPrompt } from './automation/formQuestions.service';

/**
 * Recruiter inbox: reads the user's Gmail (IMAP, App Password), finds emails where a recruiter or company
 * reaches out about a job, and drafts a reply from the profile. The user reviews the draft in the app and
 * sends it from there (Gmail SMTP) with the primary resume attached. Nothing is sent automatically.
 */

const DAY = 24 * 60 * 60 * 1000;
const MAX_NEW_PER_CHECK = 40;
const CLASSIFY_BATCH = 8;
// Senders that are never a person writing about a job
const AUTOMATED_SENDER = /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|postmaster@|alerts?@|jobalerts|newsletter|digest@|updates?@|info@|marketing@/i;
const JOB_BOARD_ALERT = /linkedin\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|dice\.com|monster\.com|wellfound\.com|builtin\.com/i;
const PLACEHOLDER = /\[[^\]\n]{2,80}\]/;

export function recruiterInboxConfig() {
  const address = (process.env.SMTP_USER || '').trim().toLowerCase();
  // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop")
  const password = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  return {
    configured: !!(address && password),
    enabled: process.env.RECRUITER_INBOX_ENABLED !== 'false',
    address,
    password,
    pollMinutes: Math.max(2, Number(process.env.RECRUITER_INBOX_POLL_MINUTES) || 5),
    lookbackDays: Math.min(30, Math.max(1, Number(process.env.RECRUITER_INBOX_LOOKBACK_DAYS) || 3))
  };
}

const state: { checking: boolean; lastCheck?: Date; lastError?: string; lastFound?: number } = { checking: false };

/** The app user the Gmail inbox belongs to: the account with the same email, or the only account */
export async function inboxOwnerId(): Promise<string | null> {
  const { address } = recruiterInboxConfig();
  if (!address) return null;
  const owner = await User.findOne({ email: address }).select('_id').lean();
  if (owner) return owner._id.toString();
  const users = await User.find().select('_id').limit(2).lean();
  return users.length === 1 ? users[0]._id.toString() : null;
}

export async function recruiterInboxStatus(userId: string) {
  const config = recruiterInboxConfig();
  const ownerId = config.configured ? await inboxOwnerId() : null;
  return {
    configured: config.configured,
    enabled: config.enabled,
    address: config.address || null,
    isOwner: !!ownerId && ownerId === userId,
    pollMinutes: config.pollMinutes,
    checking: state.checking,
    lastCheck: state.lastCheck || null,
    lastError: state.lastError || null,
    lastFound: state.lastFound ?? null
  };
}

// ─── Reading Gmail ───────────────────────────────────────────────

interface IncomingEmail {
  messageId: string;
  references: string[];
  from: { name?: string; address: string };
  replyTo: string;
  subject: string;
  receivedAt: Date;
  text: string;
  bulk: boolean;
}

function firstAddress(value: AddressObject | AddressObject[] | undefined): { name?: string; address: string } | null {
  const list = Array.isArray(value) ? value.flatMap(v => v.value) : value?.value || [];
  const first = list.find(a => a.address);
  return first ? { name: first.name || undefined, address: first.address!.toLowerCase() } : null;
}

async function readNewEmails(userId: string): Promise<IncomingEmail[]> {
  const config = recruiterInboxConfig();
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: config.address, pass: config.password },
    logger: false
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const latest = await RecruiterEmail.findOne({ userId }).sort({ receivedAt: -1 }).select('receivedAt').lean();
    const since = latest ? new Date(latest.receivedAt.getTime() - DAY) : new Date(Date.now() - config.lookbackDays * DAY);
    const uids = ((await client.search({ since }, { uid: true })) || []).slice(-200);
    if (!uids.length) return [];

    // Envelopes first (cheap), then full bodies only for emails not seen before
    const envelopes: { uid: number; messageId: string }[] = [];
    for await (const message of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
      if (message.envelope?.messageId) envelopes.push({ uid: message.uid, messageId: message.envelope.messageId });
    }
    const known = new Set(await RecruiterEmail.distinct('messageId', { userId, messageId: { $in: envelopes.map(e => e.messageId) } }));
    const fresh = envelopes.filter(e => !known.has(e.messageId)).slice(-MAX_NEW_PER_CHECK);

    const emails: IncomingEmail[] = [];
    for (const { uid, messageId } of fresh) {
      // fetchOne reads with BODY.PEEK, so the email stays unread in Gmail
      const message = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
      if (!message || !message.source) continue;
      const parsed = await simpleParser(message.source);
      const from = firstAddress(parsed.from);
      if (!from) continue;
      const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
      const precedence = String(parsed.headers.get('precedence') || '');
      const internalDate = message.internalDate ? new Date(message.internalDate) : undefined;
      emails.push({
        messageId,
        references,
        from,
        replyTo: firstAddress(parsed.replyTo)?.address || from.address,
        subject: parsed.subject || '',
        receivedAt: parsed.date || internalDate || new Date(),
        text: (parsed.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000),
        bulk: parsed.headers.has('list-unsubscribe') || /bulk|list/i.test(precedence)
      });
    }
    return emails;
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

// ─── Classifying ─────────────────────────────────────────────────

interface Classification {
  category: RecruiterEmailCategory;
  reason?: string;
  company?: string;
  position?: string;
  location?: string;
  suspicious?: string;
}

const CLASSIFY_PROMPT = `You sort a job seeker's incoming emails.
Return JSON: {"emails": [{"id": "<id>", "category": "...", "reason": "<one short sentence>", "company": <string|null>, "position": <string|null>, "location": <string|null>, "suspicious": <string|null>}]}

Categories:
- "job_opportunity": a recruiter, hiring manager, staffing agency or company personally contacting the candidate about a specific job opening or role (asking about interest, resume, availability, rate, or a call). Agency recruiters sharing a requirement count.
- "application_update": about an application the candidate already submitted (confirmation, assessment, interview scheduling, rejection, offer).
- "job_alert": automated job recommendations, digests or newsletters from job boards or companies.
- "other": everything else.

"bulk": true means the email has mailing-list headers; that leans towards job_alert/other, but recruiter outreach tools also add them, so judge by the content.
"suspicious": a short reason if the email shows scam signs (asks for payment, bank details or SSN, check deposits, buying equipment, interviews only over Telegram/WhatsApp/Signal, an offer without any interview), else null.`;

async function classify(emails: IncomingEmail[]): Promise<Map<string, Classification>> {
  const result = new Map<string, Classification>();
  for (let i = 0; i < emails.length; i += CLASSIFY_BATCH) {
    const batch = emails.slice(i, i + CLASSIFY_BATCH);
    const content = await chatCompletion({
      system: CLASSIFY_PROMPT,
      user: JSON.stringify({
        emails: batch.map((e, index) => ({
          id: String(index), from: `${e.from.name || ''} <${e.from.address}>`, subject: e.subject, bulk: e.bulk, body: e.text.slice(0, 1500)
        }))
      }),
      temperature: 0,
      maxTokens: 2000,
      json: true
    });
    const parsed = parseJsonResponse<{ emails?: (Classification & { id: string })[] }>(content);
    for (const item of parsed.emails || []) {
      const email = batch[Number(item.id)];
      if (!email) continue;
      const category = ['job_opportunity', 'application_update', 'job_alert', 'other'].includes(item.category) ? item.category : 'other';
      result.set(email.messageId, {
        category,
        reason: item.reason || undefined,
        company: item.company || undefined,
        position: item.position || undefined,
        location: item.location || undefined,
        suspicious: item.suspicious || undefined
      });
    }
  }
  return result;
}

// ─── Drafting the reply ──────────────────────────────────────────

const DRAFT_PROMPT = `You write a reply email from a job candidate to a recruiter who contacted them about a position.
Use ONLY facts from candidateProfile. Return JSON: {"body": "<email body>", "needsYou": ["<short item>", ...]}

Rules:
- Plain text (no markdown), 120-220 words, professional and warm, first person.
- Greet the sender by first name when it is known.
- Thank them and say you are interested in the role (name the role and company when given).
- In 2-3 sentences connect the candidate's most relevant experience and skills to the role. Never invent employers, years, skills, degrees or certifications.
- Answer every direct question in the email from profile facts: work authorization and sponsorship (screeningQuestions.workAuthorization, requiresSponsorship, visaType), location/relocation/remote, notice period or availability, salary expectations (desiredSalary), years of experience.
- If a question cannot be answered from the profile (hourly rate, call times, references, anything missing), answer it in the body with a placeholder in square brackets such as "My expected rate is [your hourly rate]." Never guess and never skip or deflect the question ("happy to discuss" is not an answer).
- needsYou lists exactly the placeholders used in the body, e.g. ["[your hourly rate]"].
- Separate paragraphs with a blank line.
- If they ask for a call, offer to talk and use the placeholder [times you are available].
- Mention that the resume is attached.
- End with a signature using only what the profile has: full name, phone, email, LinkedIn URL.`;

function replySubject(subject: string): string {
  return /^\s*re:/i.test(subject) ? subject.trim() : `Re: ${subject.trim() || 'Your message'}`;
}

async function draftReply(email: IRecruiterEmail): Promise<void> {
  const profile = await Profile.findOne({ userId: email.userId });
  if (!profile) throw new Error('Create your profile first, so the reply can use your details');
  const resume = await UploadedResume.findOne({ userId: email.userId, isPrimary: true }).lean();

  const content = await chatCompletion({
    system: DRAFT_PROMPT,
    user: JSON.stringify({
      candidateProfile: profileForPrompt(profile),
      email: { from: `${email.from.name || ''} <${email.from.address}>`, subject: email.subject, body: email.text.slice(0, 6000) },
      attachedResume: resume?.filename || null
    }),
    temperature: 0.4,
    maxTokens: 1200,
    json: true
  });
  const parsed = parseJsonResponse<{ body?: string; needsYou?: string[] }>(content);
  if (!parsed.body?.trim()) throw new Error('The AI returned an empty reply');

  email.draft = { subject: replySubject(email.subject), body: parsed.body.trim(), generatedAt: new Date() };
  email.needsYou = (parsed.needsYou || []).filter(item => typeof item === 'string' && item.trim()).slice(0, 10);
  email.attachment = resume ? { filename: resume.filename } : undefined;
  email.status = 'draft_ready';
  email.error = undefined;
  await email.save();
}

// ─── Checking the inbox ──────────────────────────────────────────

/** Reads new emails, keeps the job opportunities and drafts replies. Returns how many job emails were found. */
export async function checkInbox(userId: string): Promise<number> {
  const config = recruiterInboxConfig();
  if (!config.configured) throw new Error('Add your Gmail address and App Password (SMTP_USER / SMTP_PASS) to .env first');
  if ((await inboxOwnerId()) !== userId) throw new Error(`The connected inbox (${config.address}) belongs to another account`);
  if (state.checking) throw new Error('The inbox is already being checked');

  state.checking = true;
  try {
    const emails = await readNewEmails(userId);
    const own = config.address;
    const automated = (e: IncomingEmail) => e.from.address === own || AUTOMATED_SENDER.test(e.from.address);
    const classifications = await classify(emails.filter(e => !automated(e)));

    let found = 0;
    for (const email of emails) {
      const result: Classification = automated(email)
        ? { category: JOB_BOARD_ALERT.test(email.from.address) ? 'job_alert' : 'other', reason: 'Automated sender' }
        : classifications.get(email.messageId) || { category: 'other', reason: 'Not classified' };
      const isJob = result.category === 'job_opportunity';
      const saved = await RecruiterEmail.findOneAndUpdate(
        { userId, messageId: email.messageId },
        {
          $setOnInsert: {
            ...email,
            userId,
            // Other emails keep enough text to be marked as a job later
            text: isJob ? email.text : email.text.slice(0, 6000),
            ...result,
            status: isJob ? 'drafting' : 'ignored',
            needsYou: []
          }
        },
        { upsert: true, new: true, rawResult: false }
      );
      if (!isJob || saved.status !== 'drafting') continue;
      found++;
      await draftReply(saved).catch(async error => {
        saved.status = 'error';
        saved.error = `Could not draft a reply: ${error.message}`;
        await saved.save();
      });
    }

    if (found) {
      await createNotification(userId, NotificationType.SYSTEM, 'Recruiter emails',
        `${found} recruiter email${found === 1 ? '' : 's'} with a drafted reply. Review and send from Recruiter Inbox.`);
    }
    state.lastFound = found;
    state.lastError = undefined;
    logger.info(`📬 Recruiter inbox: ${emails.length} new email(s), ${found} job opportunit${found === 1 ? 'y' : 'ies'}`);
    return found;
  } catch (error: any) {
    // IMAP auth failures carry the real reason in authenticationFailed / responseText
    const message = error.authenticationFailed
      ? 'Gmail rejected the login. Check SMTP_USER and the App Password (2-Step Verification must be on).'
      : error.responseText || error.message;
    state.lastError = message;
    throw new Error(message);
  } finally {
    state.checking = false;
    state.lastCheck = new Date();
  }
}

export async function regenerateDraft(userId: string, emailId: string): Promise<IRecruiterEmail | null> {
  const email = await RecruiterEmail.findOne({ _id: emailId, userId });
  if (!email) return null;
  if (email.status === 'sent') throw new Error('This reply was already sent');
  email.category = 'job_opportunity';
  email.status = 'drafting';
  await email.save();
  try {
    await draftReply(email);
  } catch (error: any) {
    email.status = 'error';
    email.error = `Could not draft a reply: ${error.message}`;
    await email.save();
  }
  return email;
}

// ─── Sending ─────────────────────────────────────────────────────

export async function sendReply(userId: string, emailId: string, edits: { subject?: string; body?: string }): Promise<IRecruiterEmail | null> {
  const email = await RecruiterEmail.findOne({ _id: emailId, userId });
  if (!email) return null;
  if (email.status === 'sent') throw new Error('This reply was already sent');
  if (email.status === 'sending') throw new Error('This reply is being sent');

  const subject = (edits.subject ?? email.draft?.subject ?? '').trim();
  const body = (edits.body ?? email.draft?.body ?? '').trim();
  if (!subject || !body) throw new Error('The reply needs a subject and a body');
  const placeholder = body.match(PLACEHOLDER);
  if (placeholder) throw new Error(`Fill in ${placeholder[0]} before sending`);

  const config = recruiterInboxConfig();
  if (!config.configured) throw new Error('Add your Gmail address and App Password (SMTP_USER / SMTP_PASS) to .env first');
  const resume = await UploadedResume.findOne({ userId, isPrimary: true }).lean();
  if (!resume || !fs.existsSync(resume.filePath)) throw new Error('Upload your resume (Profile → Resume) so it can be attached');
  const profile = await Profile.findOne({ userId }).select('personalInfo').lean();
  const name = [profile?.personalInfo?.firstName, profile?.personalInfo?.lastName].filter(Boolean).join(' ');

  email.draft = { subject, body, generatedAt: email.draft?.generatedAt || new Date() };
  email.status = 'sending';
  await email.save();
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: config.address, pass: config.password }
    });
    // Gmail files messages sent over SMTP in Sent and threads them with the original via In-Reply-To/References
    const info = await transporter.sendMail({
      from: name ? { name, address: config.address } : config.address,
      to: email.replyTo,
      subject,
      text: body,
      inReplyTo: email.messageId,
      references: [...email.references, email.messageId],
      attachments: [{ filename: resume.filename, path: resume.filePath, contentType: resume.mimeType }]
    });
    email.status = 'sent';
    email.sentAt = new Date();
    email.sentMessageId = info.messageId;
    email.attachment = { filename: resume.filename };
    email.error = undefined;
    await email.save();
    logger.info(`📤 Replied to ${email.replyTo} about "${email.subject}" with ${resume.filename}`);
    return email;
  } catch (error: any) {
    email.status = 'error';
    email.error = `Sending failed: ${error.response || error.message}`;
    await email.save();
    throw new Error(email.error);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────

export function startRecruiterInboxScheduler(): void {
  const config = recruiterInboxConfig();
  if (!config.enabled || !config.configured) {
    logger.info('📬 Recruiter inbox: off (set SMTP_USER and SMTP_PASS to a Gmail address and App Password to turn it on)');
    return;
  }
  const run = async () => {
    const ownerId = await inboxOwnerId();
    if (!ownerId) {
      state.lastError = `No app account matches ${config.address}`;
      return;
    }
    if (!state.checking) await checkInbox(ownerId);
  };
  logger.info(`📬 Recruiter inbox: checking ${config.address} every ${config.pollMinutes} minutes`);
  setTimeout(() => void run().catch(error => logger.warn(`Recruiter inbox check failed: ${error.message}`)), 30 * 1000);
  setInterval(() => void run().catch(error => logger.warn(`Recruiter inbox check failed: ${error.message}`)), config.pollMinutes * 60 * 1000);
}
