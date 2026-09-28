import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@environments/environment';
import { Application, ApplicationFilters, PaginatedResponse, ApiResponse, ApplicationStatus } from '@models/index';

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  private http = inject(HttpClient);
  
  // Signals for reactive state
  private applicationsSignal = signal<Application[]>([]);
  private loadingSignal = signal<boolean>(false);
  private totalApplicationsSignal = signal<number>(0);
  
  // Read-only computed signals
  applications = this.applicationsSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();
  totalApplications = this.totalApplicationsSignal.asReadonly();
  
  // Computed statistics
  pendingApplications = computed(() => 
    this.applicationsSignal().filter(app => app.status === ApplicationStatus.PENDING).length
  );
  
  submittedApplications = computed(() => 
    this.applicationsSignal().filter(app => app.status === ApplicationStatus.SUBMITTED).length
  );
  
  failedApplications = computed(() => 
    this.applicationsSignal().filter(app => app.status === ApplicationStatus.FAILED).length
  );
  
  getApplications(filters?: ApplicationFilters, page: number = 1, limit: number = 20): Observable<PaginatedResponse<Application>> {
    this.loadingSignal.set(true);
    
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (filters) {
      if (filters.search) params = params.set('search', filters.search);
      if (filters.status?.length) params = params.set('status', filters.status.join(','));
      if (filters.submissionType?.length) params = params.set('submissionType', filters.submissionType.join(','));
      if (filters.atsType?.length) params = params.set('atsType', filters.atsType.join(','));
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params = params.set('sortOrder', filters.sortOrder);
    }
    
    return this.http.get<PaginatedResponse<Application>>(`${environment.apiUrl}/applications`, { params }).pipe(
      tap(response => {
        this.applicationsSignal.set(response.data);
        this.totalApplicationsSignal.set(response.total);
        this.loadingSignal.set(false);
      })
    );
  }
  
  getApplicationById(id: string): Observable<ApiResponse<Application>> {
    return this.http.get<ApiResponse<Application>>(`${environment.apiUrl}/applications/${id}`);
  }
  
  createApplication(jobId: string, resumeId: string, coverLetterId?: string): Observable<ApiResponse<Application>> {
    return this.http.post<ApiResponse<Application>>(`${environment.apiUrl}/applications`, {
      jobId,
      resumeId,
      coverLetterId
    }).pipe(
      tap(response => {
        if (response.success && response.data) {
          // Add to local state
          const apps = this.applicationsSignal();
          this.applicationsSignal.set([response.data, ...apps]);
          this.totalApplicationsSignal.update(total => total + 1);
        }
      })
    );
  }
  
  updateApplicationStatus(id: string, status: ApplicationStatus, notes?: string): Observable<ApiResponse<Application>> {
    return this.http.patch<ApiResponse<Application>>(
      `${environment.apiUrl}/applications/${id}/status`,
      { status, notes }
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          const apps = this.applicationsSignal();
          const index = apps.findIndex(app => app.id === id);
          if (index !== -1) {
            apps[index] = response.data;
            this.applicationsSignal.set([...apps]);
          }
        }
      })
    );
  }
  
  retryFailedApplication(id: string): Observable<ApiResponse<Application>> {
    return this.http.post<ApiResponse<Application>>(
      `${environment.apiUrl}/applications/${id}/retry`,
      {}
    );
  }
  
  deleteApplication(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${environment.apiUrl}/applications/${id}`).pipe(
      tap(response => {
        if (response.success) {
          const apps = this.applicationsSignal().filter(app => app.id !== id);
          this.applicationsSignal.set(apps);
          this.totalApplicationsSignal.update(total => total - 1);
        }
      })
    );
  }
  
  getApplicationStats(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${environment.apiUrl}/applications/stats`);
  }
}
