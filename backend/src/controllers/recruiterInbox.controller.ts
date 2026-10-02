import { Request, Response } from 'express';
import { logger } from '../config/logger';
import { RecruiterEmail } from '../models/RecruiterEmail.model';
import { checkInbox, recruiterInboxStatus, regenerateDraft, sendReply } from '../services/recruiterInbox.service';

const userIdOf = (req: Request) => req.user!.userId.toString();

/** GET /api/v1/recruiter-inbox?all=true — job emails (all emails with all=true) and the connection status */
export const getRecruiterInbox = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const filter: Record<string, unknown> = { userId };
    if (req.query.all !== 'true') filter.status = { $ne: 'ignored' };
    const [emails, status, ignoredCount] = await Promise.all([
      RecruiterEmail.find(filter).sort({ receivedAt: -1 }).limit(200).lean(),
      recruiterInboxStatus(userId),
      RecruiterEmail.countDocuments({ userId, status: 'ignored' })
    ]);
    return res.json({ emails, status, ignoredCount });
  } catch (error: any) {
    logger.error(`Error loading recruiter inbox: ${error.message}`);
    return res.status(500).json({ message: 'Failed to load the recruiter inbox', error: error.message });
  }
};

/** POST /api/v1/recruiter-inbox/check — reads Gmail now */
export const checkRecruiterInbox = async (req: Request, res: Response) => {
  try {
    const found = await checkInbox(userIdOf(req));
    return res.json({ found, message: found ? `${found} new recruiter email(s) with drafted replies` : 'No new recruiter emails' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

/** PATCH /api/v1/recruiter-inbox/:emailId — save edits to the draft */
export const updateDraft = async (req: Request, res: Response) => {
  const { subject, body } = req.body || {};
  if (typeof subject !== 'string' || typeof body !== 'string') {
    return res.status(400).json({ message: 'subject and body are required' });
  }
  const email = await RecruiterEmail.findOneAndUpdate(
    { _id: req.params.emailId, userId: userIdOf(req), status: { $in: ['draft_ready', 'error'] } },
    { $set: { 'draft.subject': subject.trim(), 'draft.body': body.trim() } },
    { new: true }
  );
  if (!email) return res.status(404).json({ message: 'Draft not found, or it was already sent' });
  return res.json({ email });
};

/** POST /api/v1/recruiter-inbox/:emailId/regenerate — writes the reply again (also turns an ignored email into a job one) */
export const regenerate = async (req: Request, res: Response) => {
  try {
    const email = await regenerateDraft(userIdOf(req), req.params.emailId);
    if (!email) return res.status(404).json({ message: 'Email not found' });
    return res.json({ email });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

/** POST /api/v1/recruiter-inbox/:emailId/send — sends the reviewed reply with the primary resume */
export const send = async (req: Request, res: Response) => {
  try {
    const email = await sendReply(userIdOf(req), req.params.emailId, req.body || {});
    if (!email) return res.status(404).json({ message: 'Email not found' });
    return res.json({ email, message: `Reply sent to ${email.replyTo}` });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

/** POST /api/v1/recruiter-inbox/:emailId/dismiss  and  /:emailId/restore */
export const setDismissed = (dismissed: boolean) => async (req: Request, res: Response) => {
  const email = await RecruiterEmail.findOne({ _id: req.params.emailId, userId: userIdOf(req) });
  if (!email) return res.status(404).json({ message: 'Email not found' });
  if (email.status === 'sent') return res.status(400).json({ message: 'This reply was already sent' });
  if (dismissed) {
    email.status = 'dismissed';
  } else {
    email.status = email.draft?.body ? 'draft_ready' : email.category === 'job_opportunity' ? 'error' : 'ignored';
  }
  await email.save();
  return res.json({ email });
};
