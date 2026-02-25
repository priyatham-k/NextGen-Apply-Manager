import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize } from 'rxjs';
import { environment } from '@environments/environment';
import {
  CoverLetter,
  GenerateCoverLetterRequest,
  CoverLettersResponse,
  ApiResponse
} from '@models/index';

@Injectable({
  providedIn: 'root'
})
export class CoverLetterService {
  private http = inject(HttpClient);

  private coverLettersSignal = signal<CoverLetter[]>([]);
  private loadingSignal = signal(false);
  private generatingSignal = signal(false);
  private extractingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  coverLetters = this.coverLettersSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();
  generating = this.generatingSignal.asReadonly();
  extracting = this.extractingSignal.asReadonly();
  error = this.errorSignal.asReadonly();

  /**
   * Generate a new cover letter
   */
  generateCoverLetter(request: GenerateCoverLetterRequest): Observable<ApiResponse<CoverLetter>> {
    this.generatingSignal.set(true);
    this.errorSignal.set(null);

    return this.http.post<ApiResponse<CoverLetter>>(
      `${environment.apiUrl}/cover-letters/generate`,
      request
    ).pipe(
      tap(res => {
        if (res.success && res.data) {
          // Add to list
          this.coverLettersSignal.update(letters => [res.data!, ...letters]);
        }
      }),
      tap({
        error: (err) => {
          if (err.error?.profileRequired) {
            this.errorSignal.set('Please complete your profile to generate cover letters');
          } else {
            this.errorSignal.set(err.error?.error || 'Failed to generate cover letter');
          }
        }
      }),
      finalize(() => this.generatingSignal.set(false))
    );
  }

  /**
   * Load all cover letters
   */
  loadCoverLetters(): Observable<ApiResponse<CoverLettersResponse>> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.http.get<ApiResponse<CoverLettersResponse>>(
      `${environment.apiUrl}/cover-letters`
    ).pipe(
      tap(res => {
        if (res.success && res.data?.coverLetters) {
          this.coverLettersSignal.set(res.data.coverLetters);
        }
      }),
      tap({
        error: (err) => {
          this.errorSignal.set(err.error?.error || 'Failed to load cover letters');
        }
      }),
      finalize(() => this.loadingSignal.set(false))
    );
  }

  /**
   * Get a specific cover letter by ID
   */
  getCoverLetterById(id: string): Observable<ApiResponse<CoverLetter>> {
    return this.http.get<ApiResponse<CoverLetter>>(
      `${environment.apiUrl}/cover-letters/${id}`
    );
  }

  /**
   * Delete a cover letter
   */
  deleteCoverLetter(id: string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(
      `${environment.apiUrl}/cover-letters/${id}`
    ).pipe(
      tap(res => {
        if (res.success) {
          // Remove from list
          this.coverLettersSignal.update(letters =>
            letters.filter(letter => letter._id !== id)
          );
        }
      })
    );
  }

  /**
   * Extract company name and position from job description
   */
  extractJobDetails(jobDescription: string): Observable<ApiResponse<{ company: string; position: string }>> {
    this.extractingSignal.set(true);

    return this.http.post<ApiResponse<{ company: string; position: string }>>(
      `${environment.apiUrl}/cover-letters/extract-details`,
      { jobDescription }
    ).pipe(
      finalize(() => this.extractingSignal.set(false))
    );
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }
}
