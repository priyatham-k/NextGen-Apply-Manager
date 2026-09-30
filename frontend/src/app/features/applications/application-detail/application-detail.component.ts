import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ApplicationService } from '@core/services/application.service';
import { AutomationService } from '@core/services/automation.service';
import { Application, ApplicationStatus } from '@models/index';
import { environment } from '../../../../environments/environment';
import { StepTimelineComponent } from '@shared/components/step-timeline/step-timeline.component';

@Component({
  selector: 'app-application-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, StepTimelineComponent],
  templateUrl: './application-detail.component.html',
  styleUrls: ['./application-detail.component.scss']
})
export class ApplicationDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private applicationService = inject(ApplicationService);
  private automationService = inject(AutomationService);
  private toastr = inject(ToastrService);

  application = signal<Application | null>(null);
  loading = signal(true);
  updatingStatus = signal(false);
  retrying = signal(false);
  cancelling = signal(false);
  submitting = signal(false);
  stepsOpen = signal(true);
  private refreshTimer?: ReturnType<typeof setInterval>;
  discarding = signal(false);

  statuses = Object.values(ApplicationStatus);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadApplication(id);
      // Keep the step timeline live while automation is working on this application
      this.refreshTimer = setInterval(() => {
        if (this.application()?.status === ApplicationStatus.PENDING) this.loadApplication(id, true);
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
  }

  async loadApplication(id: string, silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    try {
      const response = await firstValueFrom(this.applicationService.getApplicationById(id));
      if (response.success && response.data) {
        this.application.set(response.data);
      }
    } catch {
      this.toastr.error('Failed to load application details');
    } finally {
      this.loading.set(false);
    }
  }

  async onStatusChange(newStatus: ApplicationStatus): Promise<void> {
    const app = this.application();
    if (!app) return;

    this.updatingStatus.set(true);
    try {
      await firstValueFrom(
        this.applicationService.updateApplicationStatus(app.id, newStatus)
      );
      this.application.update(a => a ? { ...a, status: newStatus } : a);
      this.toastr.success('Status updated');
    } catch {
      this.toastr.error('Failed to update status');
    } finally {
      this.updatingStatus.set(false);
    }
  }

  async deleteApplication(): Promise<void> {
    const app = this.application();
    if (!app) return;

    try {
      await firstValueFrom(this.applicationService.deleteApplication(app.id));
      this.toastr.success('Application deleted');
      this.router.navigate(['/applications']);
    } catch {
      this.toastr.error('Failed to delete application');
    }
  }

  async retryAutomation(): Promise<void> {
    const app = this.application();
    if (!app) return;

    this.retrying.set(true);
    try {
      await firstValueFrom(this.automationService.retryAutomation(app.id));
      this.toastr.info('Automation retry queued');
      this.application.update(a => a ? { ...a, status: ApplicationStatus.PENDING } : a);
    } catch {
      this.toastr.error('Failed to retry automation');
    } finally {
      this.retrying.set(false);
    }
  }

  async cancelAutomation(): Promise<void> {
    const app = this.application();
    if (!app) return;

    this.cancelling.set(true);
    try {
      await firstValueFrom(this.automationService.cancelAutomation(app.id));
      this.toastr.success('Automation cancelled');
      this.application.update(a => a ? { ...a, status: ApplicationStatus.CANCELLED } : a);
    } catch {
      this.toastr.error('Failed to cancel automation');
    } finally {
      this.cancelling.set(false);
    }
  }

  async submitReviewed(): Promise<void> {
    const app = this.application();
    if (!app) return;

    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.automationService.submitReviewed(app.id));
      if (result.status === ApplicationStatus.SUBMITTED) {
        this.toastr.success(result.message);
      } else {
        this.toastr.warning(result.message);
      }
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to submit application');
    } finally {
      this.submitting.set(false);
      await this.loadApplication(app.id);
    }
  }

  async discardReview(): Promise<void> {
    const app = this.application();
    if (!app) return;

    this.discarding.set(true);
    try {
      await firstValueFrom(this.automationService.discardReview(app.id));
      this.toastr.info('Discarded without submitting');
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to discard application');
    } finally {
      this.discarding.set(false);
      await this.loadApplication(app.id);
    }
  }

  /** The site stopped the automated submit and wants a person (verification code, spam check) */
  isHumanCheck(): boolean {
    return !!this.application()?.errorLog?.startsWith('Action needed');
  }

  async focusTab(): Promise<void> {
    const app = this.application();
    if (!app) return;
    try {
      await firstValueFrom(this.automationService.focusTab(app.id));
      this.toastr.info('Switch to the automation browser window — the tab is in front');
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'The tab is no longer open');
    }
  }

  async confirmSubmitted(): Promise<void> {
    const app = this.application();
    if (!app) return;
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.automationService.confirmSubmitted(app.id));
      this.toastr.success(result.message);
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to update the application');
    } finally {
      this.submitting.set(false);
      await this.loadApplication(app.id);
    }
  }

  canRetry(status: string): boolean {
    return [ApplicationStatus.FAILED, ApplicationStatus.UNCONFIRMED, ApplicationStatus.CANCELLED]
      .includes(status as ApplicationStatus);
  }

  goBack(): void {
    this.router.navigate(['/applications']);
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      [ApplicationStatus.PENDING]: 'status-pending',
      [ApplicationStatus.AWAITING_REVIEW]: 'status-review',
      [ApplicationStatus.SUBMITTED]: 'status-submitted',
      [ApplicationStatus.UNCONFIRMED]: 'status-pending',
      [ApplicationStatus.CANCELLED]: 'status-declined',
      [ApplicationStatus.FAILED]: 'status-failed',
      [ApplicationStatus.IN_REVIEW]: 'status-review',
      [ApplicationStatus.REJECTED]: 'status-rejected',
      [ApplicationStatus.INTERVIEW_SCHEDULED]: 'status-interview',
      [ApplicationStatus.OFFER_RECEIVED]: 'status-offer',
      [ApplicationStatus.ACCEPTED]: 'status-accepted',
      [ApplicationStatus.DECLINED]: 'status-declined',
    };
    return map[status] || 'status-pending';
  }

  getScreenshots(): Array<{ url: string; label: string }> {
    const app = this.application();
    if (!app || !app.screenshots || app.screenshots.length === 0) {
      return [];
    }

    return app.screenshots.map((screenshotPath: string) => {
      // Extract filename from path (e.g., "uploads/screenshots/userId/appId/screenshot-initial-123.png")
      const filename = screenshotPath.split('/').pop() || screenshotPath.split('\\').pop() || '';

      // Determine label based on filename
      let label = 'Screenshot';
      if (filename.includes('initial')) {
        label = 'Job Page';
      } else if (filename.includes('filled')) {
        label = 'Filled Form (before submit)';
      } else if (filename.includes('after-submit') || filename.includes('success')) {
        label = 'After Submit';
      } else if (filename.includes('error')) {
        label = 'Error Screenshot';
      }

      // Construct API URL
      const url = `${environment.apiUrl}/applications/${app.id}/screenshots/${filename}`;

      return { url, label };
    });
  }
}
