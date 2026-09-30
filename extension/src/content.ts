import { Answer, Context, FormQuestion, QueueEvent, Request, StepLevel } from './types';
import { findFormRoot, waitForStableForm } from './dom';
import { fillForm, missingRequired } from './filler';
import { Panel } from './panel';

/**
 * Runs on ATS pages (every frame). For a job from the apply queue it fills the form automatically;
 * elsewhere it offers "Fill this form". It reports progress to the app and never clicks Submit.
 */

// Phrases ATS confirmation pages use after a successful submission (same as the server automation)
const CONFIRMATION = /thank(s| you) for (applying|your (application|interest))|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)|your application is (complete|on its way)/i;
const HUMAN_CHECK = /verification code|confirm you'?re a human|security code|flagged as (possible )?spam|captcha|i'?m not a robot/i;
const MAX_AUTO_FILLS = 15;

async function send<T = any>(request: Request): Promise<T> {
  const response = await chrome.runtime.sendMessage(request);
  if (!response?.ok) throw new Error(response?.error || 'The extension background is not responding');
  return response.result as T;
}

const ERROR_PAGE = /\b(503|502|504|429)\b.*(unavailable|too many|gateway|error)|service unavailable|lost in the weeds|too many requests/i;

/**
 * The site answered with an error page instead of the form (rate limiting, outage).
 * Greenhouse embed links fall back to the job's regular board page; otherwise reload a few times.
 * Returns true when it navigated away.
 */
function recoverFromErrorPage(): boolean {
  if (window !== window.top || !ERROR_PAGE.test((document.body?.innerText || '').slice(0, 500))) return false;

  const url = new URL(location.href);
  const board = url.searchParams.get('for');
  const token = url.searchParams.get('token');
  if (url.pathname.includes('/embed/job_app') && board && token) {
    location.replace(`https://job-boards.greenhouse.io/${board}/jobs/${token}${location.hash}`);
    return true;
  }

  const key = `nextgen-retry:${location.pathname}`;
  const attempts = Number(sessionStorage.getItem(key) || '0');
  if (attempts < 3) {
    sessionStorage.setItem(key, String(attempts + 1));
    setTimeout(() => location.reload(), 10000 * (attempts + 1));
  }
  return false;
}

async function main(): Promise<void> {
  const marker = window as unknown as { __nextgenApply?: boolean };
  if (marker.__nextgenApply) return;
  marker.__nextgenApply = true;
  if (recoverFromErrorPage()) return;

  // Only frames that actually contain an application form get a panel
  let formRoot = await waitForStableForm(15000);

  // The background service worker may be asleep (Chrome suspends it when idle): retry while it wakes
  let context: Context | null = null;
  let contextError = '';
  for (let attempt = 1; attempt <= 5 && !context; attempt++) {
    context = await send<Context>({ kind: 'context', href: location.href }).catch((error: Error) => {
      contextError = error.message;
      return null;
    });
    if (!context) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
  if (!context) {
    if (formRoot && window === window.top) {
      const panel = new Panel({ fill: () => location.reload(), submitted: () => undefined, skip: () => undefined,
        next: () => undefined, toggleAutoNext: () => undefined }, false, false);
      panel.setStatus('Error', 'attention');
      panel.step(`Couldn't reach the extension: ${contextError}`, 'error');
      panel.setNote('Click "Fill again" to reload the page and retry. If it keeps happening, reload the extension in chrome://extensions.');
    }
    return;
  }
  const item = context.item;

  // Opened inside the app's Apply Queue page (an iframe), not as its own tab
  const embeddedInApp = window !== window.top && location.hash.includes('nextgen-item=');

  // Without a form in this frame, only the job's own frame (a tab, or the app's embedded frame)
  // shows the panel and keeps waiting; other frames stay quiet
  if (!formRoot && (!item || (window !== window.top && !embeddedInApp))) return;

  const queued = !!item && !['submitted', 'skipped'].includes(item.status);
  let autoNext = context.autoNext;
  let submitted = false;
  let fills = 0;
  const answeredLabels = new Set<string>();

  const report = (event: QueueEvent) => {
    if (item) send({ kind: 'event', itemId: item.id, event }).catch(() => undefined);
  };
  const log = (message: string, level: StepLevel = 'info') => panel.step(message, level);

  const panel = new Panel({
    fill: () => void runFill(true),
    submitted: () => void markSubmitted('Marked as submitted by you'),
    skip: () => {
      report({ type: 'skipped', message: 'Skipped from the page' });
      void goNext(0);
    },
    next: () => void goNext(0),
    toggleAutoNext: value => {
      autoNext = value;
      void send({ kind: 'setAutoNext', value });
    }
  }, queued, autoNext);
  panel.setJob(item);

  if (!context.paired) {
    panel.setStatus('Not connected', 'attention');
    panel.setNote('Open the NextGen Apply extension popup and enter the pairing code from the Apply Queue page.');
    return;
  }
  if (!context.profile) {
    panel.setStatus('No profile', 'attention');
    panel.setNote(context.error || 'Create your profile in the app first.');
    return;
  }

  if (!formRoot) {
    // The form is behind an "Apply" button, loads slowly, or lives in a frame this page can't reach
    panel.setStatus('Waiting for form', 'attention');
    panel.setNote('Click the page\'s "Apply" button if there is one — the form is filled as soon as it appears. If it never shows, use Skip.');
    log('Waiting for the application form to appear…');
    formRoot = await waitForStableForm(5 * 60 * 1000);
    if (!formRoot) {
      log('No application form appeared on this page. Apply on the site directly, or Skip.', 'warn');
      report({ type: 'step', message: 'No application form found on the page', level: 'warn' });
      return;
    }
  }

  async function runFill(manual: boolean): Promise<void> {
    if (!formRoot || fills >= MAX_AUTO_FILLS) return;
    fills++;
    panel.setBusy(true);
    panel.setStatus('Filling…', 'working');
    try {
      // Always the live form: the page may have replaced it since it was found
      const currentRoot = () => {
        const root = findFormRoot();
        if (root) formRoot = root;
        return formRoot!;
      };
      const result = await fillForm(currentRoot, {
        profile: context!.profile!,
        resume: () => send({ kind: 'resume' }).catch(error => { log(`Resume: ${error.message}`, 'warn'); return null; }),
        answers: async (questions: FormQuestion[]) => {
          log(`Asking for answers to ${questions.length} question(s)...`);
          const { answers } = await send<{ answers: Record<string, Answer> }>({
            kind: 'answers', questions, itemId: item?.id,
            job: item?.job ? undefined : { title: document.title, company: location.hostname }
          });
          return answers;
        },
        log,
        debug: context!.debug ? (message: string) => log(message) : undefined
      }, answeredLabels);

      panel.setMissing(result.missingRequired);
      const needsYou = result.missingRequired.length > 0;
      panel.setStatus(needsYou ? `${result.missingRequired.length} need you` : 'Ready to submit', needsYou ? 'attention' : 'done');
      panel.setNote(needsYou
        ? 'Fill the highlighted fields, then click the site\'s Submit button.'
        : 'Everything required is filled. Review it, then click the site\'s Submit button.');
      report({
        type: 'filled',
        message: `${manual ? 'Filled again' : 'Filled'}: ${result.filled.length} profile field(s), ${result.answered} answer(s)` +
          `${result.resumeAttached ? ', resume attached' : ''}${needsYou ? ` — ${result.missingRequired.length} field(s) need you` : ''}`,
        level: needsYou ? 'warn' : 'success',
        filledCount: result.filled.length + result.answered,
        missingFields: result.missingRequired.map(m => m.label)
      });
    } catch (error: any) {
      log(`Fill failed: ${error.message}`, 'error');
      panel.setStatus('Error', 'attention');
    } finally {
      panel.setBusy(false);
    }
  }

  async function markSubmitted(message: string): Promise<void> {
    if (submitted) return;
    submitted = true;
    log(message, 'success');
    panel.setStatus('Submitted', 'done');
    report({ type: 'submitted', message });
    if (embeddedInApp) {
      window.parent.postMessage({ type: 'NEXTGEN_SUBMITTED', itemId: item?.id }, '*');
    }
    if (queued && autoNext) {
      panel.setNote('Opening the next job in 3 seconds…');
      await goNext(3000);
    }
  }

  async function goNext(delayMs: number): Promise<void> {
    if (embeddedInApp) {
      // Inside the app's Apply Queue page: the app loads the next job into its frame
      window.setTimeout(() => window.parent.postMessage({ type: 'NEXTGEN_NEXT', itemId: item?.id }, '*'), delayMs);
      return;
    }
    const { item: next } = await send<{ item: unknown }>({ kind: 'next', delayMs }).catch(() => ({ item: null }));
    if (!next) {
      log('Your queue is done for today 🎉', 'success');
      panel.setNote('No more jobs in the queue. Build a new queue from the app anytime.');
    }
  }

  if (queued) {
    report({ type: 'opened', message: 'Form opened in your browser' });
    log(`Opened: ${item!.job?.title} at ${item!.job?.company}`);
  } else {
    log(item ? `Already ${item.status} in your queue` : 'Form detected. Click "Fill again" to fill it from your profile.');
  }
  if (queued) await runFill(false);

  // Watch for the confirmation page, human checks and new form steps (Workday-style multi-page forms)
  let lastEmpty = queued ? missingRequired(formRoot).length : 0;
  let humanCheckShown = false;
  let pending: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      const text = document.body.innerText || '';
      if (!submitted && CONFIRMATION.test(text)) {
        void markSubmitted('Confirmation page detected — application submitted');
        return;
      }
      if (!humanCheckShown && HUMAN_CHECK.test(text)) {
        humanCheckShown = true;
        panel.setStatus('Needs you', 'attention');
        log('The site asked you to confirm (email code / CAPTCHA). Complete it on the page, then submit.', 'warn');
        report({ type: 'step', message: 'The site asked for a verification code / CAPTCHA — waiting for you', level: 'warn' });
      }
      // A new page of a multi-step form: fill it too
      const root = findFormRoot() || formRoot!;
      const empty = missingRequired(root).length;
      if (queued && !submitted && root && empty > lastEmpty) {
        formRoot = root;
        log('New form step detected — filling it');
        void runFill(false);
      }
      lastEmpty = empty;
    }, 1500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

void main();
