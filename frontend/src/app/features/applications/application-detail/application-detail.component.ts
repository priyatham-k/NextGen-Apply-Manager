import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ApplicationService } from '@core/services/application.service';
import { AutomationService } from '@core/services/automation.service';
import { Application, ApplicationStatus } from '@models/index';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-application-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './application-detail.component.html',
  styleUrls: ['./application-detail.component.scss']
})
export class ApplicationDetailComponent implements OnInit {
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

  statuses = Object.values(ApplicationStatus);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadApplication(id);
    }
  }

  async loadApplication(id: string): Promise<void> {
    this.loading.set(true);
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
      this.application.update(a => a ? { ...a, status: ApplicationStatus.FAILED } : a);
    } catch {
      this.toastr.error('Failed to cancel automation');
    } finally {
      this.cancelling.set(false);
    }
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
      [ApplicationStatus.SUBMITTED]: 'status-submitted',
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

    return app.screenshots.map((screenshotPath: string, index: number) => {
      // Extract filename from path (e.g., "uploads/screenshots/userId/appId/screenshot-initial-123.png")
      const filename = screenshotPath.split('/').pop() || screenshotPath.split('\\').pop() || '';

      // Determine label based on filename
      let label = 'Screenshot';
      if (filename.includes('initial')) {
        label = 'Before Submission';
      } else if (filename.includes('success')) {
        label = 'After Submission';
      } else if (filename.includes('error')) {
        label = 'Error Screenshot';
      }

      // Construct API URL
      const url = `${environment.apiUrl}/applications/${app.id}/screenshots/${filename}`;

      return { url, label };
    });
  }
}
