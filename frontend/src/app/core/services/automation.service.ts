import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export interface AutomationProgress {
  applicationId: string;
  step: number;
  totalSteps: number;
  percentage: number;
  message: string;
}

export interface AutomationComplete {
  applicationId: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface AutomationStatus {
  applicationId: string;
  status: string;
  submissionType: string;
  atsType: string;
  errorLog?: string;
  screenshots?: string[];
  submittedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class AutomationService {
  private apiUrl = `${environment.apiUrl}/automation`;
  private socket?: Socket;

  // Signals for reactive state
  progressSignal = signal<AutomationProgress | null>(null);
  statusSignal = signal<AutomationComplete | null>(null);

  // Subjects for observable streams
  private progressSubject = new Subject<AutomationProgress>();
  private completeSubject = new Subject<AutomationComplete>();

  progress$ = this.progressSubject.asObservable();
  complete$ = this.completeSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Initialize Socket.IO connection for real-time updates
   */
  initializeSocket(token: string): void {
    if (this.socket?.connected) {
      return; // Already connected
    }

    this.socket = io(environment.apiUrl.replace('/api/v1', ''), {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    // Listen for progress updates
    this.socket.on('automation:progress', (data: AutomationProgress) => {
      this.progressSignal.set(data);
      this.progressSubject.next(data);
    });

    // Listen for completion
    this.socket.on('automation:complete', (data: AutomationComplete) => {
      this.statusSignal.set(data);
      this.completeSubject.next(data);
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO connected for automation updates');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });
  }

  /**
   * Disconnect Socket.IO
   */
  disconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
  }

  /**
   * Apply to a single job with automation
   */
  applyToJob(jobId: string, resumeId?: string, coverLetterId?: string): Observable<{ message: string; applicationId: string }> {
    return this.http.post<{ message: string; applicationId: string }>(
      `${this.apiUrl}/apply`,
      { jobId, resumeId, coverLetterId }
    );
  }

  /**
   * Apply to multiple jobs in bulk
   */
  applyToBulk(jobIds: string[], resumeId?: string, coverLetterId?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/apply-bulk`, {
      jobIds,
      resumeId,
      coverLetterId
    });
  }

  /**
   * Get automation status for an application
   */
  getStatus(applicationId: string): Observable<AutomationStatus> {
    return this.http.get<AutomationStatus>(`${this.apiUrl}/status/${applicationId}`);
  }

  /**
   * Retry a failed automation
   */
  retryAutomation(applicationId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/retry/${applicationId}`, {});
  }

  /**
   * Cancel a pending automation
   */
  cancelAutomation(applicationId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/cancel/${applicationId}`);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/queue/stats`);
  }

  /**
   * Clear progress state
   */
  clearProgress(): void {
    this.progressSignal.set(null);
    this.statusSignal.set(null);
  }
}
