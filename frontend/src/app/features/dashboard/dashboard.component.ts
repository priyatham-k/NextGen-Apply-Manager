import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { JobService } from '@core/services/job.service';
import { ApplicationService } from '@core/services/application.service';
import { AuthService } from '@core/services/auth.service';
import { AutomationService, AutopilotStatus, AutopilotPhase, AutopilotApplication } from '@core/services/automation.service';
import { StepTimelineComponent } from '@shared/components/step-timeline/step-timeline.component';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    StepTimelineComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private jobService = inject(JobService);
  private applicationService = inject(ApplicationService);
  private authService = inject(AuthService);
  private automationService = inject(AutomationService);
  private toastr = inject(ToastrService);

  autopilot = signal<AutopilotStatus | null>(null);
  startingAutopilot = signal(false);
  private autopilotPoll?: ReturnType<typeof setInterval>;
  /** Accordion sections the user closed (all open by default) */
  private collapsed = signal<Set<string>>(new Set());

  readonly autopilotSections: { key: AutopilotPhase; title: string; icon: string }[] = [
    { key: 'fetch', title: 'Fetch jobs', icon: 'bi-cloud-download' },
    { key: 'match', title: 'Match scoring', icon: 'bi-stars' },
    { key: 'queue', title: 'Applications', icon: 'bi-send' }
  ];

  runSteps = computed(() => this.autopilot()?.lastRun?.steps || []);
  runApplications = computed(() => this.autopilot()?.lastRun?.applications || []);
  runSummary = computed(() => this.runSteps().filter(s => s.phase === 'start' || s.phase === 'done'));

  // "Action needed": filled tabs waiting for the user (verification codes, spam checks, reviews)
  actionItems = computed(() => this.autopilot()?.actionNeeded || []);
  /** Application id → the action running on it, so its buttons can show progress */
  busyAction = signal<Record<string, string>>({});
  desktopAlerts = signal<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  async enableDesktopAlerts(): Promise<void> {
    if (typeof Notification === 'undefined') return;
    this.desktopAlerts.set(await Notification.requestPermission());
    if (this.desktopAlerts() === 'granted') {
      new Notification('Desktop alerts are on', { body: "You'll be alerted when an application needs you." });
    }
  }

  minutesLeft(expiresAt: string): number {
    return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
  }

  async runAction(id: string, action: 'focus' | 'submit' | 'confirm' | 'discard'): Promise<void> {
    this.busyAction.update(b => ({ ...b, [id]: action }));
    try {
      const calls = {
        focus: () => this.automationService.focusTab(id),
        submit: () => this.automationService.submitReviewed(id),
        confirm: () => this.automationService.confirmSubmitted(id),
        discard: () => this.automationService.discardReview(id)
      };
      const result: any = await firstValueFrom(calls[action]());
      if (action === 'focus') {
        this.toastr.info('Switch to the automation browser window — the tab is in front');
      } else if (result.status === 'submitted') {
        this.toastr.success(result.message);
      } else {
        this.toastr.info(result.message);
      }
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Action failed');
    } finally {
      this.busyAction.update(b => {
        const next = { ...b };
        delete next[id];
        return next;
      });
      await this.loadAutopilotStatus();
    }
  }
  
  // Signals for reactive state
  loading = signal(true);
  stats = signal({
    totalJobs: 0,
    totalApplications: 0,
    pendingApplications: 0,
    successfulApplications: 0,
    averageMatchScore: 0
  });
  
  // Computed values
  currentUser = this.authService.currentUser;
  highMatchJobs = this.jobService.highMatchJobs;
  recentApplications = computed(() => 
    this.applicationService.applications().slice(0, 5)
  );
  
  ngOnInit(): void {
    this.loadDashboardData();
    // Resume live updates if a run (or one of its applications) is still in progress
    this.loadAutopilotStatus().then(() => {
      if (this.autopilotActive()) this.pollAutopilotUntilDone();
    });
  }

  isOpen(key: string): boolean {
    return !this.collapsed().has(key);
  }

  toggle(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.collapsed.set(next);
  }

  stepsFor(phase: AutopilotPhase) {
    return this.runSteps().filter(s => s.phase === phase);
  }

  /** State of an accordion section, from its steps and whether later phases have started */
  sectionState(phase: AutopilotPhase): 'pending' | 'running' | 'done' | 'warn' | 'error' {
    const status = this.autopilot();
    const steps = this.stepsFor(phase);
    const order: AutopilotPhase[] = ['fetch', 'match', 'queue', 'done'];
    const laterStarted = this.runSteps().some(s => order.indexOf(s.phase) > order.indexOf(phase));

    if (steps.some(s => s.level === 'error')) return 'error';
    if (phase === 'queue' && this.runApplications().some(a => a.status === 'pending')) return 'running';
    if (steps.length === 0) return status?.running && !laterStarted ? 'pending' : (laterStarted ? 'done' : 'pending');
    if (status?.running && !laterStarted) return 'running';
    return steps.some(s => s.level === 'warn') ? 'warn' : 'done';
  }

  appState(app: AutopilotApplication): { label: string; css: string; icon: string } {
    switch (app.status) {
      case 'pending': return { label: 'In progress', css: 'running', icon: '' };
      case 'submitted': return { label: 'Submitted', css: 'done', icon: 'bi-check-circle-fill' };
      case 'awaiting_review': return { label: 'Action needed', css: 'warn', icon: 'bi-hand-index-thumb-fill' };
      case 'unconfirmed': return { label: 'Unconfirmed', css: 'warn', icon: 'bi-question-circle-fill' };
      case 'cancelled': return { label: 'Cancelled', css: 'pending', icon: 'bi-slash-circle' };
      default: return { label: 'Not submitted', css: 'error', icon: 'bi-x-circle-fill' };
    }
  }

  /** Keep refreshing while the run or any of its applications is still working */
  private autopilotActive(): boolean {
    const status = this.autopilot();
    return !!status?.running
      || this.runApplications().some(a => a.status === 'pending')
      || this.actionItems().length > 0;
  }

  async loadAutopilotStatus(): Promise<void> {
    try {
      this.autopilot.set(await firstValueFrom(this.automationService.getAutopilotStatus()));
    } catch {
      this.autopilot.set(null);
    }
  }

  async runAutopilotNow(): Promise<void> {
    this.startingAutopilot.set(true);
    try {
      const result = await firstValueFrom(this.automationService.runAutopilot());
      this.toastr.info(result.message);
      this.autopilot.update(a => a ? { ...a, running: true } : a);
      this.pollAutopilotUntilDone();
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to start autopilot');
    } finally {
      this.startingAutopilot.set(false);
    }
  }

  /** A run takes a few minutes (fetching + scoring + applying); refresh the card until everything finishes */
  private pollAutopilotUntilDone(): void {
    clearInterval(this.autopilotPoll);
    let announced = !this.autopilot()?.running;
    this.autopilotPoll = setInterval(async () => {
      await this.loadAutopilotStatus();
      const status = this.autopilot();
      if (!announced && !status?.running) {
        announced = true;
        this.announceRunResult();
      }
      if (!this.autopilotActive()) clearInterval(this.autopilotPoll);
    }, 5000);
  }

  private announceRunResult(): void {
    const run = this.autopilot()?.lastRun;
    if (run?.error) {
      this.toastr.error(`Autopilot failed: ${run.error}`);
    } else if (run?.result?.skippedReason) {
      this.toastr.warning(`Autopilot did not apply: ${run.result.skippedReason}`, undefined, { timeOut: 10000 });
    } else if (run?.result) {
      this.toastr.success(`Autopilot queued ${run.result.queued} application(s). Follow each one below.`);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.autopilotPoll);
  }
  
  private async loadDashboardData(): Promise<void> {
    try {
      // Load jobs and applications in parallel
      await Promise.all([
        this.jobService.getJobs({ minMatchScore: 70 }, 1, 10).toPromise(),
        this.applicationService.getApplications({}, 1, 10).toPromise()
      ]);
      
      // Calculate stats
      this.stats.set({
        totalJobs: this.jobService.totalJobs(),
        totalApplications: this.applicationService.totalApplications(),
        pendingApplications: this.applicationService.pendingApplications(),
        successfulApplications: this.applicationService.submittedApplications(),
        averageMatchScore: this.calculateAverageMatchScore()
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      this.loading.set(false);
    }
  }
  
  private calculateAverageMatchScore(): number {
    const jobs = this.jobService.jobs();
    if (jobs.length === 0) return 0;
    
    const total = jobs.reduce((sum, job) => sum + (job.matchScore ?? 0), 0);
    return Math.round(total / jobs.length);
  }
  
  refreshData(): void {
    this.loading.set(true);
    this.loadDashboardData();
  }
}
