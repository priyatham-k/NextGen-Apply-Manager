import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  ApplyQueueService, ApplyQueueState, BuildPhase, QueueItem, QueueStatus
} from '@core/services/apply-queue.service';
import { StepTimelineComponent } from '@shared/components/step-timeline/step-timeline.component';
import { environment } from '../../../environments/environment';

type SectionState = 'pending' | 'running' | 'done' | 'warn' | 'error';

@Component({
  selector: 'app-apply-queue',
  standalone: true,
  imports: [CommonModule, RouterLink, StepTimelineComponent],
  templateUrl: './apply-queue.component.html',
  styleUrls: ['./apply-queue.component.scss']
})
export class ApplyQueueComponent implements OnInit, OnDestroy {
  private queueService = inject(ApplyQueueService);
  private toastr = inject(ToastrService);
  private sanitizer = inject(DomSanitizer);

  // ── "Apply here": the job form embedded in this page ──
  /** Id of the job open in the embedded frame */
  currentId = signal<string | null>(null);
  current = computed(() => this.items().find(i => i.id === this.currentId()) || null);
  /** The frame URL only changes when the job changes (live status updates must not reload the form) */
  frameUrl = signal<SafeResourceUrl | null>(null);
  /** The NextGen extension is installed in this browser (its bridge answers our ping) */
  extensionHere = signal(false);
  private frame = viewChild<ElementRef<HTMLIFrameElement>>('jobFrame');

  state = signal<ApplyQueueState | null>(null);
  loading = signal(true);
  startingBuild = signal(false);
  pairing = signal<{ code: string; expiresAt: string } | null>(null);
  busyItem = signal<Record<string, string>>({});
  now = signal(Date.now());
  /** Accordion sections the user opened (queue items) or closed (build phases) */
  private toggled = signal<Set<string>>(new Set());
  private poll?: ReturnType<typeof setInterval>;
  private clock?: ReturnType<typeof setInterval>;

  readonly buildSections: { key: BuildPhase; title: string; icon: string }[] = [
    { key: 'fetch', title: 'Fetch jobs', icon: 'bi-cloud-download' },
    { key: 'match', title: 'Match scoring', icon: 'bi-stars' },
    { key: 'queue', title: 'Queue', icon: 'bi-list-check' }
  ];

  items = computed(() => this.state()?.items || []);
  openItems = computed(() => this.items().filter(i => ['queued', 'opened', 'filled'].includes(i.status)));
  stats = computed(() => {
    const items = this.items();
    return {
      toApply: this.openItems().length,
      submitted: items.filter(i => i.status === 'submitted').length,
      skipped: items.filter(i => i.status === 'skipped').length,
      needsYou: items.filter(i => i.status === 'filled' && i.missingFields.length > 0).length
    };
  });
  connected = computed(() => (this.state()?.extensions.length || 0) > 0);
  buildSteps = computed(() => this.state()?.build?.steps || []);
  buildSummary = computed(() => this.buildSteps().filter(s => s.phase === 'start' || s.phase === 'done'));

  async ngOnInit(): Promise<void> {
    window.addEventListener('message', this.onExtensionMessage);
    window.postMessage({ type: 'NEXTGEN_PING' }, window.location.origin);
    await this.load();
    this.poll = setInterval(() => {
      // Live progress while something is happening: a build, the extension working, or pairing
      const s = this.state();
      const active = s?.building || !!this.currentId()
        || this.items().some(i => i.status === 'opened' || i.status === 'filled') || !!this.pairing();
      if (active) void this.load(true);
    }, 4000);
    this.clock = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onExtensionMessage);
    clearInterval(this.poll);
    clearInterval(this.clock);
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    try {
      const wasConnected = this.connected();
      this.state.set(await firstValueFrom(this.queueService.getQueue()));
      if (this.pairing() && !wasConnected && this.connected()) {
        this.pairing.set(null);
        this.toastr.success('Extension connected');
      }
    } catch (error: any) {
      if (!silent) this.toastr.error(error.error?.message || 'Failed to load the apply queue');
    } finally {
      this.loading.set(false);
    }
  }

  async buildNow(): Promise<void> {
    this.startingBuild.set(true);
    try {
      const result = await firstValueFrom(this.queueService.build());
      this.toastr.info(result.message);
      this.state.update(s => s ? { ...s, building: true } : s);
      setTimeout(() => void this.load(true), 1500);
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to build the queue', undefined, { timeOut: 10000 });
    } finally {
      this.startingBuild.set(false);
    }
  }

  launching = signal(false);

  startApplying(): void {
    const first = this.openItems()[0];
    if (first) void this.openItem(first);
  }

  /**
   * Opens the job in NextGen Chrome (the backend starts it with the extension installed, pairing it
   * if needed). Where that isn't possible, falls back to a tab in this browser.
   */
  async openItem(item?: QueueItem): Promise<void> {
    this.launching.set(true);
    try {
      const result = await firstValueFrom(this.queueService.launch(item?.id));
      this.toastr.success(result.message);
      setTimeout(() => void this.load(true), 4000);
    } catch (error: any) {
      if (error.error?.action === 'use_own_browser' && item) {
        this.toastr.info(error.error.message);
        window.open(this.queueService.itemLink(item), '_blank', 'noopener');
      } else {
        this.toastr.error(error.error?.message || 'Could not open NextGen Chrome');
      }
    } finally {
      this.launching.set(false);
    }
  }

  /** Opens a job's form inside this page */
  applyHere(item?: QueueItem): void {
    const target = item || this.openItems()[0];
    if (!target) return;
    this.currentId.set(target.id);
    this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.queueService.itemLink(target)));
    setTimeout(() => document.getElementById('apply-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  /** The next job still to apply to after the current one */
  applyNext(): void {
    const open = this.openItems();
    const index = open.findIndex(i => i.id === this.currentId());
    const next = open.filter(i => i.id !== this.currentId())[Math.max(0, index)] || null;
    if (next) {
      this.applyHere(next);
    } else {
      this.closeWorkspace();
      this.toastr.success('Your queue is done for today');
    }
  }

  closeWorkspace(): void {
    this.currentId.set(null);
    this.frameUrl.set(null);
  }

  async currentAction(action: 'submitted' | 'skip'): Promise<void> {
    const item = this.current();
    if (!item) return;
    await this.act(item, action);
    this.applyNext();
  }

  openCurrentInTab(): void {
    const item = this.current();
    if (item) window.open(this.queueService.itemLink(item), '_blank', 'noopener');
  }

  async requeue(item: QueueItem): Promise<void> {
    await firstValueFrom(this.queueService.requeue(item.id)).catch(() => undefined);
    await this.load(true);
  }

  async act(item: QueueItem, action: 'skip' | 'submitted'): Promise<void> {
    this.busyItem.update(b => ({ ...b, [item.id]: action }));
    try {
      await firstValueFrom(action === 'skip' ? this.queueService.skip(item.id) : this.queueService.markSubmitted(item.id));
      this.toastr.success(action === 'skip' ? 'Skipped' : 'Marked as submitted — added to Applications');
      await this.load(true);
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Update failed');
    } finally {
      this.busyItem.update(b => {
        const next = { ...b };
        delete next[item.id];
        return next;
      });
    }
  }

  async connectExtension(): Promise<void> {
    try {
      const pairing = await firstValueFrom(this.queueService.createPairingCode());
      this.pairing.set(pairing);
      // If the extension is installed in this browser, it pairs itself (its bridge script listens here)
      window.postMessage({ type: 'NEXTGEN_PAIR', code: pairing.code, apiUrl: environment.apiUrl }, window.location.origin);
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to create a pairing code');
    }
  }

  private onExtensionMessage = (event: MessageEvent) => {
    // From the embedded job form (the extension running inside it)
    if (event.source && event.source === this.frame()?.nativeElement.contentWindow) {
      if (event.data?.type === 'NEXTGEN_SUBMITTED') {
        this.toastr.success('Application submitted');
        void this.load(true);
      } else if (event.data?.type === 'NEXTGEN_NEXT') {
        void this.load(true).then(() => this.applyNext());
      }
      return;
    }
    if (event.source !== window) return;
    if (event.data?.type === 'NEXTGEN_EXTENSION_READY') {
      this.extensionHere.set(true);
      return;
    }
    if (event.data?.type !== 'NEXTGEN_PAIRED') return;
    if (event.data.ok) {
      this.pairing.set(null);
      this.toastr.success('Extension connected');
      void this.load(true);
    } else {
      this.toastr.warning(`Couldn't connect automatically: ${event.data.error}. Enter the code in the extension popup.`);
    }
  };

  async disconnect(id: string): Promise<void> {
    await firstValueFrom(this.queueService.disconnectExtension(id)).catch(() => undefined);
    await this.load(true);
  }

  secondsLeft(expiresAt: string): number {
    return Math.max(0, Math.round((new Date(expiresAt).getTime() - this.now()) / 1000));
  }

  // ── Accordions ──
  isOpen(key: string, openByDefault: boolean): boolean {
    return this.toggled().has(key) !== openByDefault;
  }

  toggle(key: string): void {
    const next = new Set(this.toggled());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.toggled.set(next);
  }

  stepsFor(phase: BuildPhase) {
    return this.buildSteps().filter(s => s.phase === phase);
  }

  buildSectionState(phase: BuildPhase): SectionState {
    const steps = this.stepsFor(phase);
    const order: BuildPhase[] = ['fetch', 'match', 'queue', 'done'];
    const laterStarted = this.buildSteps().some(s => order.indexOf(s.phase) > order.indexOf(phase));
    if (steps.some(s => s.level === 'error')) return 'error';
    if (!steps.length) return laterStarted ? 'done' : (this.state()?.building ? 'pending' : 'pending');
    if (this.state()?.building && !laterStarted) return 'running';
    return steps.some(s => s.level === 'warn') ? 'warn' : 'done';
  }

  itemState(item: QueueItem): { label: string; css: SectionState; icon: string } {
    const map: Record<QueueStatus, { label: string; css: SectionState; icon: string }> = {
      queued: { label: 'To apply', css: 'pending', icon: 'bi-circle' },
      opened: { label: 'Filling…', css: 'running', icon: '' },
      filled: item.missingFields.length
        ? { label: `${item.missingFields.length} need you`, css: 'warn', icon: 'bi-exclamation-triangle-fill' }
        : { label: 'Ready to submit', css: 'running', icon: 'bi-pencil-square' },
      submitted: { label: 'Submitted', css: 'done', icon: 'bi-check-circle-fill' },
      skipped: { label: 'Skipped', css: 'pending', icon: 'bi-slash-circle' }
    };
    return map[item.status];
  }
}
