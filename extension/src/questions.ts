import { FormQuestion } from './types';
import {
  clean, fillText, isRequired, isVisible, listedOptions, normalize, questionLabel, realClick, setNativeValue, sleep, waitFor
} from './dom';

/**
 * Finds the form's unanswered questions (native inputs plus the custom widgets ATS use:
 * searchable comboboxes, Yes/No button pairs, Workday listbox buttons) and applies answers.
 */

export interface TaggedQuestion extends FormQuestion {
  elements: HTMLElement[];
}

const optionLabel = (el: HTMLInputElement): string =>
  clean((el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent)
    || el.closest('label')?.textContent || el.getAttribute('aria-label') || el.value);

export function collectQuestions(root: Element): TaggedQuestion[] {
  const questions: TaggedQuestion[] = [];
  const seen = new Set<Element>();
  let counter = 0;
  const add = (q: Omit<TaggedQuestion, 'id'>) => {
    q.elements.forEach(e => seen.add(e));
    questions.push({ ...q, id: `q${counter++}` });
  };

  // Searchable comboboxes: answered when a value is shown beside the input
  root.querySelectorAll('input[role="combobox"]').forEach(node => {
    const input = node as HTMLInputElement;
    if (!isVisible(input) || input.value) return;
    const control = input.closest('[class*="control"]') || input.parentElement;
    if (control?.querySelector('[class*="singleValue"], [class*="single-value"], [class*="multiValue"], [class*="multi-value"]')) return;
    const label = questionLabel(input, root);
    add({ label, type: 'combobox', required: isRequired(input, label), elements: [input] });
  });

  // Workday-style listbox buttons ("Select One")
  root.querySelectorAll('button[aria-haspopup="listbox"]').forEach(node => {
    const button = node as HTMLButtonElement;
    if (!isVisible(button) || !/^(select( one)?|choose|--)?$/i.test(clean(button.textContent))) return;
    const label = questionLabel(button, root);
    add({ label, type: 'listbutton', required: isRequired(button, label), elements: [button] });
  });

  // Text inputs and textareas
  root.querySelectorAll('input, textarea').forEach(node => {
    const input = node as HTMLInputElement;
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    const isText = input.tagName === 'TEXTAREA' || ['text', 'url', 'number', 'tel', 'email', 'date'].includes(type);
    if (!isText || seen.has(input) || input.value || input.readOnly || input.disabled || !isVisible(input)) return;
    if (input.getAttribute('role') === 'combobox' || input.getAttribute('aria-hidden') === 'true' || input.tabIndex === -1) return;
    const label = questionLabel(input, root);
    add({ label, type: input.tagName === 'TEXTAREA' ? 'textarea' : 'text', required: isRequired(input, label), elements: [input] });
  });

  // Native selects
  root.querySelectorAll('select').forEach(node => {
    const select = node as HTMLSelectElement;
    if (!isVisible(select) || (select.value && select.selectedIndex > 0)) return;
    const label = questionLabel(select, root);
    const options = Array.from(select.options).map(o => clean(o.textContent)).filter(o => o && !/^select|^choose|^--/i.test(o));
    add({ label, type: 'select', options, required: isRequired(select, label), elements: [select] });
  });

  // Radio and checkbox groups
  const groups = new Map<string, HTMLInputElement[]>();
  root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(node => {
    const input = node as HTMLInputElement;
    const key = `${input.type}:${input.name || input.id}`;
    groups.set(key, [...(groups.get(key) || []), input]);
  });
  groups.forEach(inputs => {
    if (inputs.some(i => i.checked)) return;
    // Custom-styled inputs are hidden behind their label
    if (!inputs.some(i => isVisible(i) || (i.closest('label') && isVisible(i.closest('label')!)))) return;
    const first = inputs[0];
    const single = first.type === 'checkbox' && inputs.length === 1;
    const label = questionLabel(first, root, !single);
    add({
      label,
      type: first.type === 'radio' ? 'radio' : 'checkbox',
      options: inputs.map(optionLabel),
      required: inputs.some(i => isRequired(i, label)),
      elements: inputs
    });
  });

  // Yes/No button pairs (Ashby)
  root.querySelectorAll('button').forEach(node => {
    const parent = node.parentElement;
    if (!parent || seen.has(parent) || !isVisible(node)) return;
    const buttons = Array.from(parent.querySelectorAll(':scope > button'));
    const texts = buttons.map(b => clean(b.textContent).toLowerCase());
    if (texts.length !== 2 || !texts.includes('yes') || !texts.includes('no')) return;
    if (parent.querySelector(':scope > button[aria-pressed="true"]')) return;
    const label = questionLabel(parent, root, true);
    add({ label, type: 'yesno', options: ['Yes', 'No'], required: /\*|✱/.test(label), elements: [parent] });
  });

  return questions;
}

/** Opens each combobox / listbox button to read its options (they only render while open) */
export async function readDropdownOptions(questions: TaggedQuestion[], debug?: (message: string) => void): Promise<void> {
  for (const q of questions.filter(q => q.type === 'combobox' || q.type === 'listbutton')) {
    const control = q.elements[0];
    try {
      realClick(control);
      await sleep(600);
      q.options = listedOptions(control).map(o => clean(o.textContent)).filter(Boolean).slice(0, 80);
      debug?.(`open "${q.label.slice(0, 40)}": connected=${control.isConnected} expanded=${control.getAttribute('aria-expanded')} ` +
        `controls=${control.getAttribute('aria-controls')} options=${q.options.length} visibleOptions=${document.querySelectorAll('[role="option"]').length}`);
    } catch {
      q.options = [];
    } finally {
      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      (control as HTMLElement).blur?.();
      await sleep(150);
    }
  }
}

function pickOption(options: HTMLElement[], answer: string, isLocation: boolean): HTMLElement | null {
  const wanted = normalize(answer);
  const texts = options.map(o => normalize(o.textContent || ''));
  const exact = texts.indexOf(wanted);
  if (exact >= 0) return options[exact];
  const partial = texts.map((t, i) => (t.includes(wanted) ? i : -1)).filter(i => i >= 0);
  if (partial.length === 1) return options[partial[0]];
  if (isLocation) {
    // Location search results: the first suggestion for the city ("Austin, Texas, United States")
    const city = normalize(answer.split(',')[0]);
    const index = texts.findIndex(t => t.startsWith(city));
    if (index >= 0) return options[index];
  }
  return null;
}

export async function applyAnswer(q: TaggedQuestion, answer: string): Promise<boolean> {
  const el = q.elements[0];
  const isLocation = /location|city|where/i.test(q.label);
  switch (q.type) {
    case 'text':
    case 'textarea': {
      const input = el as HTMLInputElement;
      if (input.value) return false;
      if (!isLocation) return fillText(input, answer);

      // Location search boxes (e.g. Lever) clear themselves on blur unless a suggestion was chosen
      setNativeValue(input, answer);
      const suggestions = () => {
        const linked = listedOptions(input);
        return linked.length ? linked
          : Array.from(document.querySelectorAll('.dropdown-location, [class*="suggestion"], [class*="result-item"]')).filter(isVisible) as HTMLElement[];
      };
      await waitFor(() => (suggestions().length ? true : null), 4000, 300);
      const option = pickOption(suggestions(), answer, true);
      if (option) realClick(option);
      await sleep(300);
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return !!option || !!input.value;
    }
    case 'select': {
      const select = el as HTMLSelectElement;
      const options = Array.from(select.options);
      // Exact text, else the single option containing it (option text can carry invisible characters)
      // Punctuation-insensitive: "Other - School Not Listed" ≈ "Other (School Not Listed)"
      const alike = (text: string) => normalize(text.replace(/[^\p{L}\p{N}]+/gu, ' '));
      const containing = options.filter(o => alike(o.textContent || '').includes(alike(answer)));
      const option = options.find(o => normalize(o.textContent || '') === normalize(answer))
        || (containing.length === 1 ? containing[0] : undefined);
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    case 'radio':
    case 'checkbox': {
      const input = (q.elements as HTMLInputElement[]).find(i => normalize(optionLabel(i)) === normalize(answer))
        || (q.type === 'checkbox' && q.elements.length === 1 && /^(yes|true|agree|i agree)/i.test(answer) ? q.elements[0] as HTMLInputElement : null);
      if (!input) return false;
      const label = (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.closest('label');
      realClick((label as HTMLElement) || input);
      return true;
    }
    case 'yesno': {
      const button = Array.from(el.querySelectorAll(':scope > button')).find(b => normalize(b.textContent || '') === normalize(answer));
      if (!button) return false;
      realClick(button);
      return true;
    }
    case 'combobox': {
      const input = el as HTMLInputElement;
      realClick(input);
      setNativeValue(input, answer);
      await sleep(1200);
      const option = pickOption(listedOptions(input), answer, isLocation);
      if (!option) {
        setNativeValue(input, '');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      realClick(option);
      await sleep(300);
      return true;
    }
    case 'listbutton': {
      realClick(el);
      await sleep(700);
      const option = pickOption(listedOptions(el), answer, isLocation);
      if (!option) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      realClick(option);
      await sleep(300);
      return true;
    }
  }
}
