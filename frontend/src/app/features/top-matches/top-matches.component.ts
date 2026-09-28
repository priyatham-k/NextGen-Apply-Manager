import { Component, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription, firstValueFrom } from 'rxjs';
import { MatchingService } from '@core/services/matching.service';
import { AutomationService } from '@core/services/automation.service';
import { CoverLetterService } from '@core/services/coverLetter.service';
import { AuthService } from '@core/services/auth.service';
import { JobMatch, UploadedResume } from '@models/index';

@Component({
  selector: 'app-top-matches',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './top-matches.component.html',
  styleUrls: ['./top-matches.component.scss']
})
export class TopMatchesComponent implements OnInit, OnDestroy {
  private matchingService = inject(MatchingService);
  private automationService = inject(AutomationService);
  private coverLetterService = inject(CoverLetterService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  // Service state
  matches = this.matchingService.matches;
  loading = this.matchingService.loading;
  error = this.matchingService.error;

  // Filter state
  selectedFilter = signal<'all' | 'excellent' | 'good' | 'potential'>('all');

  // Bulk selection state
  selectedJobIds = signal<Set<string>>(new Set());

  // Automation state
  automatingJobIds = signal<Set<string>>(new Set());
  isBulkAutomating = signal(false);

  // Apply modal state
  showApplyModal = signal(false);
  uploadedResumes = signal<UploadedResume[]>([]);
  coverLetters = this.coverLetterService.coverLetters;
  selectedResumeId = signal<string | null>(null);
  selectedCoverLetterId = signal<string | null>(null);
  loadingModalData = signal(false);
  pendingJobId = signal<string | null>(null);
  pendingBulkJobIds = signal<string[]>([]);

  // Profile completion error state
  profileError = signal<{ message: string; missingFields: string[] } | null>(null);

  private subscriptions: Subscription[] = [];

  // Computed filtered matches
  filteredMatches = computed(() => {
    const filter = this.selectedFilter();
    const allMatches = this.matches();

    switch (filter) {
      case 'excellent':
        return allMatches.filter(m => m.matchScore >= 80);
      case 'good':
        return allMatches.filter(m => m.matchScore >= 60 && m.matchScore < 80);
      case 'potential':
        return allMatches.filter(m => m.matchScore < 60);
      default:
        return allMatches;
    }
  });

  // Match count by category
  excellentCount = computed(() =>
    this.matches().filter(m => m.matchScore >= 80).length
  );

  goodCount = computed(() =>
    this.matches().filter(m => m.matchScore >= 60 && m.matchScore < 80).length
  );

  potentialCount = computed(() =>
    this.matches().filter(m => m.matchScore < 60).length
  );

  ngOnInit(): void {
    this.loadMatches();

    // Initialize Socket.IO for automation updates
    const token = this.authService.getToken();
    if (token) {
      this.automationService.initializeSocket(token);
    }

    // Subscribe to automation completion
    this.subscriptions.push(
      this.automationService.complete$.subscribe(result => {
        const automating = this.automatingJobIds();
        automating.delete(result.applicationId);
        this.automatingJobIds.set(new Set(automating));

        if (result.status === 'success') {
          this.toastr.success('Application submitted successfully!');
        } else {
          this.toastr.error(result.error || 'Automation failed');
        }

        // Check if bulk automation is complete
        if (this.isBulkAutomating() && automating.size === 0) {
          this.isBulkAutomating.set(false);
          this.clearSelection();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadMatches(): void {
    this.matchingService.loadTopMatches(20).subscribe({
      error: (err) => {
        console.error('Failed to load matches:', err);
      }
    });
  }

  refreshMatches(): void {
    this.matchingService.refreshMatches().subscribe({
      error: (err) => {
        console.error('Failed to refresh matches:', err);
      }
    });
  }

  setFilter(filter: 'all' | 'excellent' | 'good' | 'potential'): void {
    this.selectedFilter.set(filter);
  }

  getMatchScoreClass(score: number): string {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    return 'potential';
  }

  getMatchScoreBadgeColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#1DA1F2';
    return '#94a3b8';
  }

  navigateToJob(jobId: string): void {
    this.router.navigate(['/jobs', jobId]);
  }

  async autoApplyToJob(jobId: string): Promise<void> {
    this.pendingJobId.set(jobId);
    this.pendingBulkJobIds.set([]);
    await this.openApplyModal();
  }

  async bulkAutoApply(): Promise<void> {
    const selectedIds = Array.from(this.selectedJobIds());
    if (selectedIds.length === 0) {
      this.toastr.warning('Please select jobs to apply to');
      return;
    }
    this.pendingJobId.set(null);
    this.pendingBulkJobIds.set(selectedIds);
    await this.openApplyModal();
  }

  private async openApplyModal(): Promise<void> {
    this.showApplyModal.set(true);
    this.loadingModalData.set(true);
    this.selectedResumeId.set(null);
    this.selectedCoverLetterId.set(null);

    try {
      const [resumeRes] = await Promise.all([
        firstValueFrom(this.automationService.getUploadedResumes()),
        firstValueFrom(this.coverLetterService.loadCoverLetters())
      ]);

      if (resumeRes.success) {
        const resumes = resumeRes.data as UploadedResume[];
        this.uploadedResumes.set(resumes);
        const primary = resumes.find(r => r.isPrimary);
        if (primary) this.selectedResumeId.set(primary._id);
      }
    } catch {
      this.toastr.error('Failed to load resumes and cover letters');
    } finally {
      this.loadingModalData.set(false);
    }
  }

  closeApplyModal(): void {
    this.showApplyModal.set(false);
    this.pendingJobId.set(null);
    this.pendingBulkJobIds.set([]);
  }

  async confirmAutoApply(): Promise<void> {
    const resumeId = this.selectedResumeId() || undefined;
    const coverLetterId = this.selectedCoverLetterId() || undefined;
    this.showApplyModal.set(false);

    const jobId = this.pendingJobId();
    const bulkIds = this.pendingBulkJobIds();

    if (jobId) {
      // Single apply
      const automating = this.automatingJobIds();
      automating.add(jobId);
      this.automatingJobIds.set(new Set(automating));

      try {
        await firstValueFrom(
          this.automationService.applyToJob(jobId, resumeId, coverLetterId)
        );
        this.toastr.info('Application queued for automation');
      } catch (error: any) {
        automating.delete(jobId);
        this.automatingJobIds.set(new Set(automating));

        if (error.error?.action === 'complete_profile') {
          this.profileError.set({
            message: error.error.message,
            missingFields: error.error.criticalMissing || error.error.missingFields || []
          });
        } else {
          this.toastr.error(error.error?.message || 'Failed to start automation');
        }
      }
    } else if (bulkIds.length > 0) {
      // Bulk apply
      this.isBulkAutomating.set(true);
      const automating = this.automatingJobIds();
      bulkIds.forEach(id => automating.add(id));
      this.automatingJobIds.set(new Set(automating));

      try {
        await firstValueFrom(
          this.automationService.applyToBulk(bulkIds, resumeId, coverLetterId)
        );
        this.toastr.success(`${bulkIds.length} applications queued for automation`);
      } catch (error: any) {
        this.isBulkAutomating.set(false);
        bulkIds.forEach(id => automating.delete(id));
        this.automatingJobIds.set(new Set(automating));

        if (error.error?.action === 'complete_profile') {
          this.profileError.set({
            message: error.error.message,
            missingFields: error.error.criticalMissing || error.error.missingFields || []
          });
        } else {
          this.toastr.error(error.error?.message || 'Failed to start bulk automation');
        }
      }
    }

    this.pendingJobId.set(null);
    this.pendingBulkJobIds.set([]);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  isJobAutomating(jobId: string): boolean {
    return this.automatingJobIds().has(jobId);
  }

  dismissProfileError(): void {
    this.profileError.set(null);
  }

  navigateToProfile(): void {
    this.router.navigate(['/profile']);
  }

  // Bulk selection methods
  toggleJobSelection(jobId: string): void {
    const selected = this.selectedJobIds();
    const newSelected = new Set(selected);

    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }

    this.selectedJobIds.set(newSelected);
  }

  isJobSelected(jobId: string): boolean {
    return this.selectedJobIds().has(jobId);
  }

  selectAll(): void {
    const allJobIds = this.filteredMatches().map(m => m.job.id);
    this.selectedJobIds.set(new Set(allJobIds));
  }

  clearSelection(): void {
    this.selectedJobIds.set(new Set());
  }

  get selectedCount(): number {
    return this.selectedJobIds().size;
  }
}
