import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { JobService } from '@core/services/job.service';
import { Job, JobType, ExperienceLevel, JobFilters } from '@models/index';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './job-list.component.html',
  styleUrls: ['./job-list.component.scss']
})
export class JobListComponent implements OnInit {
  private jobService = inject(JobService);
  private toastr = inject(ToastrService);

  // State
  jobs = this.jobService.jobs;
  totalJobs = this.jobService.totalJobs;
  loading = this.jobService.loading;
  fetching = signal(false);

  // Search & filters
  searchQuery = signal('');
  selectedJobType = signal('');
  selectedExperience = signal('');
  remoteOnly = signal(false);
  sortBy = signal<string>('postedDate');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // Pagination
  currentPage = signal(1);
  pageSize = signal(20);
  totalPages = signal(0);

  // Enum references for template
  jobTypes = Object.values(JobType);
  experienceLevels = Object.values(ExperienceLevel);

  ngOnInit(): void {
    this.loadJobs();
  }

  async loadJobs(): Promise<void> {
    const filters: JobFilters = {};

    const search = this.searchQuery();
    if (search) filters.search = search;

    const jobType = this.selectedJobType();
    if (jobType) filters.jobTypes = [jobType as JobType];

    const exp = this.selectedExperience();
    if (exp) filters.experienceLevels = [exp as ExperienceLevel];

    if (this.remoteOnly()) filters.remote = true;

    filters.sortBy = this.sortBy() as JobFilters['sortBy'];
    filters.sortOrder = this.sortOrder();

    try {
      const response = await firstValueFrom(
        this.jobService.getJobs(filters, this.currentPage(), this.pageSize())
      );
      this.totalPages.set(response.totalPages);
    } catch (error) {
      this.toastr.error('Failed to load jobs');
    }
  }

  onSearch(): void {
    this.currentPage.set(1);
    this.loadJobs();
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadJobs();
  }

  onSortChange(sortBy: string): void {
    if (this.sortBy() === sortBy) {
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(sortBy);
      this.sortOrder.set('desc');
    }
    this.loadJobs();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadJobs();
  }

  async fetchNewJobs(): Promise<void> {
    this.fetching.set(true);
    try {
      const response = await firstValueFrom(this.jobService.triggerJobFetch());
      if (response.success) {
        this.toastr.success(response.message || `Fetched ${response.data?.jobsFetched} jobs`);
        this.currentPage.set(1);
        await this.loadJobs();
      }
    } catch (error) {
      this.toastr.error('Failed to fetch new jobs');
    } finally {
      this.fetching.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedJobType.set('');
    this.selectedExperience.set('');
    this.remoteOnly.set(false);
    this.sortBy.set('postedDate');
    this.sortOrder.set('desc');
    this.currentPage.set(1);
    this.loadJobs();
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.searchQuery() ||
      this.selectedJobType() ||
      this.selectedExperience() ||
      this.remoteOnly()
    );
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;

    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    const end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  formatJobType(type: string): string {
    return type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatSalary(job: Job): string {
    if (!job.salary) return '';
    const { min, max, currency } = job.salary;
    const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : n.toString();
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
    if (min) return `${currency} ${fmt(min)}+`;
    if (max) return `Up to ${currency} ${fmt(max)}`;
    return '';
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const posted = new Date(date);
    const diffMs = now.getTime() - posted.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }
}
