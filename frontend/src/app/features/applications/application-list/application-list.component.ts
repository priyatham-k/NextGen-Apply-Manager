import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ApplicationService } from '@core/services/application.service';
import {
  Application,
  ApplicationStatus,
  SubmissionType,
  ApplicationFilters
} from '@models/index';

@Component({
  selector: 'app-application-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './application-list.component.html',
  styleUrls: ['./application-list.component.scss']
})
export class ApplicationListComponent implements OnInit {
  private applicationService = inject(ApplicationService);
  private toastr = inject(ToastrService);

  // State from service
  applications = this.applicationService.applications;
  totalApplications = this.applicationService.totalApplications;
  loading = this.applicationService.loading;

  // Filters
  searchQuery = signal('');
  selectedStatus = signal('');
  selectedType = signal('');
  sortBy = signal<string>('appliedDate');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // Pagination
  currentPage = signal(1);
  pageSize = signal(15);
  totalPages = signal(0);

  // Manual add modal
  showAddModal = signal(false);
  addForm = signal({
    company: '',
    position: '',
    location: '',
    applicationUrl: '',
    status: ApplicationStatus.SUBMITTED as string,
    submissionType: SubmissionType.MANUAL as string,
    notes: '',
    appliedDate: new Date().toISOString().split('T')[0]
  });
  saving = signal(false);

  // Delete confirmation
  showDeleteConfirm = signal(false);
  deleteTarget = signal<Application | null>(null);
  deleting = signal(false);

  // Enum references
  statuses = Object.values(ApplicationStatus);
  submissionTypes = Object.values(SubmissionType);

  // Stats
  stats = computed(() => {
    const apps = this.applications();
    return {
      total: this.totalApplications(),
      submitted: apps.filter(a => a.status === ApplicationStatus.SUBMITTED).length,
      inReview: apps.filter(a => a.status === ApplicationStatus.IN_REVIEW).length,
      interview: apps.filter(a => a.status === ApplicationStatus.INTERVIEW_SCHEDULED).length,
      offers: apps.filter(a => a.status === ApplicationStatus.OFFER_RECEIVED).length,
      rejected: apps.filter(a => a.status === ApplicationStatus.REJECTED).length,
      pending: apps.filter(a => a.status === ApplicationStatus.PENDING).length,
    };
  });

  ngOnInit(): void {
    this.loadApplications();
  }

  async loadApplications(): Promise<void> {
    const filters: ApplicationFilters = {};

    const search = this.searchQuery();
    if (search) filters.search = search;

    const status = this.selectedStatus();
    if (status) filters.status = [status as ApplicationStatus];

    const type = this.selectedType();
    if (type) filters.submissionType = [type as SubmissionType];

    filters.sortBy = this.sortBy() as ApplicationFilters['sortBy'];
    filters.sortOrder = this.sortOrder();

    try {
      const response = await firstValueFrom(
        this.applicationService.getApplications(filters, this.currentPage(), this.pageSize())
      );
      this.totalPages.set(response.totalPages);
    } catch {
      this.toastr.error('Failed to load applications');
    }
  }

  onSearch(): void {
    this.currentPage.set(1);
    this.loadApplications();
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadApplications();
  }

  onSortChange(field: string): void {
    if (this.sortBy() === field) {
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('desc');
    }
    this.loadApplications();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadApplications();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
    this.selectedType.set('');
    this.sortBy.set('appliedDate');
    this.sortOrder.set('desc');
    this.currentPage.set(1);
    this.loadApplications();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchQuery() || this.selectedStatus() || this.selectedType());
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

  // Status management
  async updateStatus(app: Application, newStatus: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(
        this.applicationService.updateApplicationStatus(app.id, newStatus as ApplicationStatus)
      );
      this.toastr.success('Status updated');
    } catch {
      this.toastr.error('Failed to update status');
    }
  }

  // Manual add modal
  openAddModal(): void {
    this.addForm.set({
      company: '',
      position: '',
      location: '',
      applicationUrl: '',
      status: ApplicationStatus.SUBMITTED,
      submissionType: SubmissionType.MANUAL,
      notes: '',
      appliedDate: new Date().toISOString().split('T')[0]
    });
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  updateAddForm(field: string, value: string): void {
    this.addForm.update(form => ({ ...form, [field]: value }));
  }

  async submitManualApplication(): Promise<void> {
    const form = this.addForm();
    if (!form.company || !form.position) {
      this.toastr.warning('Company and position are required');
      return;
    }

    this.saving.set(true);
    try {
      await firstValueFrom(
        this.applicationService.createApplication('manual', 'manual')
      );
      this.toastr.success('Application added successfully');
      this.closeAddModal();
      this.loadApplications();
    } catch {
      this.toastr.error('Failed to add application');
    } finally {
      this.saving.set(false);
    }
  }

  // Delete
  confirmDelete(app: Application, event: Event): void {
    event.stopPropagation();
    this.deleteTarget.set(app);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
    this.showDeleteConfirm.set(false);
  }

  async deleteApplication(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;

    this.deleting.set(true);
    try {
      await firstValueFrom(this.applicationService.deleteApplication(target.id));
      this.toastr.success('Application deleted');
      this.cancelDelete();
      this.loadApplications();
    } catch {
      this.toastr.error('Failed to delete application');
    } finally {
      this.deleting.set(false);
    }
  }

  // Retry failed
  async retryApplication(app: Application, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(this.applicationService.retryFailedApplication(app.id));
      this.toastr.success('Application retry initiated');
      this.loadApplications();
    } catch {
      this.toastr.error('Failed to retry application');
    }
  }

  // Helpers
  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

  getStatusIcon(status: string): string {
    const map: Record<string, string> = {
      [ApplicationStatus.PENDING]: 'bi-hourglass-split',
      [ApplicationStatus.SUBMITTED]: 'bi-send-check',
      [ApplicationStatus.FAILED]: 'bi-exclamation-triangle',
      [ApplicationStatus.IN_REVIEW]: 'bi-eye',
      [ApplicationStatus.REJECTED]: 'bi-x-circle',
      [ApplicationStatus.INTERVIEW_SCHEDULED]: 'bi-calendar-event',
      [ApplicationStatus.OFFER_RECEIVED]: 'bi-trophy',
      [ApplicationStatus.ACCEPTED]: 'bi-check-circle',
      [ApplicationStatus.DECLINED]: 'bi-dash-circle',
    };
    return map[status] || 'bi-circle';
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}
