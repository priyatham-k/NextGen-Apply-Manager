import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type StepLevel = 'info' | 'success' | 'warn' | 'error';
export type QueueStatus = 'queued' | 'opened' | 'filled' | 'submitted' | 'skipped';
export type BuildPhase = 'start' | 'fetch' | 'match' | 'queue' | 'done';

export interface QueueStep {
  at: string;
  message: string;
  level: StepLevel;
}

export interface QueueItem {
  id: string;
  position: number;
  queueDate: string;
  status: QueueStatus;
  matchScore: number;
  matchReason?: string;
  formUrl: string;
  filledCount: number;
  missingFields: string[];
  steps: QueueStep[];
  applicationId?: string;
  job: { id: string; title: string; company: string; location?: string } | null;
}

export interface QueueBuildInfo {
  trigger: 'schedule' | 'manual';
  startedAt: string;
  finishedAt?: string;
  queued: number;
  error?: string;
  steps: (QueueStep & { phase: BuildPhase })[];
}

export interface ExtensionConnection {
  id: string;
  label: string;
  pairedAt?: string;
  lastUsedAt?: string;
}

export interface ApplyQueueState {
  items: QueueItem[];
  build: QueueBuildInfo | null;
  building: boolean;
  config: { enabled: boolean; time: string; size: number; minMatchScore: number };
  extensions: ExtensionConnection[];
  /** Whether the backend can open the NextGen Chrome window on this computer */
  browserLaunch: { available: boolean; reason?: string };
}

/** The extension apply flow: the app builds the queue, the Chrome extension fills each form */
@Injectable({ providedIn: 'root' })
export class ApplyQueueService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/apply-queue`;

  getQueue(): Observable<ApplyQueueState> {
    return this.http.get<ApplyQueueState>(this.apiUrl);
  }

  build(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/build`, {});
  }

  skip(itemId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.apiUrl}/${itemId}/skip`, {});
  }

  markSubmitted(itemId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.apiUrl}/${itemId}/submitted`, {});
  }

  /** Opens the NextGen Chrome window (extension installed) at a queue job's form, or the next one */
  launch(itemId?: string): Observable<{ message: string; paired: boolean }> {
    return this.http.post<{ message: string; paired: boolean }>(`${this.apiUrl}/launch`, { itemId });
  }

  requeue(itemId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.apiUrl}/${itemId}/requeue`, {});
  }

  createPairingCode(): Observable<{ code: string; expiresAt: string }> {
    return this.http.post<{ code: string; expiresAt: string }>(`${this.apiUrl}/extension/pairing-code`, {});
  }

  disconnectExtension(connectionId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/extension/${connectionId}`);
  }

  /** The link the extension recognises as a queue job (it fills the form and reports back) */
  itemLink(item: QueueItem): string {
    return `${item.formUrl.split('#')[0]}#nextgen-item=${item.id}`;
  }
}
