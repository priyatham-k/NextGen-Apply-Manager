import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  RecruiterEmail, RecruiterInboxService, RecruiterInboxStatus
} from '@core/services/recruiter-inbox.service';

type InboxView = 'review' | 'sent' | 'dismissed' | 'ignored';

const PLACEHOLDERS = /\[[^\]\n]{2,80}\]/g;

@Component({
  selector: 'app-recruiter-inbox',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './recruiter-inbox.component.html',
  styleUrls: ['./recruiter-inbox.component.scss']
})
export class RecruiterInboxComponent implements OnInit, OnDestroy {
  private inboxService = inject(RecruiterInboxService);
  private toastr = inject(ToastrService);

  emails = signal<RecruiterEmail[]>([]);
  status = signal<RecruiterInboxStatus | null>(null);
  loading = signal(true);
  checking = signal(false);
  view = signal<InboxView>('review');
  openId = signal<string | null>(null);
  busy = signal<Record<string, string>>({});
  /** Unsaved edits to drafts, by email id */
  edits = signal<Record<string, { subject: string; body: string }>>({});

  private refreshTimer?: ReturnType<typeof setInterval>;

  counts = computed(() => {
    const emails = this.emails();
    return {
      review: emails.filter(e => ['draft_ready', 'drafting', 'error', 'sending'].includes(e.status)).length,
      sent: emails.filter(e => e.status === 'sent').length,
      dismissed: emails.filter(e => e.status === 'dismissed').length,
      ignored: emails.filter(e => e.status === 'ignored').length
    };
  });

  visible = computed(() => {
    const view = this.view();
    return this.emails().filter(e => {
      switch (view) {
        case 'review': return ['draft_ready', 'drafting', 'error', 'sending'].includes(e.status);
        case 'sent': return e.status === 'sent';
        case 'dismissed': return e.status === 'dismissed';
        case 'ignored': return e.status === 'ignored';
      }
    });
  });

  async ngOnInit(): Promise<void> {
    await this.load();
    // Picks up emails found by the background check
    this.refreshTimer = setInterval(() => void this.load(true), 60 * 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
  }

  async load(quiet = false): Promise<void> {
    try {
      const { emails, status } = await firstValueFrom(this.inboxService.getInbox(true));
      this.emails.set(emails);
      this.status.set(status);
    } catch (error: any) {
      if (!quiet) this.toastr.error(error.error?.message || 'Failed to load the recruiter inbox');
    } finally {
      this.loading.set(false);
    }
  }

  async checkNow(): Promise<void> {
    this.checking.set(true);
    try {
      const result = await firstValueFrom(this.inboxService.check());
      this.toastr.success(result.message);
      if (result.found) this.view.set('review');
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Could not check the inbox');
    } finally {
      this.checking.set(false);
      await this.load(true);
    }
  }

  toggle(email: RecruiterEmail): void {
    this.openId.set(this.openId() === email._id ? null : email._id);
  }

  // ─── Draft editing ───

  subjectOf(email: RecruiterEmail): string {
    return this.edits()[email._id]?.subject ?? email.draft?.subject ?? '';
  }

  bodyOf(email: RecruiterEmail): string {
    return this.edits()[email._id]?.body ?? email.draft?.body ?? '';
  }

  edit(email: RecruiterEmail, field: 'subject' | 'body', value: string): void {
    const current = { subject: this.subjectOf(email), body: this.bodyOf(email) };
    this.edits.update(all => ({ ...all, [email._id]: { ...current, [field]: value } }));
  }

  isEdited(email: RecruiterEmail): boolean {
    return !!this.edits()[email._id];
  }

  /** [placeholders] the user still has to fill in */
  placeholders(email: RecruiterEmail): string[] {
    return Array.from(new Set(this.bodyOf(email).match(PLACEHOLDERS) || []));
  }

  async save(email: RecruiterEmail): Promise<void> {
    await this.run(email, 'save', async () => {
      const { email: updated } = await firstValueFrom(this.inboxService.saveDraft(email._id, this.subjectOf(email), this.bodyOf(email)));
      this.replace(updated, true);
      this.toastr.success('Draft saved');
    });
  }

  async send(email: RecruiterEmail): Promise<void> {
    const missing = this.placeholders(email);
    if (missing.length) {
      this.toastr.warning(`Fill in ${missing.join(', ')} before sending`);
      return;
    }
    if (!confirm(`Send this reply to ${email.replyTo} with your resume attached?`)) return;
    await this.run(email, 'send', async () => {
      const result = await firstValueFrom(this.inboxService.send(email._id, this.subjectOf(email), this.bodyOf(email)));
      this.replace(result.email, true);
      this.toastr.success(result.message);
    });
  }

  async regenerate(email: RecruiterEmail): Promise<void> {
    if (this.isEdited(email) && !confirm('Discard your edits and write the reply again?')) return;
    await this.run(email, 'regenerate', async () => {
      const { email: updated } = await firstValueFrom(this.inboxService.regenerate(email._id));
      this.replace(updated, true);
      if (updated.status === 'error') this.toastr.error(updated.error || 'Could not draft a reply');
    });
  }

  /** An ignored email that is actually a job: draft a reply for it */
  async markAsJob(email: RecruiterEmail): Promise<void> {
    await this.regenerate(email);
    this.view.set('review');
    this.openId.set(email._id);
  }

  async setDismissed(email: RecruiterEmail, dismissed: boolean): Promise<void> {
    await this.run(email, dismissed ? 'dismiss' : 'restore', async () => {
      const { email: updated } = await firstValueFrom(this.inboxService.setDismissed(email._id, dismissed));
      this.replace(updated, false);
    });
  }

  private replace(updated: RecruiterEmail, clearEdits: boolean): void {
    this.emails.update(list => list.map(e => (e._id === updated._id ? updated : e)));
    if (clearEdits) {
      this.edits.update(all => {
        const { [updated._id]: _removed, ...rest } = all;
        return rest;
      });
    }
  }

  private async run(email: RecruiterEmail, action: string, work: () => Promise<void>): Promise<void> {
    this.busy.update(b => ({ ...b, [email._id]: action }));
    try {
      await work();
    } catch (error: any) {
      this.toastr.error(error.error?.message || `Could not ${action}`);
      await this.load(true);
    } finally {
      this.busy.update(b => {
        const { [email._id]: _done, ...rest } = b;
        return rest;
      });
    }
  }

  statusLabel(email: RecruiterEmail): { label: string; css: string } {
    switch (email.status) {
      case 'drafting': return { label: 'Writing reply…', css: 'working' };
      case 'draft_ready': return { label: 'Ready to review', css: 'ready' };
      case 'sending': return { label: 'Sending…', css: 'working' };
      case 'sent': return { label: 'Sent', css: 'done' };
      case 'dismissed': return { label: 'Dismissed', css: 'muted' };
      case 'error': return { label: 'Needs attention', css: 'warn' };
      default: return { label: this.categoryLabel(email), css: 'muted' };
    }
  }

  categoryLabel(email: RecruiterEmail): string {
    return {
      job_opportunity: 'Job opportunity', application_update: 'Application update', job_alert: 'Job alert', other: 'Not a job email'
    }[email.category];
  }

  sender(email: RecruiterEmail): string {
    return email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address;
  }
}
