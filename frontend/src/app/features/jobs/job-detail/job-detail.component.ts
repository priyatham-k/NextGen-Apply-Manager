import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { JobService } from '@core/services/job.service';
import { AutomationService } from '@core/services/automation.service';
import { AuthService } from '@core/services/auth.service';
import { Job, JobStatus } from '@models/index';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './job-detail.component.html',
  styleUrls: ['./job-detail.component.scss']
})
export class JobDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private jobService = inject(JobService);
  private automationService = inject(AutomationService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);

  job = signal<Job | null>(null);
  loading = signal(true);
  updatingStatus = signal(false);

  // Automation state
  isAutomating = signal(false);
  automationProgress = signal(0);
  automationMessage = signal('');

  // Profile completion error state
  profileError = signal<{ message: string; missingFields: string[] } | null>(null);

  private subscriptions: Subscription[] = [];

  // Enum reference for template
  statuses = Object.values(JobStatus);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadJob(id);
    } else {
      this.router.navigate(['/jobs']);
    }

    // Initialize Socket.IO for automation updates
    const token = this.authService.getToken();
    if (token) {
      this.automationService.initializeSocket(token);
    }

    // Subscribe to automation progress
    this.subscriptions.push(
      this.automationService.progress$.subscribe(progress => {
        this.automationProgress.set(progress.percentage);
        this.automationMessage.set(progress.message);
      })
    );

    // Subscribe to automation completion
    this.subscriptions.push(
      this.automationService.complete$.subscribe(result => {
        this.isAutomating.set(false);
        if (result.status === 'success') {
          this.toastr.success('Application submitted successfully!');
          this.router.navigate(['/applications']);
        } else {
          this.toastr.error(result.error || 'Automation failed');
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private async loadJob(id: string): Promise<void> {
    try {
      const response = await firstValueFrom(this.jobService.getJobById(id));
      if (response.success && response.data) {
        this.job.set(response.data);
      } else {
        this.toastr.error('Job not found');
        this.router.navigate(['/jobs']);
      }
    } catch (error) {
      this.toastr.error('Failed to load job details');
      this.router.navigate(['/jobs']);
    } finally {
      this.loading.set(false);
    }
  }

  async onStatusChange(status: string): Promise<void> {
    const job = this.job();
    if (!job) return;

    this.updatingStatus.set(true);
    try {
      const response = await firstValueFrom(
        this.jobService.updateJobStatus(job.id, status)
      );
      if (response.success && response.data) {
        this.job.set(response.data);
        this.toastr.success('Status updated');
      }
    } catch (error) {
      this.toastr.error('Failed to update status');
    } finally {
      this.updatingStatus.set(false);
    }
  }

  formatJobType(type: string): string {
    return type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatSalary(job: Job): string {
    if (!job.salary) return 'Not specified';
    const { min, max, currency } = job.salary;
    const fmt = (n: number) => n.toLocaleString();
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
    if (min) return `${currency} ${fmt(min)}+`;
    if (max) return `Up to ${currency} ${fmt(max)}`;
    return 'Not specified';
  }

  async autoApply(): Promise<void> {
    const job = this.job();
    if (!job) return;

    if (!job.applicationUrl) {
      this.toastr.error('This job does not have an application URL for automation');
      return;
    }

    // TODO: Add modal to select resume/cover letter
    this.isAutomating.set(true);
    this.automationProgress.set(0);
    this.automationMessage.set('Starting automation...');

    try {
      const response = await firstValueFrom(
        this.automationService.applyToJob(job.id)
      );
      this.toastr.info('Application queued for automation');
    } catch (error: any) {
      this.isAutomating.set(false);
      if (error.error?.action === 'complete_profile') {
        this.profileError.set({
          message: error.error.message,
          missingFields: error.error.criticalMissing || error.error.missingFields || []
        });
      } else {
        const errorMessage = error.error?.message || 'Failed to start automation';
        this.toastr.error(errorMessage);
      }
    }
  }

  dismissProfileError(): void {
    this.profileError.set(null);
  }

  navigateToProfile(): void {
    this.router.navigate(['/profile']);
  }

  goBack(): void {
    this.router.navigate(['/jobs']);
  }
}
