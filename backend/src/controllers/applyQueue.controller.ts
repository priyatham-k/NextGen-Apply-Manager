import { Request, Response } from 'express';
import fs from 'fs/promises';
import { Profile } from '../models/Profile.model';
import { ApplyQueueItem, QueueItemStatus } from '../models/ApplyQueue.model';
import { UploadedResume } from '../models/UploadedResume.model';
import { logger } from '../config/logger';
import {
  applyQueueConfig, buildQueue, getItem, getNextItem, getQueue, isBuilding, latestBuild, queueBlocker, recordQueueEvent, QueueEvent
} from '../services/applyQueue.service';
import {
  createPairingCode, listExtensionConnections, pairExtension, revokeExtensionConnection
} from '../services/extensionAuth.service';
import { FormQuestion, generateAnswers, ruleChoices } from '../services/automation/formQuestions.service';
import { browserLaunchStatus, launchNextGenChrome } from '../services/browserLauncher.service';

const userIdOf = (req: Request) => req.user!.userId.toString();

// ─── Web app (logged-in user) ────────────────────────────────────

/** GET /api/v1/apply-queue */
export const getApplyQueue = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const [items, build, extensions] = await Promise.all([getQueue(userId), latestBuild(userId), listExtensionConnections(userId)]);
    return res.json({
      items, build, building: isBuilding(userId), config: applyQueueConfig(), extensions, browserLaunch: browserLaunchStatus()
    });
  } catch (error: any) {
    logger.error(`Error loading apply queue: ${error.message}`);
    return res.status(500).json({ message: 'Failed to load the apply queue', error: error.message });
  }
};

/** POST /api/v1/apply-queue/build — builds in the background; progress is in the build's steps */
export const buildApplyQueue = async (req: Request, res: Response) => {
  const userId = userIdOf(req);
  if (isBuilding(userId)) return res.status(409).json({ message: 'The queue is already being built' });

  const blocker = await queueBlocker(userId).catch((error: Error) => error.message);
  if (blocker) return res.status(400).json({ message: blocker, action: 'complete_profile' });

  buildQueue(userId, 'manual').catch(error => logger.warn(`Queue build failed: ${error.message}`));
  return res.status(202).json({ message: 'Building your queue: fetching jobs and scoring matches. This takes a few minutes.' });
};

/** POST /api/v1/apply-queue/:itemId/skip  and  /:itemId/submitted */
export const markQueueItem = (type: 'skipped' | 'submitted') => async (req: Request, res: Response) => {
  try {
    const item = await recordQueueEvent(userIdOf(req), req.params.itemId, {
      type,
      message: type === 'submitted' ? 'Marked as submitted by you (from the app)' : 'Skipped by you'
    });
    if (!item) return res.status(404).json({ message: 'Queue item not found' });
    return res.json({ status: item.status });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to update the queue item', error: error.message });
  }
};

/** POST /api/v1/apply-queue/:itemId/requeue — put a skipped job back in the queue */
export const requeueItem = async (req: Request, res: Response) => {
  const item = await ApplyQueueItem.findOne({ _id: req.params.itemId, userId: userIdOf(req), status: QueueItemStatus.SKIPPED });
  if (!item) return res.status(404).json({ message: 'Skipped queue item not found' });
  item.status = QueueItemStatus.QUEUED;
  item.steps.push({ at: new Date(), message: 'Put back in the queue', level: 'info' });
  await item.save();
  return res.json({ status: item.status });
};

/** POST /api/v1/apply-queue/extension/pairing-code */
export const getPairingCode = async (req: Request, res: Response) => {
  try {
    return res.json(await createPairingCode(userIdOf(req)));
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to create a pairing code', error: error.message });
  }
};

/**
 * POST /api/v1/apply-queue/launch  { itemId? }
 * Opens the NextGen Chrome window on this computer at a queue job's form (or the next one).
 * If the extension isn't paired yet, the Apply Queue page opens too, carrying a pairing code.
 */
export const launchBrowser = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const status = browserLaunchStatus();
    if (!status.available) return res.status(409).json({ message: status.reason, action: 'use_own_browser' });

    const item = req.body?.itemId ? await getItem(userId, req.body.itemId) : await getNextItem(userId);
    const urls: string[] = [];

    const appUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/+$/, '');
    const connections = await listExtensionConnections(userId);
    if (!connections.length) {
      const { code } = await createPairingCode(userId);
      urls.push(`${appUrl}/apply-queue?nextgenPair=${encodeURIComponent(code)}`);
    }
    if (item) urls.push(`${item.formUrl.split('#')[0]}#nextgen-item=${item.id}`);
    if (!urls.length) urls.push(`${appUrl}/apply-queue`);

    launchNextGenChrome(urls);
    return res.json({
      message: item
        ? `Opened ${item.job?.title || 'the job'} in NextGen Chrome — the form is being filled`
        : 'Opened NextGen Chrome',
      paired: connections.length > 0
    });
  } catch (error: any) {
    logger.error(`Launch browser error: ${error.message}`);
    return res.status(500).json({ message: `Couldn't open NextGen Chrome: ${error.message}` });
  }
};

/** DELETE /api/v1/apply-queue/extension/:connectionId */
export const revokeExtension = async (req: Request, res: Response) => {
  const revoked = await revokeExtensionConnection(userIdOf(req), req.params.connectionId);
  return revoked ? res.json({ message: 'Extension disconnected' }) : res.status(404).json({ message: 'Connection not found' });
};

// ─── Chrome extension ────────────────────────────────────────────

/** POST /api/v1/extension/pair  { code } → { token } (public: the code is the credential) */
export const pairExtensionHandler = async (req: Request, res: Response) => {
  const token = await pairExtension(req.body?.code, req.body?.label);
  if (!token) return res.status(400).json({ message: 'That pairing code is invalid or expired. Create a new one on the Apply Queue page.' });
  return res.json({ token });
};

/** GET /api/v1/extension/me — the values the extension fills into forms */
export const getExtensionProfile = async (req: Request, res: Response) => {
  try {
    const profile: any = await Profile.findOne({ userId: userIdOf(req) }).lean();
    if (!profile) return res.status(404).json({ message: 'Create your profile in the app first' });

    const pi = profile.personalInfo || {};
    const address = pi.address || {};
    const currentJob = (profile.workExperience || []).find((w: any) => w.current) || profile.workExperience?.[0];
    const education = profile.education?.[0];
    const resume = await UploadedResume.findOne({ userId: userIdOf(req), isPrimary: true }).lean();

    return res.json({
      firstName: pi.firstName, middleName: pi.middleName, lastName: pi.lastName,
      fullName: [pi.firstName, pi.lastName].filter(Boolean).join(' '),
      email: pi.email, phone: pi.phone,
      address,
      location: [address.city, address.state, address.country].filter(Boolean).join(', '),
      linkedin: pi.linkedin, github: pi.github, portfolio: pi.portfolio || pi.website,
      currentCompany: currentJob?.company, currentTitle: currentJob?.position,
      yearsOfExperience: profile.professionalSummary?.yearsOfExperience,
      school: education?.institution, degree: education?.degree, fieldOfStudy: education?.field,
      graduationYear: education?.endDate ? new Date(education.endDate).getFullYear() : undefined,
      resumeFileName: resume?.filename || null
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to load profile', error: error.message });
  }
};

/** GET /api/v1/extension/resume → { filename, mimeType, base64 } for attaching to file inputs */
export const getExtensionResume = async (req: Request, res: Response) => {
  try {
    const resume = await UploadedResume.findOne({ userId: userIdOf(req), isPrimary: true });
    if (!resume) return res.status(404).json({ message: 'Upload your resume in the app first' });
    const data = await fs.readFile(resume.filePath);
    return res.json({ filename: resume.filename, mimeType: resume.mimeType || 'application/pdf', base64: data.toString('base64') });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to read the resume file', error: error.message });
  }
};

/** GET /api/v1/extension/queue, /queue/next, /queue/:itemId */
export const getExtensionQueue = async (req: Request, res: Response) => res.json({ items: await getQueue(userIdOf(req)) });
export const getExtensionNextItem = async (req: Request, res: Response) => res.json({ item: await getNextItem(userIdOf(req)) });
export const getExtensionItem = async (req: Request, res: Response) => {
  const item = await getItem(userIdOf(req), req.params.itemId);
  return item ? res.json({ item }) : res.status(404).json({ message: 'Queue item not found' });
};

/** POST /api/v1/extension/queue/:itemId/event */
export const postExtensionEvent = async (req: Request, res: Response) => {
  const body = req.body || {};
  if (!['opened', 'filled', 'submitted', 'skipped', 'step'].includes(body.type)) {
    return res.status(400).json({ message: 'Unknown event type' });
  }
  const event: QueueEvent = {
    type: body.type,
    message: typeof body.message === 'string' ? body.message.slice(0, 500) : undefined,
    level: ['info', 'success', 'warn', 'error'].includes(body.level) ? body.level : undefined,
    filledCount: Number.isFinite(body.filledCount) ? body.filledCount : undefined,
    missingFields: Array.isArray(body.missingFields) ? body.missingFields.map((f: any) => String(f).slice(0, 200)) : undefined
  };
  const item = await recordQueueEvent(userIdOf(req), req.params.itemId, event);
  return item ? res.json({ status: item.status }) : res.status(404).json({ message: 'Queue item not found' });
};

/**
 * POST /api/v1/extension/answers  { questions, itemId? }
 * Rule answers (self-identification, work authorization, languages, referral source) come from
 * the profile; everything else goes to the model with the job for context.
 */
export const answerExtensionQuestions = async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    const profile = await Profile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Create your profile in the app first' });

    const questions: FormQuestion[] = (Array.isArray(req.body?.questions) ? req.body.questions : [])
      .slice(0, 80)
      .map((q: any) => ({
        id: String(q.id),
        label: String(q.label || '').slice(0, 400),
        type: q.type,
        options: Array.isArray(q.options) ? q.options.map((o: any) => String(o).slice(0, 200)).slice(0, 100) : undefined,
        required: !!q.required
      }));

    const answers: Record<string, { values: string[]; source: 'rule' | 'ai' | 'none' }> = {};
    const forModel: FormQuestion[] = [];
    for (const q of questions) {
      const choices = ruleChoices(q, profile);
      if (choices === null) forModel.push(q);
      else answers[q.id] = { values: choices, source: choices.length ? 'rule' : 'none' };
    }

    if (forModel.length) {
      const item = req.body?.itemId ? await getItem(userId, req.body.itemId) : null;
      const job = item?.job
        ? { title: item.job.title, company: item.job.company, description: item.job.description }
        : req.body?.job?.title ? { title: String(req.body.job.title), company: String(req.body.job.company || '') } : undefined;
      const modelAnswers = await generateAnswers(forModel, profile, job);
      for (const q of forModel) {
        const value = modelAnswers.get(q.id);
        answers[q.id] = value ? { values: [value], source: 'ai' } : { values: [], source: 'none' };
      }
    }
    return res.json({ answers });
  } catch (error: any) {
    logger.error(`Extension answers error: ${error.message}`);
    return res.status(500).json({ message: 'Failed to generate answers', error: error.message });
  }
};
