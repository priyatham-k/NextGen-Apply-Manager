import { QueueItem, Request } from './types';

interface Status {
  paired: boolean;
  apiUrl: string;
  autoNext: boolean;
  remaining?: number;
  submitted?: number;
  next?: QueueItem | null;
  error?: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function send<T = any>(request: Request): Promise<T> {
  const response = await chrome.runtime.sendMessage(request);
  if (!response?.ok) throw new Error(response?.error || 'Something went wrong');
  return response.result as T;
}

function showError(message?: string): void {
  const el = $('error');
  el.hidden = !message;
  el.textContent = message || '';
}

async function refresh(): Promise<void> {
  const status = await send<Status>({ kind: 'status' });
  $('pair').hidden = status.paired;
  $('queue').hidden = !status.paired;
  ($('api') as HTMLInputElement).value = status.apiUrl;
  ($('autoNext') as HTMLInputElement).checked = status.autoNext;
  showError(status.error);
  if (!status.paired) return;

  $('remaining').textContent = String(status.remaining ?? 0);
  $('submitted').textContent = String(status.submitted ?? 0);
  const next = $('next');
  next.hidden = !status.next;
  if (status.next?.job) {
    next.textContent = `Next: ${status.next.job.title} at ${status.next.job.company} (match ${status.next.matchScore})`;
  }
  const start = $('startBtn') as HTMLButtonElement;
  start.disabled = !status.next;
  start.textContent = status.next ? 'Start applying' : 'Queue is empty — build one in the app';
}

$('pairBtn').addEventListener('click', async () => {
  const button = $('pairBtn') as HTMLButtonElement;
  button.disabled = true;
  try {
    await send({ kind: 'pair', code: ($('code') as HTMLInputElement).value, apiUrl: ($('api') as HTMLInputElement).value });
    await refresh();
  } catch (error: any) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

$('startBtn').addEventListener('click', async () => {
  try {
    await send({ kind: 'start' });
    window.close();
  } catch (error: any) {
    showError(error.message);
  }
});

$('autoNext').addEventListener('change', e => {
  void send({ kind: 'setAutoNext', value: (e.target as HTMLInputElement).checked });
});

$('unpairBtn').addEventListener('click', async () => {
  await send({ kind: 'unpair' });
  await refresh();
});

refresh().catch(error => showError(error.message));
