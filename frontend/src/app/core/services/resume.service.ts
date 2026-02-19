import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@environments/environment';
import { ResumeData } from '../../features/my-resumes/models/resume.models';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ResumeService {
  private http = inject(HttpClient);

  private resumesSignal = signal<ResumeData[]>([]);
  private loadingSignal = signal(false);

  resumes = this.resumesSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();

  loadResumes(): Observable<ApiResponse<ResumeData[]>> {
    this.loadingSignal.set(true);
    return this.http.get<ApiResponse<ResumeData[]>>(
      `${environment.apiUrl}/resumes`
    ).pipe(
      tap({
        next: (res) => {
          if (res.success) {
            this.resumesSignal.set(res.data);
          }
          this.loadingSignal.set(false);
        },
        error: () => this.loadingSignal.set(false)
      })
    );
  }

  createResume(data: ResumeData): Observable<ApiResponse<ResumeData>> {
    return this.http.post<ApiResponse<ResumeData>>(
      `${environment.apiUrl}/resumes`,
      data
    ).pipe(
      tap({
        next: (res) => {
          if (res.success) {
            this.resumesSignal.update(list => [res.data, ...list]);
          }
        }
      })
    );
  }

  updateResume(id: string, data: ResumeData): Observable<ApiResponse<ResumeData>> {
    return this.http.put<ApiResponse<ResumeData>>(
      `${environment.apiUrl}/resumes/${id}`,
      data
    ).pipe(
      tap({
        next: (res) => {
          if (res.success) {
            this.resumesSignal.update(list =>
              list.map(r => r._id === id ? res.data : r)
            );
          }
        }
      })
    );
  }

  deleteResume(id: string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(
      `${environment.apiUrl}/resumes/${id}`
    ).pipe(
      tap({
        next: (res) => {
          if (res.success) {
            this.resumesSignal.update(list => list.filter(r => r._id !== id));
          }
        }
      })
    );
  }
}
