import { Answer, FillProfile, FormQuestion, StepLevel } from './types';
import { describeField, fillText, isVisible, sleep } from './dom';
import { applyAnswer, collectQuestions, readDropdownOptions, TaggedQuestion } from './questions';

/**
 * Fills an application form: profile fields → resume → custom questions (answers from the backend:
 * rules for self-identification / work authorization, AI for the rest). Never submits.
 */

export type Log = (message: string, level?: StepLevel) => void;

export interface FillDeps {
  profile: FillProfile;
  resume: () => Promise<{ filename: string; mimeType: string; base64: string } | null>;
  answers: (questions: FormQuestion[]) => Promise<Record<string, Answer>>;
  log: Log;
  /** Per-question details, only in debug mode */
  debug?: Log;
}

export interface FillResult {
  filled: string[];
  answered: number;
  resumeAttached: boolean;
  missingRequired: { label: string; element: HTMLElement }[];
}

// Well-known fields filled straight from the profile, matched on label/name/id
function commonFields(p: FillProfile): { label: string; pattern: RegExp; value?: string | number }[] {
  return [
    { label: 'first name', pattern: /first.?name|given.?name|legalname.*first/, value: p.firstName },
    { label: 'last name', pattern: /last.?name|family.?name|surname|legalname.*last/, value: p.lastName },
    { label: 'email', pattern: /e-?mail/, value: p.email },
    { label: 'phone', pattern: /(phone|mobile)(?!.*(extension|device|type|code))/, value: p.phone },
    { label: 'LinkedIn', pattern: /linkedin/, value: p.linkedin },
    { label: 'GitHub', pattern: /github/, value: p.github },
    { label: 'website', pattern: /portfolio|website|personal site/, value: p.portfolio },
    { label: 'current company', pattern: /current (company|employer)|most recent (company|employer)|^org\b/, value: p.currentCompany },
    { label: 'current title', pattern: /current (job )?title|most recent (job )?title/, value: p.currentTitle },
    // Workday ids look like "addressSection_addressLine1" / "addressSection_city": no \b across "_"
    { label: 'address', pattern: /address ?(line)? ?1|street/, value: p.address?.street },
    { label: 'city', pattern: /(^|[^a-z])city(?![a-z])(?!.*(state|country))/, value: p.address?.city },
    { label: 'postal code', pattern: /postal|zip/, value: p.address?.zipCode },
    { label: 'school', pattern: /^school\b|university|college|institution/, value: p.school },
    { label: 'degree', pattern: /^degree\b/, value: p.degree },
    { label: 'field of study', pattern: /field of study|discipline|major/, value: p.fieldOfStudy }
  ];
}

function textFields(root: Element): HTMLInputElement[] {
  return (Array.from(root.querySelectorAll('input, textarea')) as HTMLInputElement[]).filter(el => {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'email', 'tel', 'url', ''].includes(type) && isVisible(el) && !el.readOnly && !el.disabled
      && el.getAttribute('role') !== 'combobox' && el.getAttribute('aria-hidden') !== 'true';
  });
}

export function fillProfileFields(root: Element, profile: FillProfile): string[] {
  const filled: string[] = [];
  const fields = textFields(root);
  const describe = new Map(fields.map(f => [f, describeField(f, root)]));
  const used = new Set<Element>();

  const fill = (label: string, pattern: RegExp, value?: string | number) => {
    if (value === undefined || value === null || value === '') return false;
    const field = fields.find(f => !used.has(f) && pattern.test(describe.get(f) || ''));
    if (!field) return false;
    used.add(field);
    if (fillText(field, String(value))) {
      filled.push(label);
      return true;
    }
    return false;
  };

  for (const { label, pattern, value } of commonFields(profile)) fill(label, pattern, value);
  if (!filled.includes('first name')) {
    // Lever and Ashby use a single full-name field
    fill('full name', /^(full |legal )?name\b|_systemfield_name|\bfull.?name\b/, profile.fullName);
  }
  return filled;
}

export async function attachResume(root: Element, deps: FillDeps): Promise<boolean> {
  const inputs = Array.from(root.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
  // Prefer the real resume field over "Autofill from resume" boxes, which would overwrite filled fields
  const input = inputs.find(i => /resume|\bcv\b/i.test(`${i.name} ${i.id}`))
    || inputs.find(i => /resume|\bcv\b/i.test(describeField(i, root)) && !/autofill/i.test(describeField(i, root)))
    || inputs[0];
  if (!input) return false;
  if (input.files && input.files.length) return true;

  const resume = await deps.resume();
  if (!resume) return false;
  const bytes = Uint8Array.from(atob(resume.base64), c => c.charCodeAt(0));
  const file = new File([bytes], resume.filename, { type: resume.mimeType });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

const MAX_OPTIONS = 100;

/**
 * Huge pick-lists (every university, every country) are cut down before being sent for answering:
 * keep "Other / Not listed" style options and the ones that share words with the profile.
 */
function trimOptions(options: string[], profile: FillProfile): string[] {
  if (options.length <= MAX_OPTIONS) return options;
  const words = [profile.school, profile.degree, profile.fieldOfStudy, profile.address?.city, profile.address?.state,
    profile.address?.country, profile.location]
    .filter(Boolean).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const relevant = options.filter(o => /other|not listed|none|prefer not|decline/i.test(o)
    || words.some(w => o.toLowerCase().includes(w)));
  return [...new Set([...relevant, ...options])].slice(0, MAX_OPTIONS);
}

async function answerQuestions(root: Element, deps: FillDeps, skip: Set<string>): Promise<number> {
  const questions = collectQuestions(root).filter(q => !skip.has(q.label));
  if (!questions.length) return 0;
  await readDropdownOptions(questions, deps.debug);

  const answers = await deps.answers(questions.map(({ elements: _elements, ...q }) => ({
    ...q, options: q.options && trimOptions(q.options, deps.profile)
  })));
  let applied = 0;
  for (const q of questions) {
    const answer = answers[q.id];
    skip.add(q.label); // answered or declined: never asked twice (Yes/No buttons would toggle off)
    if (!answer || !answer.values.length) continue;
    let ok = false;
    for (const value of q.type === 'checkbox' ? answer.values : answer.values.slice(0, 1)) {
      ok = (await applyAnswer(q, value).catch(() => false)) || ok;
    }
    deps.debug?.(`Q [${q.type}] "${q.label.slice(0, 70)}" options=${q.options?.length ?? 0} ` +
      `answer=${JSON.stringify(answer.values)} (${answer.source}) applied=${ok}`);
    if (ok) applied++;
  }
  return applied;
}

export function missingRequired(root: Element): { label: string; element: HTMLElement }[] {
  const missing = collectQuestions(root)
    .filter(q => q.required)
    .map((q: TaggedQuestion) => ({ label: q.label.replace(/\s*[*✱]\s*$/, '') || 'Unlabelled field', element: q.elements[0] }));
  const resumeInput = root.querySelector('input[type="file"][required]') as HTMLInputElement | null;
  if (resumeInput && !resumeInput.files?.length) missing.push({ label: 'Resume', element: resumeInput });
  return missing;
}

/**
 * getRoot is called before every step: pages replace their form while loading or after an upload,
 * and a stale reference would fill detached elements.
 */
export async function fillForm(getRoot: () => Element, deps: FillDeps, answeredLabels: Set<string>): Promise<FillResult> {
  // Resume first: some forms re-render after an upload and clear whatever was already typed
  let resumeAttached = false;
  try {
    resumeAttached = await attachResume(getRoot(), deps);
    if (resumeAttached) {
      deps.log('Resume attached', 'success');
      await sleep(1500);
    }
  } catch (error: any) {
    deps.log(`Could not attach the resume: ${error.message}`, 'warn');
  }

  const filled = fillProfileFields(getRoot(), deps.profile);
  deps.log(filled.length ? `Filled from your profile: ${filled.join(', ')}` : 'No standard profile fields on this page', filled.length ? 'success' : 'info');

  let answered = 0;
  try {
    deps.log('Reading the application questions...');
    answered += await answerQuestions(getRoot(), deps, answeredLabels);
    // A second pass catches fields React re-rendered (and emptied) while others were filled
    answered += await answerQuestions(getRoot(), deps, answeredLabels);
    deps.log(answered ? `Answered ${answered} question(s)` : 'No extra questions to answer', 'success');
  } catch (error: any) {
    deps.log(`Could not answer the questions: ${error.message}`, 'warn');
  }

  // Profile fields cleared by a re-render along the way are filled again
  const refilled = fillProfileFields(getRoot(), deps.profile);
  if (refilled.length) deps.log(`Re-filled fields the page cleared: ${refilled.join(', ')}`);

  const missing = missingRequired(getRoot());
  for (const m of missing) {
    m.element.style.outline = '2px solid #f59e0b';
    m.element.style.outlineOffset = '2px';
  }
  if (missing.length) deps.log(`${missing.length} required field(s) need you: ${missing.map(m => m.label).join(' | ')}`, 'warn');
  return { filled, answered, resumeAttached, missingRequired: missing };
}
