import { Context, ITEM_HASH, QueueItem, Request } from './types';

/**
 * Service worker: owns the extension token, proxies every backend call (content scripts can't,
 * because of the page's CORS), and remembers which tab is working on which queue item.
 */

const DEFAULT_API = 'http://localhost:3000/api/v1';

interface Settings {
  apiUrl: string;
  token?: string;
  autoNext: boolean;
}

async function settings(): Promise<Settings> {
  const s = await chrome.storage.local.get(['apiUrl', 'token', 'autoNext']);
  return { apiUrl: s.apiUrl || DEFAULT_API, token: s.token, autoNext: s.autoNext !== false };
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiUrl, token } = await settings();
  const response = await fetch(apiUrl + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && token) {
    // Revoked in the app: forget the token so the popup asks to pair again
    await chrome.storage.local.remove('token');
  }
  if (!response.ok) throw new ApiError(response.status, body.message || `Request failed (${response.status})`);
  return body as T;
}

// ─── Tab ↔ queue item ────────────────────────────────────────────

async function tabItems(): Promise<Record<string, string>> {
  return (await chrome.storage.session.get('tabItems')).tabItems || {};
}

async function setTabItem(tabId: number, itemId: string | null): Promise<void> {
  const map = await tabItems();
  if (itemId) map[tabId] = itemId; else delete map[tabId];
  await chrome.storage.session.set({ tabItems: map });
}

function itemIdFromUrl(url?: string): string | null {
  const index = url?.indexOf(ITEM_HASH) ?? -1;
  return index >= 0 ? url!.slice(index + ITEM_HASH.length).split(/[&#]/)[0] : null;
}

/** The queue item for a tab: from the "#nextgen-item=" link that opened it, or remembered since */
async function itemIdForTab(tabId?: number): Promise<string | null> {
  if (tabId === undefined) return null;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const fromUrl = itemIdFromUrl(tab?.url);
  if (fromUrl) {
    await setTabItem(tabId, fromUrl);
    return fromUrl;
  }
  return (await tabItems())[tabId] || null;
}

function itemUrl(item: QueueItem): string {
  return `${item.formUrl.split('#')[0]}#${ITEM_HASH}${item.id}`;
}

async function openNext(tabId?: number): Promise<QueueItem | null> {
  const { item } = await api<{ item: QueueItem | null }>('/extension/queue/next');
  if (!item) {
    if (tabId !== undefined) await setTabItem(tabId, null);
    return null;
  }
  if (tabId !== undefined) {
    await setTabItem(tabId, item.id);
    await chrome.tabs.update(tabId, { url: itemUrl(item) });
  } else {
    const tab = await chrome.tabs.create({ url: itemUrl(item) });
    if (tab.id !== undefined) await setTabItem(tab.id, item.id);
  }
  return item;
}

// ─── Messages ────────────────────────────────────────────────────

async function handle(request: Request, sender: chrome.runtime.MessageSender): Promise<any> {
  const tabId = sender.tab?.id;
  switch (request.kind) {
    case 'context': {
      const { token, autoNext } = await settings();
      const { debug } = await chrome.storage.local.get('debug');
      const context: Context = { paired: !!token, item: null, profile: null, autoNext, debug: !!debug };
      if (!token) return context;
      try {
        context.profile = await api('/extension/me');
        // A form embedded in the app carries the item in its own URL; a form tab in the tab's URL
        const itemId = itemIdFromUrl(request.href) || await itemIdForTab(tabId);
        if (itemId) context.item = (await api<{ item: QueueItem }>(`/extension/queue/${itemId}`)).item;
      } catch (error: any) {
        context.error = error.message;
        context.paired = !(error instanceof ApiError && error.status === 401);
      }
      return context;
    }
    case 'answers':
      return api('/extension/answers', { method: 'POST', body: JSON.stringify(request) });
    case 'resume':
      return api('/extension/resume');
    case 'event':
      return api(`/extension/queue/${request.itemId}/event`, { method: 'POST', body: JSON.stringify(request.event) });
    case 'next': {
      if (request.delayMs) await new Promise(resolve => setTimeout(resolve, request.delayMs));
      return { item: await openNext(tabId) };
    }
    case 'setAutoNext':
      await chrome.storage.local.set({ autoNext: request.value });
      return { autoNext: request.value };
    case 'pair': {
      const apiUrl = (request.apiUrl || DEFAULT_API).replace(/\/+$/, '');
      await chrome.storage.local.set({ apiUrl });
      const { token } = await api<{ token: string }>('/extension/pair', {
        method: 'POST',
        body: JSON.stringify({ code: request.code, label: `Chrome on ${navigator.platform || 'this computer'}` })
      });
      await chrome.storage.local.set({ token });
      return { paired: true };
    }
    case 'unpair':
      await chrome.storage.local.remove('token');
      return { paired: false };
    case 'status': {
      const { token, apiUrl, autoNext } = await settings();
      if (!token) return { paired: false, apiUrl, autoNext };
      try {
        const { items } = await api<{ items: QueueItem[] }>('/extension/queue');
        const open = items.filter(i => ['queued', 'opened', 'filled'].includes(i.status));
        return { paired: true, apiUrl, autoNext, total: items.length, remaining: open.length,
          submitted: items.filter(i => i.status === 'submitted').length, next: open[0] || null };
      } catch (error: any) {
        return { paired: !(error instanceof ApiError && error.status === 401), apiUrl, autoNext, error: error.message };
      }
    }
    case 'start':
      return { item: await openNext() };
  }
}

chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  handle(request, sender)
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true; // async response
});

chrome.tabs.onRemoved.addListener(tabId => void setTabItem(tabId, null));
