import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { JobService } from '@core/services/job.service';
import { Job, JobStatus } from '@models/index';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './job-detail.component.html',
  styleUrls: ['./job-detail.component.scss']
})
export class JobDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private jobService = inject(JobService);
  private toastr = inject(ToastrService);

  job = signal<Job | null>(null);
  loading = signal(true);
  updatingStatus = signal(false);

  // Enum reference for template
  statuses = Object.values(JobStatus);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadJob(id);
    } else {
      this.router.navigate(['/jobs']);
    }
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

  goBack(): void {
    this.router.navigate(['/jobs']);
  }
}
