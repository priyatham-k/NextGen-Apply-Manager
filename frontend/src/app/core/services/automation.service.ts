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
  jobId: string;
  // 'review': form filled and waiting for the user to submit or discard it
  // 'action': the site wants a person (verification code, spam check); the tab is held open
  // 'unconfirmed': submit was clicked but no confirmation message appeared
  status: 'success' | 'unconfirmed' | 'review' | 'action' | 'failed';
  error?: string;
}

export interface AutopilotStatus {
  enabled: boolean;
  time: string;
  dailyLimit: number;
  minMatchScore: number;
  running: boolean;
  appliedToday: number;
  /** Filled tabs waiting for the user: human checks and pre-submit reviews */
  actionNeeded: ActionNeededItem[];
  lastRun?: {
    trigger: 'schedule' | 'manual';
    startedAt: string;
    finishedAt?: string;
    error?: string;
    result?: { queued: number; skippedReason?: string };
    steps: AutopilotStep[];
    applications: AutopilotApplication[];
  } | null;
}

export interface ActionNeededItem {
  id: string;
  job: { title: string; company: string } | null;
  reason: string;
  /** True when the site asked for a person (verification code, spam check) after submit */
  humanCheck: boolean;
  since: string;
  expiresAt: string;
}

export type AutopilotPhase = 'start' | 'fetch' | 'match' | 'queue' | 'done';

export interface AutopilotStep {
  at: string;
  phase: AutopilotPhase;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface AutopilotApplication {
  id: string;
  status: string;
  errorLog?: string;
  job: { title: string; company: string } | null;
  steps: { at: string; step?: number; message: string; level: 'info' | 'success' | 'warn' | 'error' }[];
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
   * Get uploaded resumes for the current user
   */
  getUploadedResumes(): Observable<{ success: boolean; data: any[]; count: number }> {
    return this.http.get<{ success: boolean; data: any[]; count: number }>(
      `${environment.apiUrl}/resumes/uploads`
    );
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
   * Submit a filled form after reviewing it
   */
  submitReviewed(applicationId: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(`${this.apiUrl}/submit/${applicationId}`, {});
  }

  /**
   * The user finished the form in the held tab themselves (e.g. entered an email code)
   */
  confirmSubmitted(applicationId: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(`${this.apiUrl}/confirm-submitted/${applicationId}`, {});
  }

  /**
   * Bring the held tab to the front of the automation browser window
   */
  focusTab(applicationId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/focus/${applicationId}`, {});
  }

  /**
   * Close a filled form without submitting
   */
  discardReview(applicationId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/discard/${applicationId}`, {});
  }

  /**
   * Cancel a pending automation
   */
  cancelAutomation(applicationId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/cancel/${applicationId}`);
  }

  /**
   * Run the daily autopilot now (fetch → match → apply) for the current user
   */
  runAutopilot(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/autopilot/run`, {});
  }

  getAutopilotStatus(): Observable<AutopilotStatus> {
    return this.http.get<AutopilotStatus>(`${this.apiUrl}/autopilot/status`);
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
