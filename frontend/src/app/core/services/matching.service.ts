import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize } from 'rxjs';
import { environment } from '@environments/environment';
import { JobMatch, JobMatchesResponse, ApiResponse } from '@models/index';

@Injectable({
  providedIn: 'root'
})
export class MatchingService {
  private http = inject(HttpClient);

  private matchesSignal = signal<JobMatch[]>([]);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  matches = this.matchesSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();
  error = this.errorSignal.asReadonly();

  // Computed signals for filtering matches by quality
  excellentMatches = computed(() =>
    this.matchesSignal().filter(m => m.matchScore >= 80)
  );

  goodMatches = computed(() =>
    this.matchesSignal().filter(m => m.matchScore >= 60 && m.matchScore < 80)
  );

  potentialMatches = computed(() =>
    this.matchesSignal().filter(m => m.matchScore < 60)
  );

  /**
   * Load top matching jobs for the current user
   */
  loadTopMatches(limit: number = 20): Observable<ApiResponse<JobMatchesResponse>> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.http.get<ApiResponse<JobMatchesResponse>>(
      `${environment.apiUrl}/matching/top-matches?limit=${limit}`
    ).pipe(
      tap(res => {
        if (res.success && res.data?.matches) {
          this.matchesSignal.set(res.data.matches);
        }
      }),
      tap({
        error: (err) => {
          if (err.error?.profileRequired) {
            this.errorSignal.set('Please complete your profile to see job matches');
          } else {
            this.errorSignal.set(err.error?.error || 'Failed to load job matches');
          }
        }
      }),
      finalize(() => this.loadingSignal.set(false))
    );
  }

  /**
   * Get detailed match information for a specific job
   */
  getMatchDetails(jobId: string): Observable<ApiResponse<JobMatch>> {
    return this.http.get<ApiResponse<JobMatch>>(
      `${environment.apiUrl}/matching/jobs/${jobId}/details`
    );
  }

  /**
   * Refresh/recalculate matches
   */
  refreshMatches(): Observable<ApiResponse<JobMatchesResponse>> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.http.post<ApiResponse<JobMatchesResponse>>(
      `${environment.apiUrl}/matching/refresh`,
      {}
    ).pipe(
      tap(res => {
        if (res.success && res.data?.matches) {
          this.matchesSignal.set(res.data.matches);
        }
      }),
      tap({
        error: (err) => {
          if (err.error?.profileRequired) {
            this.errorSignal.set('Please complete your profile to see job matches');
          } else {
            this.errorSignal.set(err.error?.error || 'Failed to refresh matches');
          }
        }
      }),
      finalize(() => this.loadingSignal.set(false))
    );
  }

  /**
   * Clear matches and error state
   */
  clearMatches(): void {
    this.matchesSignal.set([]);
    this.errorSignal.set(null);
  }
}
