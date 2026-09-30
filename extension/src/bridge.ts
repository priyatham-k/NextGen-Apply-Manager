/**
 * Runs only on the NextGen web app. Lets the app pair the extension without typing a code:
 * - the app posts { type: 'NEXTGEN_PAIR', code, apiUrl } after creating a pairing code, or
 * - the app is opened with ?nextgenPair=CODE (used by the "open Chrome with the extension" launcher).
 * Answers with { type: 'NEXTGEN_PAIRED', ok, error } and announces itself with NEXTGEN_EXTENSION_READY.
 */

const DEFAULT_API = 'http://localhost:3000/api/v1';

async function pair(code: string, apiUrl?: string): Promise<void> {
  const response = await chrome.runtime.sendMessage({ kind: 'pair', code, apiUrl: apiUrl || DEFAULT_API });
  window.postMessage({ type: 'NEXTGEN_PAIRED', ok: !!response?.ok, error: response?.error }, window.location.origin);
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type === 'NEXTGEN_PING') {
    window.postMessage({ type: 'NEXTGEN_EXTENSION_READY' }, window.location.origin);
  } else if (data.type === 'NEXTGEN_PAIR' && typeof data.code === 'string') {
    void pair(data.code, data.apiUrl);
  }
});

// Read at document_start, before the app's router can rewrite the URL
const codeFromUrl = new URLSearchParams(window.location.search).get('nextgenPair');
if (codeFromUrl) void pair(codeFromUrl);

window.postMessage({ type: 'NEXTGEN_EXTENSION_READY' }, window.location.origin);
