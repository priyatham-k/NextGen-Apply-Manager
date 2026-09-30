import { AutopilotRun, AutopilotUserResult, AutopilotPhase } from '../models/AutopilotRun.model';
import { Application, ApplicationStatus, SubmissionType, LogLevel } from '../models/Application.model';
import { Job } from '../models/Job.model';
import { Profile } from '../models/Profile.model';
import { UploadedResume } from '../models/UploadedResume.model';
import { NotificationType } from '../models/Notification.model';
import { fetchJobs } from './jobFetcher.service';
import { calculateMatches } from './jobMatching.service';
import { createNotification } from './notification.service';
import { profileCompletionService } from './profileCompletion.service';
import { localAutomationQueue } from './automation/localAutomationQueue.service';
import { automationEngine } from './automation/automationEngine.service';
import { logger } from '../config/logger';

/**
 * Daily autopilot: fetch jobs → score the auto-apply-capable ones against each profile →
 * queue the best matches (up to a daily limit) for unattended submission.
 * Forms with required questions the profile can't answer are never submitted (see automationEngine).
 */

// Read lazily: dotenv.config() runs after module imports
export function autopilotConfig() {
  return {
    enabled: process.env.AUTOPILOT_ENABLED === 'true',
    time: process.env.AUTOPILOT_TIME || '09:00',
    dailyLimit: Math.max(0, parseInt(process.env.AUTOPILOT_DAILY_LIMIT || '10', 10)),
    minMatchScore: parseInt(process.env.AUTOPILOT_MIN_MATCH_SCORE || '70', 10)
  };
}

let running = false;

export function isAutopilotRunning(): boolean {
  return running;
}

function localDateKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Why the autopilot can't apply for this user right now (missing profile fields, no resume,
 * daily limit reached), or null when it can. Checked before the slow fetch/scoring steps.
 */
export async function autopilotBlocker(userId: string): Promise<string | null> {
  const profile = await Profile.findOne({ userId });
  if (!profile) return 'Create your profile first';

  const readiness = profileCompletionService.checkAutomationReadiness(profile);
  if (!readiness.isComplete) {
    return `Complete your profile first. Missing: ${readiness.criticalMissing.join(', ')}`;
  }

  if (!(await UploadedResume.exists({ userId, isPrimary: true }))) {
    return 'Upload your resume first (Profile → upload PDF)';
  }

  const { dailyLimit } = autopilotConfig();
  const automatedToday = await Application.countDocuments({
    userId,
    submissionType: SubmissionType.AUTOMATED,
    createdAt: { $gte: startOfToday() }
  });
  if (automatedToday >= dailyLimit) return `Daily limit of ${dailyLimit} applications reached`;

  return null;
}

type StepLogger = (phase: AutopilotPhase, message: string, level?: LogLevel) => Promise<void>;

async function applyForUser(userId: string, step: StepLogger, onQueued: (applicationId: string) => Promise<void>): Promise<AutopilotUserResult> {
  const { dailyLimit, minMatchScore } = autopilotConfig();

  const notReady = await autopilotBlocker(userId);
  if (notReady) {
    await step('match', notReady, 'warn');
    return { userId, queued: 0, skippedReason: notReady };
  }

  const resume = (await UploadedResume.findOne({ userId, isPrimary: true }))!;
  const automatedToday = await Application.countDocuments({
    userId,
    submissionType: SubmissionType.AUTOMATED,
    createdAt: { $gte: startOfToday() }
  });
  const remaining = dailyLimit - automatedToday;

  const candidates = await Job.countDocuments({ status: 'new', autoApplySupported: true });
  await step('match', `Scoring up to 50 of ${candidates} auto-apply jobs against your profile with AI...`);

  // calculateMatches already excludes jobs the user has applied to
  const matches = await calculateMatches(userId, 50, { autoApplyOnly: true });
  const qualifying = matches.filter(m => m.matchScore >= minMatchScore);
  const picks = qualifying.slice(0, remaining);
  const best = matches[0];
  await step('match', `Scored ${matches.length} jobs: ${qualifying.length} scored ${minMatchScore}+` +
    (best ? ` (best: ${best.job.title} at ${best.job.company}, ${best.matchScore})` : ''), qualifying.length ? 'success' : 'warn');
  await step('match', `Daily limit: ${automatedToday} of ${dailyLimit} used today, ${remaining} left`);

  if (picks.length === 0) {
    const reason = `No new auto-apply jobs scored ${minMatchScore}+`;
    await step('queue', reason, 'warn');
    return { userId, queued: 0, skippedReason: reason };
  }

  let queued = 0;
  for (const match of picks) {
    const job = match.job;
    try {
      const application = await Application.create({
        userId,
        jobId: job._id,
        resumeId: resume._id.toString(),
        status: ApplicationStatus.PENDING,
        submissionType: SubmissionType.AUTOMATED,
        notes: `Queued by autopilot (match score ${match.matchScore})`
      });
      localAutomationQueue.enqueue({
        applicationId: application._id.toString(),
        userId,
        jobId: job._id.toString(),
        jobUrl: job.atsApplyUrl || job.applicationUrl,
        resumeId: resume._id.toString(),
        autopilot: true
      });
      queued++;
      await onQueued(application._id.toString());
      await step('queue', `Queued: ${job.title} at ${job.company} (match ${match.matchScore})`);
    } catch (error: any) {
      // A duplicate (userId, jobId) means it was applied to in the meantime
      logger.warn(`Autopilot could not queue job ${job._id}: ${error.message}`);
      await step('queue', `Skipped ${job.title} at ${job.company}: already applied`, 'warn');
    }
  }

  await createNotification(userId, NotificationType.SYSTEM, 'Autopilot started',
    `Autopilot is applying to ${queued} matching job${queued === 1 ? '' : 's'} (score ${minMatchScore}+). You'll get a notification for each one.`);
  return { userId, queued };
}

/**
 * Runs the autopilot once. Scheduled runs cover every user with a profile;
 * a manual run covers only the user who started it.
 */
export async function runAutopilot(trigger: 'schedule' | 'manual', onlyUserId?: string, runKey?: string): Promise<AutopilotUserResult[]> {
  if (running) throw new Error('Autopilot is already running');
  running = true;

  const key = runKey || `manual-${Date.now()}`;
  const run = await AutopilotRun.findOneAndUpdate(
    { runKey: key },
    { $setOnInsert: { runKey: key, trigger, userId: onlyUserId, startedAt: new Date(), results: [], steps: [], applicationIds: [] } },
    { upsert: true, new: true }
  );

  // Each step is saved immediately so the dashboard can show progress while the run is going
  const step: StepLogger = async (phase, message, level = 'info') => {
    await AutopilotRun.updateOne({ _id: run._id }, { $push: { steps: { at: new Date(), phase, message, level } } })
      .catch(error => logger.warn(`Could not record autopilot step: ${error.message}`));
  };
  const onQueued = async (applicationId: string) => {
    await AutopilotRun.updateOne({ _id: run._id }, { $push: { applicationIds: applicationId } });
  };

  try {
    logger.info(`🤖 Autopilot started (${trigger})`);
    await step('start', `Autopilot started (${trigger === 'manual' ? 'Run now' : 'daily schedule'})`);
    await step('fetch', 'Fetching jobs from JSearch, Remotive and company career boards...');
    // Chain the writes so fetch steps are saved in the order they happen
    let fetchSteps = Promise.resolve();
    await fetchJobs((message, level) => {
      fetchSteps = fetchSteps.then(() => step('fetch', message, level));
    });
    await fetchSteps;

    const userIds = onlyUserId ? [onlyUserId] : (await Profile.distinct('userId')).map(id => id.toString());
    const results: AutopilotUserResult[] = [];
    for (const userId of userIds) {
      let result: AutopilotUserResult;
      try {
        result = await applyForUser(userId, step, onQueued);
      } catch (error: any) {
        logger.error(`Autopilot failed for user ${userId}: ${error.message}`);
        await step('match', `Failed: ${error.message}`, 'error');
        result = { userId, queued: 0, skippedReason: error.message };
      }
      results.push(result);
      if (result.skippedReason) {
        await createNotification(userId, NotificationType.SYSTEM, 'Autopilot did not apply', result.skippedReason);
      }
    }

    const queuedTotal = results.reduce((sum, r) => sum + r.queued, 0);
    await step('done', queuedTotal
      ? `Done: ${queuedTotal} application(s) queued. Each one is filled and submitted in turn below.`
      : 'Done: nothing to apply to this time', queuedTotal ? 'success' : 'warn');
    await AutopilotRun.updateOne({ _id: run._id }, { finishedAt: new Date(), results });
    logger.info(`🤖 Autopilot finished: ${results.map(r => `${r.userId}=${r.queued}${r.skippedReason ? ` (${r.skippedReason})` : ''}`).join(', ')}`);
    return results;
  } catch (error: any) {
    await step('done', `Autopilot failed: ${error.message}`, 'error');
    await AutopilotRun.updateOne({ _id: run._id }, { finishedAt: new Date(), error: error.message });
    throw error;
  } finally {
    running = false;
  }
}

/** Checks every minute; runs once per day at AUTOPILOT_TIME (server local time). */
export function startAutopilotScheduler(): void {
  const check = async () => {
    const { enabled, time } = autopilotConfig();
    if (!enabled || running) return;

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < hours * 60 + minutes) return;

    // The run record doubles as a once-per-day lock that survives restarts
    const runKey = localDateKey(now);
    if (await AutopilotRun.exists({ runKey })) return;

    runAutopilot('schedule', undefined, runKey).catch(error =>
      logger.error(`Scheduled autopilot run failed: ${error.message}`));
  };

  setInterval(() => void check().catch(error => logger.error(`Autopilot scheduler error: ${error.message}`)), 60 * 1000);
  const { enabled, time, dailyLimit, minMatchScore } = autopilotConfig();
  logger.info(enabled
    ? `🤖 Autopilot scheduled daily at ${time} (limit ${dailyLimit}/day, min score ${minMatchScore})`
    : '🤖 Autopilot is off (set AUTOPILOT_ENABLED=true to turn it on)');
}

async function runApplications(applicationIds: string[], userId: string) {
  if (!applicationIds.length) return [];
  const apps = await Application.find({ _id: { $in: applicationIds }, userId })
    .populate('jobId', 'title company')
    .select('status errorLog automationLog jobId createdAt')
    .lean();
  return apps.map((a: any) => ({
    id: a._id.toString(),
    status: a.status,
    errorLog: a.errorLog,
    job: a.jobId ? { title: a.jobId.title, company: a.jobId.company } : null,
    steps: a.automationLog || []
  }));
}

/** Filled tabs waiting for the user (human checks and pre-submit reviews), newest first */
async function actionNeeded(userId: string) {
  const held = automationEngine.listPendingReviews(userId);
  if (!held.length) return [];
  const apps = await Application.find({ _id: { $in: held.map(h => h.applicationId) } })
    .populate('jobId', 'title company').select('jobId').lean();
  return held
    .map(h => {
      const app: any = apps.find(a => a._id.toString() === h.applicationId);
      return {
        id: h.applicationId,
        job: app?.jobId ? { title: app.jobId.title, company: app.jobId.company } : null,
        reason: h.reason || 'Review the filled form, then submit',
        humanCheck: !!h.reason,
        since: h.since,
        expiresAt: h.expiresAt
      };
    })
    .sort((a, b) => b.since.getTime() - a.since.getTime());
}

export async function getAutopilotStatus(userId: string) {
  const config = autopilotConfig();
  const [lastRun, appliedToday] = await Promise.all([
    // This user's manual runs plus the daily scheduled runs (which cover everyone)
    AutopilotRun.findOne({ $or: [{ trigger: 'schedule' }, { userId }] }).sort({ startedAt: -1 }).lean(),
    Application.countDocuments({ userId, submissionType: SubmissionType.AUTOMATED, createdAt: { $gte: startOfToday() } })
  ]);
  return {
    ...config,
    running,
    appliedToday,
    actionNeeded: await actionNeeded(userId),
    lastRun: lastRun && {
      trigger: lastRun.trigger,
      startedAt: lastRun.startedAt,
      finishedAt: lastRun.finishedAt,
      error: lastRun.error,
      result: lastRun.results.find(r => r.userId === userId),
      steps: lastRun.steps || [],
      applications: await runApplications(lastRun.applicationIds || [], userId)
    }
  };
}
