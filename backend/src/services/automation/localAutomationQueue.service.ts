import { logger } from '../../config/logger';
import { automationEngine, AutomationJobData } from './automationEngine.service';

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
      while (this.pending.length > 0) {
        const job = this.pending.shift()!;
        this.active.add(job.applicationId);
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
