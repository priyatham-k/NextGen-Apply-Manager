import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '@environments/environment';
import { ApiResponse } from '@models/index';
import { ResumeTemplateData } from '@features/my-resumes/models';

@Injectable({
  providedIn: 'root'
})
export class ResumeGeneratorService {
  private http = inject(HttpClient);

  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);

  loading = this.loadingSignal.asReadonly();
  error = this.errorSignal.asReadonly();

  generateResume(jobDescription: string): Observable<ApiResponse<ResumeTemplateData>> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.http.post<ApiResponse<ResumeTemplateData>>(
      `${environment.apiUrl}/resume-generator/generate`,
      { jobDescription }
    ).pipe(
      tap(() => {
        this.loadingSignal.set(false);
      }),
      catchError(err => {
        this.loadingSignal.set(false);
        const message = err.error?.message || 'Failed to generate resume. Please try again.';
        this.errorSignal.set(message);
        return throwError(() => err);
      })
    );
  }

  clearError(): void {
    this.errorSignal.set(null);
  }
}
