import { QueueItem, StepLevel } from './types';

/**
 * Floating progress panel, isolated in a shadow root so the site's CSS can't break it
 * (and it can't break the site). Shows every step, the fields that need the user, and actions.
 */

export interface PanelActions {
  fill: () => void;
  submitted: () => void;
  skip: () => void;
  next: () => void;
  toggleAutoNext: (value: boolean) => void;
}

const ICONS: Record<StepLevel | 'running', string> = { info: '•', success: '✓', warn: '!', error: '✕', running: '…' };

const STYLES = `
  :host { all: initial; }
  .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 340px; max-height: 70vh;
    display: flex; flex-direction: column; background: #fff; color: #0f172a; border: 1px solid #cbd5e1;
    border-radius: 12px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18); font: 13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; }
  .panel.collapsed .body { display: none; }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; cursor: pointer; }
  .brand { font-weight: 700; color: #4f46e5; }
  .status { margin-left: auto; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; color: #334155; }
  .status.working { background: #dbeafe; color: #1d4ed8; }
  .status.done { background: #dcfce7; color: #15803d; }
  .status.attention { background: #fef3c7; color: #b45309; }
  .body { display: flex; flex-direction: column; min-height: 0; }
  .job { padding: 8px 12px 0; }
  .job-title { font-weight: 600; }
  .job-meta { color: #64748b; font-size: 12px; }
  .steps { list-style: none; margin: 8px 0 0; padding: 0 12px; overflow-y: auto; max-height: 34vh; }
  .steps li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; padding: 3px 0; border-bottom: 1px dashed #eef2f6; }
  .steps li:last-child { border-bottom: 0; }
  .i-success { color: #16a34a; } .i-warn { color: #d97706; } .i-error { color: #dc2626; } .i-info, .i-running { color: #64748b; }
  .missing { margin: 8px 12px 0; padding: 8px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; }
  .missing strong { color: #92400e; }
  .missing button { display: block; margin-top: 4px; padding: 0; border: 0; background: none; color: #b45309;
    text-align: left; cursor: pointer; text-decoration: underline; font: inherit; }
  .note { margin: 8px 12px 0; color: #475569; font-size: 12px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; border-top: 1px solid #e2e8f0; margin-top: 8px; }
  .actions button { flex: 1 1 auto; padding: 6px 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff;
    color: #0f172a; cursor: pointer; font: 600 12px system-ui, sans-serif; }
  .actions button.primary { background: #16a34a; border-color: #16a34a; color: #fff; }
  .actions button:disabled { opacity: 0.5; cursor: default; }
  .actions button:focus-visible, header:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  label.auto { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; color: #475569; font-size: 12px; }
`;

export class Panel {
  private root: ShadowRoot;
  private panel!: HTMLElement;
  private stepsList!: HTMLUListElement;
  private statusEl!: HTMLElement;
  private missingEl!: HTMLElement;
  private noteEl!: HTMLElement;
  private jobEl!: HTMLElement;
  private autoNextBox!: HTMLInputElement;
  private buttons: Record<string, HTMLButtonElement> = {};

  constructor(actions: PanelActions, queued: boolean, autoNext: boolean) {
    const host = document.createElement('nextgen-apply-panel');
    this.root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    this.render(actions, queued, autoNext);
    // Sites that re-render the whole document (React hydration) drop foreign nodes: put the panel back
    window.setInterval(() => {
      if (!host.isConnected) document.body.appendChild(host);
    }, 1000);
  }

  private render(actions: PanelActions, queued: boolean, autoNext: boolean): void {
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.panel = document.createElement('section');
    this.panel.className = 'panel';
    this.panel.setAttribute('aria-label', 'NextGen Apply');
    this.panel.innerHTML = `
      <header tabindex="0" role="button" aria-expanded="true">
        <span class="brand">NextGen Apply</span><span class="status">Ready</span>
      </header>
      <div class="body">
        <div class="job"></div>
        <ol class="steps" aria-live="polite"></ol>
        <div class="missing" hidden></div>
        <p class="note">Review everything, then click the site's own <b>Submit</b> button. NextGen never submits for you.</p>
        <div class="actions"></div>
        ${queued ? '<label class="auto"><input type="checkbox"> Open the next job after I submit</label>' : ''}
      </div>`;
    this.root.append(style, this.panel);

    this.stepsList = this.panel.querySelector('.steps')!;
    this.statusEl = this.panel.querySelector('.status')!;
    this.missingEl = this.panel.querySelector('.missing')!;
    this.noteEl = this.panel.querySelector('.note')!;
    this.jobEl = this.panel.querySelector('.job')!;

    const header = this.panel.querySelector('header')!;
    const toggle = () => {
      const collapsed = this.panel.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

    const actionsEl = this.panel.querySelector('.actions')!;
    const addButton = (key: string, text: string, handler: () => void, primary = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      if (primary) button.className = 'primary';
      button.addEventListener('click', handler);
      actionsEl.appendChild(button);
      this.buttons[key] = button;
    };
    addButton('fill', 'Fill again', actions.fill);
    if (queued) {
      addButton('submitted', 'I submitted it', actions.submitted, true);
      addButton('skip', 'Skip', actions.skip);
      addButton('next', 'Next job →', actions.next);
      this.autoNextBox = this.panel.querySelector('label.auto input') as HTMLInputElement;
      this.autoNextBox.checked = autoNext;
      this.autoNextBox.addEventListener('change', () => actions.toggleAutoNext(this.autoNextBox.checked));
    }
  }

  setJob(item: QueueItem | null): void {
    if (!item?.job) {
      this.jobEl.innerHTML = '<div class="job-meta">Not in your queue — filling on request</div>';
      return;
    }
    this.jobEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'job-title';
    title.textContent = item.job.title;
    const meta = document.createElement('div');
    meta.className = 'job-meta';
    meta.textContent = `${item.job.company} · match ${item.matchScore} · #${item.position} in today's queue`;
    this.jobEl.append(title, meta);
  }

  setStatus(text: string, kind: 'ready' | 'working' | 'done' | 'attention'): void {
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${kind === 'ready' ? '' : kind}`;
  }

  step(message: string, level: StepLevel = 'info'): void {
    // Also in the page console, for troubleshooting a site
    console.info(`[NextGen Apply] ${level}: ${message}`);
    const li = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = `i-${level}`;
    icon.textContent = ICONS[level];
    const text = document.createElement('span');
    text.textContent = message;
    li.append(icon, text);
    this.stepsList.appendChild(li);
    this.stepsList.scrollTop = this.stepsList.scrollHeight;
  }

  setMissing(missing: { label: string; element: HTMLElement }[]): void {
    this.missingEl.hidden = missing.length === 0;
    this.missingEl.innerHTML = '';
    if (!missing.length) return;
    const heading = document.createElement('strong');
    heading.textContent = `${missing.length} field(s) need you (highlighted):`;
    this.missingEl.appendChild(heading);
    for (const m of missing.slice(0, 12)) {
      const link = document.createElement('button');
      link.type = 'button';
      link.textContent = m.label.slice(0, 90);
      link.addEventListener('click', () => {
        m.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        m.element.focus?.();
      });
      this.missingEl.appendChild(link);
    }
  }

  setNote(text: string): void {
    this.noteEl.textContent = text;
  }

  setBusy(busy: boolean): void {
    Object.values(this.buttons).forEach(b => { b.disabled = busy; });
  }
}
