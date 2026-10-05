import mongoose from 'mongoose';
import { ApplyQueueItem, QueueBuild, QueueItemStatus, QueueBuildPhase, IApplyQueueItem } from '../models/ApplyQueue.model';
import { Application, ApplicationStatus, SubmissionType, LogLevel } from '../models/Application.model';
import { Job } from '../models/Job.model';
import { Profile } from '../models/Profile.model';
import { UploadedResume } from '../models/UploadedResume.model';
import { NotificationType } from '../models/Notification.model';
import { fetchJobs, tagWorkAuthRestrictions } from './jobFetcher.service';
import { needsSponsorship } from './workAuthorization.service';
import { calculateMatches } from './jobMatching.service';
import { createNotification } from './notification.service';
import { profileCompletionService } from './profileCompletion.service';
import { applicationFormUrl, detectATSFromUrl } from './automation/atsDetector.service';
import { logger } from '../config/logger';

/**
 * Extension apply flow (isolated from the Puppeteer autopilot): each day, fetch and score jobs
 * whose forms the Chrome extension can fill, and queue the best ones. The user works through the
 * queue in their own browser — the extension fills, the user submits.
 */

// Read lazily: dotenv.config() runs after module imports
export function applyQueueConfig() {
  return {
    enabled: process.env.APPLY_QUEUE_ENABLED === 'true',
    time: process.env.APPLY_QUEUE_TIME || '08:30',
    size: Math.max(1, parseInt(process.env.APPLY_QUEUE_SIZE || '10', 10)),
    minMatchScore: parseInt(process.env.APPLY_QUEUE_MIN_SCORE || '70', 10)
  };
}

const building = new Set<string>();

export function localDateKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Why a queue can't be built for this user yet, or null */
export async function queueBlocker(userId: string): Promise<string | null> {
  const profile = await Profile.findOne({ userId });
  if (!profile) return 'Create your profile first';
  const readiness = profileCompletionService.checkAutomationReadiness(profile);
  if (!readiness.isComplete) return `Complete your profile first. Missing: ${readiness.criticalMissing.join(', ')}`;
  if (!(await UploadedResume.exists({ userId, isPrimary: true }))) return 'Upload your resume first (Profile → Upload PDF)';
  return null;
}

export function isBuilding(userId: string): boolean {
  return building.has(userId);
}

/** Fetch → score → queue today's best extension-fillable jobs, recording each step */
export async function buildQueue(userId: string, trigger: 'schedule' | 'manual'): Promise<number> {
  if (building.has(userId)) throw new Error('The queue is already being built');
  building.add(userId);

  const { size, minMatchScore } = applyQueueConfig();
  const queueDate = localDateKey();
  const build = await QueueBuild.create({ userId, trigger, queueDate, startedAt: new Date(), steps: [] });
  const step = async (phase: QueueBuildPhase, message: string, level: LogLevel = 'info') => {
    await QueueBuild.updateOne({ _id: build._id }, { $push: { steps: { at: new Date(), phase, message, level } } })
      .catch(error => logger.warn(`Could not record queue step: ${error.message}`));
  };

  try {
    await step('start', `Building today's apply queue (${trigger === 'manual' ? 'Build now' : 'daily schedule'})`);

    const blocker = await queueBlocker(userId);
    if (blocker) throw new Error(blocker);

    await step('fetch', 'Fetching jobs from JSearch, Remotive and company career boards...');
    let fetchSteps = Promise.resolve();
    await fetchJobs((message, level) => {
      fetchSteps = fetchSteps.then(() => step('fetch', message, level));
    });
    await fetchSteps;

    const removed = await skipRestrictedQueueItems(userId);
    if (removed) await step('queue', `Skipped ${removed} queued job(s) that need US citizenship / a Green Card or don't sponsor visas`, 'warn');

    // Top up today's queue rather than duplicating it when rebuilt
    const todays = await ApplyQueueItem.countDocuments({ userId, queueDate, status: { $ne: QueueItemStatus.SKIPPED } });
    const slots = size - todays;
    if (slots <= 0) {
      await step('queue', `Today's queue is already full (${todays}/${size})`, 'warn');
      await step('done', 'Done: nothing new to add', 'warn');
      return 0;
    }

    const alreadyQueued = (await ApplyQueueItem.find({ userId }).select('jobId').lean()).map(i => i.jobId.toString());
    const candidates = await Job.countDocuments({ status: 'new', extensionSupported: true, _id: { $nin: alreadyQueued } });
    await step('match', `Scoring up to 50 of ${candidates} jobs the extension can fill against your profile with AI...`);

    const matches = await calculateMatches(userId, 50, { extensionOnly: true, excludeJobIds: alreadyQueued });
    const qualifying = matches.filter(m => m.matchScore >= minMatchScore);
    const best = matches[0];
    await step('match', `Scored ${matches.length} jobs: ${qualifying.length} scored ${minMatchScore}+` +
      (best ? ` (best: ${best.job.title} at ${best.job.company}, ${best.matchScore})` : ''), qualifying.length ? 'success' : 'warn');

    let queued = 0;
    for (const match of qualifying.slice(0, slots)) {
      const job = match.job;
      const formUrl = applicationFormUrl(job.atsApplyUrl || job.applicationUrl);
      try {
        await ApplyQueueItem.create({
          userId,
          jobId: job._id,
          queueDate,
          position: todays + queued + 1,
          matchScore: match.matchScore,
          matchReason: match.overallReason,
          formUrl,
          steps: [{ at: new Date(), message: `Queued (match ${match.matchScore}) — ${detectATSFromUrl(formUrl)} form`, level: 'info' }]
        });
        queued++;
        await step('queue', `Queued: ${job.title} at ${job.company} (match ${match.matchScore})`);
      } catch (error: any) {
        logger.warn(`Could not queue job ${job._id}: ${error.message}`);
      }
    }

    await QueueBuild.updateOne({ _id: build._id }, { queued });
    await step('done', queued
      ? `Done: ${queued} job(s) ready. Click "Start applying" — the extension fills each form, you review and submit.`
      : `Done: no new jobs scored ${minMatchScore}+ this time`, queued ? 'success' : 'warn');
    if (queued) {
      await createNotification(userId, NotificationType.SYSTEM, 'Apply queue ready',
        `${queued} matching job${queued === 1 ? ' is' : 's are'} ready. Open Apply Queue and click Start applying.`);
    }
    return queued;
  } catch (error: any) {
    await step('done', `Failed: ${error.message}`, 'error');
    await QueueBuild.updateOne({ _id: build._id }, { error: error.message });
    throw error;
  } finally {
    await QueueBuild.updateOne({ _id: build._id }, { finishedAt: new Date() });
    building.delete(userId);
  }
}

function toQueueView(item: any) {
  return {
    id: item._id.toString(),
    position: item.position,
    queueDate: item.queueDate,
    status: item.status,
    matchScore: item.matchScore,
    matchReason: item.matchReason,
    formUrl: item.formUrl,
    filledCount: item.filledCount,
    missingFields: item.missingFields,
    steps: item.steps,
    applicationId: item.applicationId?.toString(),
    job: item.jobId ? {
      id: item.jobId._id.toString(),
      title: item.jobId.title,
      company: item.jobId.company,
      location: item.jobId.location,
      description: item.jobId.description
    } : null
  };
}

/** Today's queue plus anything still open from earlier days */
/**
 * For candidates who need sponsorship: skips not-yet-submitted queue items whose posting requires US citizenship,
 * a Green Card or a clearance, or says it doesn't sponsor. Returns how many were skipped.
 */
export async function skipRestrictedQueueItems(userId: string): Promise<number> {
  const profile = await Profile.findOne({ userId }).select('screeningQuestions').lean();
  if (!needsSponsorship(profile)) return 0;

  const open = await ApplyQueueItem.find({
    userId, status: { $in: [QueueItemStatus.QUEUED, QueueItemStatus.OPENED, QueueItemStatus.FILLED] }
  }).populate('jobId', 'workAuthRestriction');
  let skipped = 0;
  for (const item of open) {
    const reason = (item.jobId as any)?.workAuthRestriction;
    if (!reason) continue;
    item.status = QueueItemStatus.SKIPPED;
    item.steps.push({ at: new Date(), message: `Skipped automatically: ${reason}. You need visa sponsorship.`, level: 'warn' });
    await item.save();
    skipped++;
  }
  if (skipped) logger.info(`Apply queue: skipped ${skipped} job(s) with work-authorization restrictions for user ${userId}`);
  return skipped;
}

/** At startup: re-tag stored jobs with the current rules, then clear restricted jobs from everyone's queue */
export async function applyWorkAuthRules(): Promise<void> {
  const restricted = await tagWorkAuthRestrictions();
  logger.info(`🛂 ${restricted} job(s) require US citizenship / a Green Card or don't sponsor visas`);
  const userIds = await ApplyQueueItem.distinct('userId', { status: { $in: [QueueItemStatus.QUEUED, QueueItemStatus.OPENED, QueueItemStatus.FILLED] } });
  for (const userId of userIds) await skipRestrictedQueueItems(userId.toString());
}

export async function getQueue(userId: string) {
  const items = await ApplyQueueItem.find({
    userId,
    $or: [{ queueDate: localDateKey() }, { status: { $in: [QueueItemStatus.QUEUED, QueueItemStatus.OPENED, QueueItemStatus.FILLED] } }]
  })
    .sort({ queueDate: 1, position: 1 })
    .populate('jobId', 'title company location description')
    .lean();
  return items.map(toQueueView);
}

export async function getNextItem(userId: string) {
  const item = await ApplyQueueItem.findOne({ userId, status: { $in: [QueueItemStatus.QUEUED, QueueItemStatus.OPENED, QueueItemStatus.FILLED] } })
    .sort({ queueDate: 1, position: 1 })
    .populate('jobId', 'title company location description')
    .lean();
  return item ? toQueueView(item) : null;
}

export async function getItem(userId: string, itemId: string) {
  const item = await ApplyQueueItem.findOne({ _id: itemId, userId })
    .populate('jobId', 'title company location description').lean();
  return item ? toQueueView(item) : null;
}

export async function latestBuild(userId: string) {
  const build = await QueueBuild.findOne({ userId }).sort({ startedAt: -1 }).lean();
  return build && {
    trigger: build.trigger,
    startedAt: build.startedAt,
    finishedAt: build.finishedAt,
    queued: build.queued,
    error: build.error,
    steps: build.steps
  };
}

export interface QueueEvent {
  type: 'opened' | 'filled' | 'submitted' | 'skipped' | 'step';
  message?: string;
  level?: LogLevel;
  filledCount?: number;
  missingFields?: string[];
}

/** Records what the extension (or the user) did with a queue item */
export async function recordQueueEvent(userId: string, itemId: string, event: QueueEvent): Promise<IApplyQueueItem | null> {
  const item = await ApplyQueueItem.findOne({ _id: itemId, userId });
  if (!item) return null;

  const defaultMessages: Record<QueueEvent['type'], string> = {
    opened: 'Form opened in your browser',
    filled: 'Form filled',
    submitted: 'Application submitted',
    skipped: 'Skipped',
    step: ''
  };
  const message = event.message || defaultMessages[event.type];
  if (message) item.steps.push({ at: new Date(), message, level: event.level || (event.type === 'submitted' ? 'success' : 'info') });

  if (event.filledCount !== undefined) item.filledCount = event.filledCount;
  if (event.missingFields) item.missingFields = event.missingFields.slice(0, 50);

  switch (event.type) {
    case 'opened':
      if (item.status === QueueItemStatus.QUEUED) item.status = QueueItemStatus.OPENED;
      item.openedAt = item.openedAt || new Date();
      break;
    case 'filled':
      if (item.status !== QueueItemStatus.SUBMITTED) item.status = QueueItemStatus.FILLED;
      break;
    case 'skipped':
      if (item.status !== QueueItemStatus.SUBMITTED) item.status = QueueItemStatus.SKIPPED;
      break;
    case 'submitted':
      if (item.status !== QueueItemStatus.SUBMITTED) {
        item.status = QueueItemStatus.SUBMITTED;
        item.submittedAt = new Date();
        item.applicationId = await recordApplication(userId, item);
      }
      break;
  }
  await item.save();
  return item;
}

/** A submitted queue item shows up in Applications like any other application */
async function recordApplication(userId: string, item: IApplyQueueItem): Promise<mongoose.Types.ObjectId | undefined> {
  const existing = await Application.findOne({ userId, jobId: item.jobId });
  if (existing) {
    if (![ApplicationStatus.SUBMITTED, ApplicationStatus.IN_REVIEW, ApplicationStatus.INTERVIEW_SCHEDULED,
      ApplicationStatus.OFFER_RECEIVED, ApplicationStatus.ACCEPTED].includes(existing.status)) {
      existing.status = ApplicationStatus.SUBMITTED;
      existing.submittedAt = new Date();
      existing.submissionType = SubmissionType.HYBRID;
      existing.errorLog = undefined;
      await existing.save();
    }
    return existing._id as mongoose.Types.ObjectId;
  }
  const resume = await UploadedResume.findOne({ userId, isPrimary: true });
  const application = await Application.create({
    userId,
    jobId: item.jobId,
    resumeId: resume?._id.toString(),
    status: ApplicationStatus.SUBMITTED,
    submissionType: SubmissionType.HYBRID,
    submittedAt: new Date(),
    atsType: detectATSFromUrl(item.formUrl),
    notes: `Applied with the Chrome extension (match score ${item.matchScore})`,
    automationLog: item.steps.map(s => ({ at: s.at, message: s.message, level: s.level }))
  });
  return application._id as mongoose.Types.ObjectId;
}

/** Checks every minute; builds each user's queue once a day at APPLY_QUEUE_TIME (server local time) */
export function startApplyQueueScheduler(): void {
  const check = async () => {
    const { enabled, time } = applyQueueConfig();
    if (!enabled) return;

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < hours * 60 + minutes) return;

    const queueDate = localDateKey(now);
    for (const userId of (await Profile.distinct('userId')).map(id => id.toString())) {
      if (building.has(userId) || await QueueBuild.exists({ userId, queueDate, trigger: 'schedule' })) continue;
      buildQueue(userId, 'schedule').catch(error => logger.warn(`Scheduled queue build for ${userId}: ${error.message}`));
    }
  };

  setInterval(() => void check().catch(error => logger.error(`Apply queue scheduler error: ${error.message}`)), 60 * 1000);
  const { enabled, time, size } = applyQueueConfig();
  logger.info(enabled
    ? `🧭 Apply queue builds daily at ${time} (${size} jobs)`
    : '🧭 Daily apply queue is off (set APPLY_QUEUE_ENABLED=true to turn it on)');
}
