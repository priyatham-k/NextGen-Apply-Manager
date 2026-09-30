import { logger } from '../../config/logger';
import { automationEngine, AutomationJobData } from './automationEngine.service';
import { Application } from '../../models/Application.model';

// Rapid back-to-back submissions get flagged as spam; wait a random gap between autopilot applications
function autopilotGapMs(): number {
  const min = parseInt(process.env.AUTOPILOT_DELAY_MIN_SECONDS || '120', 10);
  const max = Math.max(min, parseInt(process.env.AUTOPILOT_DELAY_MAX_SECONDS || '300', 10));
  return (min + Math.random() * (max - min)) * 1000;
}

/** Single-process automation queue. Pending work is lost if the backend restarts. */
class LocalAutomationQueue {
  private readonly pending: AutomationJobData[] = [];
  private readonly active = new Set<string>();
  private completed = 0;
  private failed = 0;
  private processing = false;

  enqueue(job: AutomationJobData): void {
    this.pending.push(job);
    void this.processNext();
  }

  cancel(applicationId: string): boolean {
    const index = this.pending.findIndex(job => job.applicationId === applicationId);
    if (index === -1) return false;
    this.pending.splice(index, 1);
    return true;
  }

  isActive(applicationId: string): boolean {
    return this.active.has(applicationId);
  }

  stats() {
    const waiting = this.pending.length;
    const active = this.active.size;
    return {
      waiting, active, completed: this.completed, failed: this.failed,
      delayed: 0, total: waiting + active + this.completed + this.failed, available: true
    };
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      let previousWasAutopilot = false;
      while (this.pending.length > 0) {
        const job = this.pending.shift()!;
        this.active.add(job.applicationId);

        if (job.autopilot && previousWasAutopilot) {
          const gap = autopilotGapMs();
          await Application.updateOne({ _id: job.applicationId }, {
            $push: { automationLog: {
              at: new Date(), step: 0, level: 'info',
              message: `Waiting ${Math.round(gap / 60000 * 10) / 10} min before starting (spacing applications out avoids spam flags)`
            } }
          }).catch(() => undefined);
          await new Promise(resolve => setTimeout(resolve, gap));
        }
        previousWasAutopilot = !!job.autopilot;
        try {
          await automationEngine.executeAutomation(job);
          this.completed++;
        } catch (error: any) {
          this.failed++;
          logger.error(`Automation failed for application ${job.applicationId}: ${error.message}`);
        } finally {
          this.active.delete(job.applicationId);
        }
      }
    } finally {
      this.processing = false;
      if (this.pending.length > 0) void this.processNext();
    }
  }
}

export const localAutomationQueue = new LocalAutomationQueue();
