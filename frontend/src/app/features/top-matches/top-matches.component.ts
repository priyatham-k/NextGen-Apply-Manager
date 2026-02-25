import { Component, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription, firstValueFrom } from 'rxjs';
import { MatchingService } from '@core/services/matching.service';
import { AutomationService } from '@core/services/automation.service';
import { AuthService } from '@core/services/auth.service';
import { JobMatch } from '@models/index';

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
    // Add to automating set
    const automating = this.automatingJobIds();
    automating.add(jobId);
    this.automatingJobIds.set(new Set(automating));

    try {
      const response = await firstValueFrom(
        this.automationService.applyToJob(jobId)
      );
      this.toastr.info('Application queued for automation');
    } catch (error: any) {
      // Remove from automating set on error
      automating.delete(jobId);
      this.automatingJobIds.set(new Set(automating));

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

  async bulkAutoApply(): Promise<void> {
    const selectedIds = Array.from(this.selectedJobIds());
    if (selectedIds.length === 0) {
      this.toastr.warning('Please select jobs to apply to');
      return;
    }

    this.isBulkAutomating.set(true);
    const automating = this.automatingJobIds();
    selectedIds.forEach(id => automating.add(id));
    this.automatingJobIds.set(new Set(automating));

    try {
      const response = await firstValueFrom(
        this.automationService.applyToBulk(selectedIds)
      );
      this.toastr.success(`${selectedIds.length} applications queued for automation`);
    } catch (error: any) {
      this.isBulkAutomating.set(false);
      selectedIds.forEach(id => automating.delete(id));
      this.automatingJobIds.set(new Set(automating));

      if (error.error?.action === 'complete_profile') {
        this.profileError.set({
          message: error.error.message,
          missingFields: error.error.criticalMissing || error.error.missingFields || []
        });
      } else {
        const errorMessage = error.error?.message || 'Failed to start bulk automation';
        this.toastr.error(errorMessage);
      }
    }
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
