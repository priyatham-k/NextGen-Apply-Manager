/**
 * DOM helpers that work with framework-controlled forms (React, Vue): values are set through the
 * native setter and announced with the events those frameworks listen for.
 */

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const clean = (text?: string | null) => (text || '').replace(/\s+/g, ' ').trim();

/** Visible text only: innerText skips hidden helper text ("No results found", "Loading") that textContent includes */
const visibleText = (el?: Element | null) => clean(el ? ((el as HTMLElement).innerText ?? el.textContent) : '');
export const normalize = (text: string) => clean(text).toLowerCase();

export function isVisible(el: Element): boolean {
  const box = (el as HTMLElement).getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const key = value.slice(-1) || 'Backspace';
  el.focus();
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // Search-as-you-type fields (e.g. Lever location) listen for key events rather than input
  el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Types into an empty field; returns false when the field already has a value */
export function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (!value || el.value) return false;
  setNativeValue(el, value);
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

/** A full click (some widgets only react to mousedown/mouseup) */
export function realClick(el: Element): void {
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  (el as HTMLElement).click();
}

/** The question text for a field. For radios/checkboxes (isOption) it is the group's label, not the option's. */
export function questionLabel(el: HTMLElement, root: Element, isOption = false): string {
  let text = '';
  if (!isOption && el.id) text = visibleText(document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
  // Only the field's own or its group's aria-labelledby — ancestors like tab panels are labelled too
  const labelledBy = el.getAttribute('aria-labelledby')
    || el.closest('fieldset, [role="radiogroup"], [role="group"]')?.getAttribute('aria-labelledby');
  if (!text && labelledBy) {
    text = clean(labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' '));
  }
  if (!text) text = visibleText(el.closest('fieldset')?.querySelector('legend'));
  if (!text && !isOption) text = visibleText(el.closest('label'));
  // Walk up to the question's container and use its heading, skipping option labels that wrap inputs
  for (let node = el.parentElement, depth = 0; !text && node && node !== root && depth < 6; node = node.parentElement, depth++) {
    const candidate = Array.from(node.querySelectorAll('label, legend, [class*="label"], [class*="question-text"], [class*="title"], [data-automation-id*="label" i]'))
      .find(l => !l.contains(el) && !l.querySelector('input, select, textarea') && visibleText(l));
    text = visibleText(candidate);
  }
  if (!text) text = clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name'));
  return text.slice(0, 400);
}

/** Label, name, id, aria-label and placeholder, for matching well-known fields */
export function describeField(el: HTMLElement, root: Element): string {
  return [questionLabel(el, root), el.getAttribute('aria-label'), el.getAttribute('name'), el.id,
    el.getAttribute('placeholder'), el.getAttribute('data-automation-id')]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isRequired(el: Element, label: string): boolean {
  return (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' || /\*|✱/.test(label);
}

/** The application form: the element holding the email field (a <form> when there is one) */
export function findFormRoot(): Element | null {
  const email = findEmailField(document.body);
  if (!email) return null;
  return email.closest('form') || document.body;
}

export function findEmailField(root: Element): HTMLInputElement | null {
  const inputs = Array.from(root.querySelectorAll('input')) as HTMLInputElement[];
  return inputs.find(i => isVisible(i) && (i.type === 'email' || /e-?mail/.test(describeField(i, root)))) || null;
}

/** Options listed by a combobox / listbox button (only rendered while open) */
export function listedOptions(control: Element): HTMLElement[] {
  const listboxId = control.getAttribute('aria-controls') || control.getAttribute('aria-owns');
  const listbox = listboxId ? document.getElementById(listboxId) : null;
  const options = listbox
    ? Array.from(listbox.querySelectorAll('[role="option"]'))
    : Array.from(document.querySelectorAll('[role="option"]')).filter(isVisible);
  return options as HTMLElement[];
}

/**
 * Waits for the application form to exist and the page to stop changing. Frameworks often render
 * a form, then replace it while hydrating; working on the first copy fills detached elements.
 */
export async function waitForStableForm(timeoutMs: number, quietMs = 1200): Promise<Element | null> {
  let lastMutation = Date.now();
  const observer = new MutationObserver(() => { lastMutation = Date.now(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  try {
    const end = Date.now() + timeoutMs;
    let candidate: Element | null = null;
    while (Date.now() < end) {
      const root = findFormRoot();
      if (root && root === candidate && root.isConnected && Date.now() - lastMutation >= quietMs) return root;
      candidate = root;
      await sleep(300);
    }
    return findFormRoot();
  } finally {
    observer.disconnect();
  }
}

export async function waitFor<T>(check: () => T | null | undefined, timeoutMs: number, intervalMs = 400): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await sleep(intervalMs);
  }
  return check() || null;
}
