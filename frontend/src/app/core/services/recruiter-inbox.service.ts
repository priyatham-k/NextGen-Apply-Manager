import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RecruiterEmailCategory = 'job_opportunity' | 'application_update' | 'job_alert' | 'other';
export type RecruiterEmailStatus = 'ignored' | 'drafting' | 'draft_ready' | 'sending' | 'sent' | 'dismissed' | 'error';

export interface RecruiterEmail {
  _id: string;
  from: { name?: string; address: string };
  replyTo: string;
  subject: string;
  receivedAt: string;
  text: string;
  category: RecruiterEmailCategory;
  reason?: string;
  suspicious?: string;
  company?: string;
  position?: string;
  location?: string;
  status: RecruiterEmailStatus;
  draft?: { subject: string; body: string; generatedAt: string };
  needsYou: string[];
  attachment?: { filename: string };
  sentAt?: string;
  error?: string;
}

export interface RecruiterInboxStatus {
  configured: boolean;
  enabled: boolean;
  address: string | null;
  isOwner: boolean;
  pollMinutes: number;
  checking: boolean;
  lastCheck: string | null;
  lastError: string | null;
  lastFound: number | null;
}

@Injectable({ providedIn: 'root' })
export class RecruiterInboxService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/recruiter-inbox`;

  getInbox(all = false): Observable<{ emails: RecruiterEmail[]; status: RecruiterInboxStatus; ignoredCount: number }> {
    return this.http.get<{ emails: RecruiterEmail[]; status: RecruiterInboxStatus; ignoredCount: number }>(
      this.apiUrl, { params: all ? { all: 'true' } : {} });
  }

  check(): Observable<{ found: number; message: string }> {
    return this.http.post<{ found: number; message: string }>(`${this.apiUrl}/check`, {});
  }

  saveDraft(id: string, subject: string, body: string): Observable<{ email: RecruiterEmail }> {
    return this.http.patch<{ email: RecruiterEmail }>(`${this.apiUrl}/${id}`, { subject, body });
  }

  regenerate(id: string): Observable<{ email: RecruiterEmail }> {
    return this.http.post<{ email: RecruiterEmail }>(`${this.apiUrl}/${id}/regenerate`, {});
  }

  send(id: string, subject: string, body: string): Observable<{ email: RecruiterEmail; message: string }> {
    return this.http.post<{ email: RecruiterEmail; message: string }>(`${this.apiUrl}/${id}/send`, { subject, body });
  }

  setDismissed(id: string, dismissed: boolean): Observable<{ email: RecruiterEmail }> {
    return this.http.post<{ email: RecruiterEmail }>(`${this.apiUrl}/${id}/${dismissed ? 'dismiss' : 'restore'}`, {});
  }
}
