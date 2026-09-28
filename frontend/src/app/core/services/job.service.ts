import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@environments/environment';
import { Job, JobFilters, PaginatedResponse, ApiResponse, InternetSearchResult } from '@models/index';

@Injectable({
  providedIn: 'root'
})
export class JobService {
  private http = inject(HttpClient);
  
  // Reactive state with signals
  private jobsSignal = signal<Job[]>([]);
  private selectedJobSignal = signal<Job | null>(null);
  private loadingSignal = signal<boolean>(false);
  private totalJobsSignal = signal<number>(0);
  
  // Computed values
  jobs = this.jobsSignal.asReadonly();
  selectedJob = this.selectedJobSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();
  totalJobs = this.totalJobsSignal.asReadonly();
  
  // Computed filtered jobs
  highMatchJobs = computed(() => 
    this.jobsSignal().filter(job => (job.matchScore ?? 0) >= 75)
  );
  
  getJobs(filters?: JobFilters, page: number = 1, limit: number = 20): Observable<PaginatedResponse<Job>> {
    this.loadingSignal.set(true);
    
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (filters) {
      if (filters.search) params = params.set('search', filters.search);
      if (filters.jobTypes?.length) params = params.set('jobTypes', filters.jobTypes.join(','));
      if (filters.locations?.length) params = params.set('locations', filters.locations.join(','));
      if (filters.remote !== undefined) params = params.set('remote', filters.remote.toString());
      if (filters.minMatchScore) params = params.set('minMatchScore', filters.minMatchScore.toString());
      if (filters.status?.length) params = params.set('status', filters.status.join(','));
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params = params.set('sortOrder', filters.sortOrder);
    }
    
    return this.http.get<PaginatedResponse<Job>>(`${environment.apiUrl}/jobs`, { params }).pipe(
      tap(response => {
        this.jobsSignal.set(response.data);
        this.totalJobsSignal.set(response.total);
        this.loadingSignal.set(false);
      })
    );
  }
  
  getJobById(id: string): Observable<ApiResponse<Job>> {
    this.loadingSignal.set(true);
    return this.http.get<ApiResponse<Job>>(`${environment.apiUrl}/jobs/${id}`).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.selectedJobSignal.set(response.data);
        }
        this.loadingSignal.set(false);
      })
    );
  }
  
  updateJobStatus(id: string, status: string): Observable<ApiResponse<Job>> {
    return this.http.patch<ApiResponse<Job>>(`${environment.apiUrl}/jobs/${id}/status`, { status }).pipe(
      tap(response => {
        if (response.success && response.data) {
          // Update job in the list
          const jobs = this.jobsSignal();
          const index = jobs.findIndex(j => j.id === id);
          if (index !== -1) {
            jobs[index] = response.data;
            this.jobsSignal.set([...jobs]);
          }
        }
      })
    );
  }
  
  saveJob(id: string): Observable<ApiResponse<Job>> {
    return this.http.post<ApiResponse<Job>>(`${environment.apiUrl}/jobs/${id}/save`, {});
  }
  
  triggerJobFetch(): Observable<ApiResponse<{ jobsFetched: number }>> {
    return this.http.post<ApiResponse<{ jobsFetched: number }>>(
      `${environment.apiUrl}/jobs/fetch`,
      {}
    );
  }
  
  getSimilarJobs(jobId: string): Observable<ApiResponse<Job[]>> {
    return this.http.get<ApiResponse<Job[]>>(`${environment.apiUrl}/jobs/${jobId}/similar`);
  }

  searchInternet(query: string, location?: string, page?: number): Observable<ApiResponse<InternetSearchResult>> {
    return this.http.post<ApiResponse<InternetSearchResult>>(
      `${environment.apiUrl}/jobs/search-internet`,
      { query, location, page }
    );
  }
}
