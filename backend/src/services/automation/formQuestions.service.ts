import { Page } from 'puppeteer';
import { logger } from '../../config/logger';
import { chatCompletion, parseJsonResponse } from '../openai.service';

export type QuestionType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'combobox' | 'yesno';

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
}

export interface JobContext {
  title: string;
  company: string;
  description?: string;
}

/**
 * Finds every visible, unanswered question in the form and tags it with data-aa-q="<id>".
 * Covers native inputs/selects/radios/checkboxes plus the custom widgets ATS forms use:
 * searchable comboboxes (Greenhouse, Ashby) and Yes/No button pairs (Ashby).
 */
async function tagUnansweredQuestions(page: Page, scope: string): Promise<FormQuestion[]> {
  return page.evaluate((scopeSelector: string) => {
    const root = document.querySelector(scopeSelector) || document.body;
    const clean = (t?: string | null) => (t || '').replace(/\s+/g, ' ').trim();
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const container = (el: Element) =>
      el.closest('fieldset, [role="radiogroup"], [role="group"], .field, .application-question, [class*="question"], [class*="field"]');

    // The question text for a field (for radios/checkboxes this is the group's label, not the option's)
    const questionLabel = (el: HTMLElement, isOption = false): string => {
      let text = '';
      if (!isOption && el.id) text = clean(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent);
      const labelledBy = el.getAttribute('aria-labelledby')
        || el.closest('fieldset, [role="radiogroup"], [role="group"]')?.getAttribute('aria-labelledby');
      if (!text && labelledBy) {
        text = clean(labelledBy.split(/\s+/).map(i => document.getElementById(i)?.textContent || '').join(' '));
      }
      if (!text) text = clean(el.closest('fieldset')?.querySelector('legend')?.textContent);
      if (!text && !isOption) text = clean(el.closest('label')?.textContent);
      // Walk up to the question's container and use its heading, skipping option labels that wrap inputs
      for (let node = el.parentElement, depth = 0; !text && node && node !== root && depth < 6; node = node.parentElement, depth++) {
        const candidate = Array.from(node.querySelectorAll('label, legend, [class*="label"], [class*="question-text"], [class*="title"]'))
          .find(l => !l.contains(el) && !l.querySelector('input, select, textarea') && clean(l.textContent));
        text = clean(candidate?.textContent);
      }
      if (!text) text = clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name'));
      return text.slice(0, 400);
    };
    const optionLabel = (el: HTMLInputElement): string =>
      clean((el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent)
        || el.closest('label')?.textContent || el.getAttribute('aria-label') || el.value);
    const isRequired = (el: Element, label: string) =>
      (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' || /\*/.test(label);

    const questions: FormQuestion[] = [];
    let counter = 0;
    const tag = (el: Element) => {
      const id = `q${counter++}`;
      el.setAttribute('data-aa-q', id);
      return id;
    };

    // Searchable comboboxes: answered when a value is shown next to the input
    root.querySelectorAll('input[role="combobox"]').forEach(node => {
      const input = node as HTMLInputElement;
      if (!visible(input) || input.value) return;
      // The chosen value renders beside the input inside the select's control, not always in the question container
      const box = input.closest('[class*="control"]') || container(input);
      if (box?.querySelector('[class*="singleValue"], [class*="single-value"], [class*="multiValue"], [class*="multi-value"]')) return;
      const label = questionLabel(input);
      questions.push({ id: tag(input), label, type: 'combobox', required: isRequired(input, label) });
    });

    // Text inputs and textareas
    root.querySelectorAll('input, textarea').forEach(node => {
      const input = node as HTMLInputElement;
      const type = (input.getAttribute('type') || 'text').toLowerCase();
      const isText = input.tagName === 'TEXTAREA' || ['text', 'url', 'number', 'tel', 'email', 'date'].includes(type);
      if (!isText || input.value || input.readOnly || !visible(input) || input.getAttribute('role') === 'combobox') return;
      // Custom selects keep a hidden "required" input for validation; it is not a question
      if (input.getAttribute('aria-hidden') === 'true' || input.tabIndex === -1) return;
      if (input.hasAttribute('data-aa-q')) return;
      const label = questionLabel(input);
      questions.push({
        id: tag(input), label, type: input.tagName === 'TEXTAREA' ? 'textarea' : 'text', required: isRequired(input, label)
      });
    });

    // Native selects
    root.querySelectorAll('select').forEach(node => {
      const select = node as HTMLSelectElement;
      if (!visible(select) || (select.value && select.selectedIndex > 0)) return;
      const label = questionLabel(select);
      const options = Array.from(select.options).map(o => clean(o.textContent)).filter(o => o && !/^select|^choose|^--/i.test(o));
      questions.push({ id: tag(select), label, type: 'select', options, required: isRequired(select, label) });
    });

    // Radio and checkbox groups (grouped by name)
    const groups = new Map<string, HTMLInputElement[]>();
    root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(node => {
      const input = node as HTMLInputElement;
      const key = `${input.type}:${input.name || input.id}`;
      groups.set(key, [...(groups.get(key) || []), input]);
    });
    groups.forEach(inputs => {
      if (inputs.some(i => i.checked)) return;
      const first = inputs[0];
      // Custom-styled radios hide the input itself, so check the label's visibility too
      if (!inputs.some(i => visible(i) || (i.closest('label') && visible(i.closest('label')!)))) return;
      const isSingleCheckbox = first.type === 'checkbox' && inputs.length === 1;
      const label = isSingleCheckbox ? questionLabel(first) : questionLabel(first, true);
      const id = `q${counter++}`;
      inputs.forEach(i => {
        i.setAttribute('data-aa-q', id);
        i.setAttribute('data-aa-opt', optionLabel(i));
      });
      questions.push({
        id, label,
        type: first.type === 'radio' ? 'radio' : 'checkbox',
        options: inputs.map(optionLabel),
        required: inputs.some(i => isRequired(i, label))
      });
    });

    // Yes/No button pairs (Ashby boolean questions)
    root.querySelectorAll('button').forEach(node => {
      const parent = node.parentElement;
      if (!parent || parent.hasAttribute('data-aa-q') || !visible(node)) return;
      const texts = Array.from(parent.querySelectorAll(':scope > button')).map(b => clean(b.textContent).toLowerCase());
      if (texts.length !== 2 || !texts.includes('yes') || !texts.includes('no')) return;
      if (parent.querySelector(':scope > button[aria-pressed="true"]')) return;
      const label = questionLabel(parent as HTMLElement, true);
      questions.push({ id: tag(parent), label, type: 'yesno', options: ['Yes', 'No'], required: /\*/.test(label) });
    });

    return questions;
  }, scope) as Promise<FormQuestion[]>;
}

/** The options currently listed in this combobox's own menu (found via aria-controls) */
async function comboboxOptions(page: Page, selector: string): Promise<string[]> {
  return page.$eval(selector, el => {
    const listboxId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    const listbox = listboxId ? document.getElementById(listboxId) : null;
    // Some widgets (e.g. Ashby location) render options without linking them; use the visible ones
    const options = listbox
      ? Array.from(listbox.querySelectorAll('[role="option"]'))
      : Array.from(document.querySelectorAll('[role="option"]')).filter(o => o.getBoundingClientRect().height > 0);
    return options.map(o => (o.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  });
}

/** Opens each combobox to read its options (they only render while the menu is open) */
async function readComboboxOptions(page: Page, questions: FormQuestion[]): Promise<void> {
  for (const q of questions.filter(q => q.type === 'combobox')) {
    const selector = `[data-aa-q="${q.id}"]`;
    try {
      await page.click(selector);
      await new Promise(resolve => setTimeout(resolve, 600));
      q.options = (await comboboxOptions(page, selector)).slice(0, 80);
    } catch {
      q.options = [];
    } finally {
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }
}

export function profileForPrompt(profile: any): Record<string, any> {
  const p = typeof profile.toObject === 'function' ? profile.toObject() : profile;
  return {
    personalInfo: {
      name: [p.personalInfo?.firstName, p.personalInfo?.lastName].filter(Boolean).join(' '),
      preferredName: p.personalInfo?.preferredName,
      email: p.personalInfo?.email,
      phone: p.personalInfo?.phone,
      address: p.personalInfo?.address,
      linkedin: p.personalInfo?.linkedin,
      github: p.personalInfo?.github,
      portfolio: p.personalInfo?.portfolio || p.personalInfo?.website
    },
    professionalSummary: p.professionalSummary,
    // Self-identification (eeoData) is answered by rules only and never sent to the model
    screeningQuestions: (({ eeoData: _eeo, ...rest }) => rest)(p.screeningQuestions || {}),
    workExperience: (p.workExperience || []).slice(0, 4).map((w: any) => ({
      company: w.company, position: w.position, startDate: w.startDate, endDate: w.endDate, current: w.current,
      technologies: w.technologies, achievements: (w.achievements || []).slice(0, 3)
    })),
    education: (p.education || []).map((e: any) => ({
      institution: e.institution, degree: e.degree, field: e.field, endDate: e.endDate
    })),
    skills: (p.skills || []).map((s: any) => `${s.name} (${s.level})`),
    languages: (p.additionalInfo?.languages || []).map((l: any) => `${l.name} (${l.proficiency})`)
  };
}

const SELF_ID_QUESTION = /gender|\bsex\b|race|ethnic|hispanic|latin[oa]|veteran|disabilit|sexual orientation|lgbt|\bpronouns?\b|transgender/i;
const DECLINE_ANSWER = /decline|prefer not|do(n'?t| not) want to|don'?t wish|do not wish|not to (say|answer|disclose|identify|self)|choose not/i;

const SYSTEM_PROMPT = `You fill out job application forms on behalf of a candidate, using ONLY facts from the candidate profile.

Return JSON: {"answers": [{"id": "<question id>", "answer": <string or null>}]}

Rules:
- Never invent facts (employers, dates, degrees, certifications, clearances, numbers). If the profile does not contain the information, answer null.
- For select, radio, checkbox, combobox and yesno questions, the answer must be copied exactly from that question's options. If options are empty for a combobox, give a short value to type (e.g. a city).
- Work authorization / sponsorship / relocation / notice period / salary questions: answer from profile.screeningQuestions. If not present, null.
- Age 18+, driver's license, travel, highest education, citizenship, visa type, security clearance, contract roles, shifts, non-compete, criminal convictions: answer from profile.screeningQuestions only; a missing or null value means null.
- Agreements required to apply (privacy policy, terms, accuracy attestation): choose the agreeing option. Optional marketing, SMS or newsletter consent: choose the option that declines, or null.
- "How did you hear about us": choose an option like "Company website" or "Job board" if present.
- "Have you worked at / applied to / been employed by <company> before": "No" unless that company appears in workExperience.
- Yes/No questions about skills or years of experience: answer from profile.skills, workExperience and professionalSummary.yearsOfExperience; "No" if the profile clearly doesn't meet it, null if the profile doesn't say.
- Language questions: pick the option matching a language in profile.languages (e.g. "English (ENG)" for English).
- Country/location questions: use the profile address; the candidate is in the United States unless the profile says otherwise.
- Free-text questions (why this company, describe your experience): write 2-4 sentences in first person, grounded in the profile and the job. Do not claim experience the profile does not show.
- URL questions: use the profile links; null if missing.
- Anything that looks like a test to detect bots or automated applications: answer null.`;

export async function generateAnswers(questions: FormQuestion[], profile: any, job?: JobContext): Promise<Map<string, string>> {
  const content = await chatCompletion({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      candidateProfile: profileForPrompt(profile),
      job: job && { title: job.title, company: job.company, description: job.description?.slice(0, 4000) },
      questions
    }),
    temperature: 0.2,
    maxTokens: 3000,
    json: true
  });

  const parsed = parseJsonResponse<{ answers?: { id: string; answer: string | null }[] }>(content);
  const answers = new Map<string, string>();
  for (const a of parsed.answers || []) {
    const answer = typeof a?.answer === 'string' ? a.answer.trim() : '';
    if (a?.id && answer && !/^(null|n\/a|none|unknown)$/i.test(answer)) answers.set(a.id, answer);
  }
  return answers;
}

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
const sameText = (a: string, b: string) => normalize(a) === normalize(b);

async function applyAnswer(page: Page, q: FormQuestion, answer: string): Promise<boolean> {
  const selector = `[data-aa-q="${q.id}"]`;
  switch (q.type) {
    case 'text':
    case 'textarea': {
      const el = await page.$(selector);
      if (!el) return false;
      await el.click();
      await el.type(answer, { delay: 10 });
      if (/location|city/i.test(q.label)) await pickLocationSuggestion(page, answer);
      return true;
    }
    case 'select': {
      const value = await page.$eval(selector, (el, wanted) => {
        const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
        const option = Array.from((el as HTMLSelectElement).options)
          .find(o => norm(o.textContent || '') === norm(wanted as string));
        return option ? option.value : null;
      }, answer);
      if (value === null) return false;
      await page.select(selector, value);
      return true;
    }
    case 'radio':
    case 'checkbox': {
      const inputs = await page.$$(selector);
      for (const input of inputs) {
        const option = await input.evaluate(el => el.getAttribute('data-aa-opt') || '');
        if (sameText(option, answer) || (q.type === 'checkbox' && inputs.length === 1 && /^(yes|true|agree|i agree)/i.test(answer))) {
          // Styled inputs are often hidden behind their label, so click the label when there is one
          const clicked = await input.evaluate(el => {
            const label = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
            (label as HTMLElement || el as HTMLElement).click();
            return true;
          });
          return clicked;
        }
      }
      return false;
    }
    case 'yesno': {
      return page.$eval(selector, (el, wanted) => {
        const button = Array.from(el.querySelectorAll(':scope > button'))
          .find(b => (b.textContent || '').trim().toLowerCase() === (wanted as string).toLowerCase()) as HTMLElement | undefined;
        button?.click();
        return !!button;
      }, answer);
    }
    case 'combobox': {
      const el = await page.$(selector);
      if (!el) return false;
      await el.click();
      await el.type(answer, { delay: 30 });
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Only pick an exact match, or the single option that contains the answer — never a guess
      const options = await comboboxOptions(page, selector);
      const wanted = normalize(answer);
      const exact = options.findIndex(o => normalize(o) === wanted);
      const partial = options.map((o, i) => (normalize(o).includes(wanted) ? i : -1)).filter(i => i >= 0);
      let index = exact >= 0 ? exact : partial.length === 1 ? partial[0] : -1;
      // Location search results: take the first suggestion for the city ("Austin, Texas, United States")
      if (index < 0 && /location|city|where/i.test(q.label) && options.length) {
        const city = normalize(answer.split(',')[0]);
        index = options.findIndex(o => normalize(o).startsWith(city));
      }

      if (index < 0) {
        // Clear what was typed so the field is left empty rather than half-filled
        await el.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Escape');
        return false;
      }
      return el.evaluate((input, i) => {
        const listbox = document.getElementById(input.getAttribute('aria-controls') || input.getAttribute('aria-owns') || '');
        const options = listbox
          ? Array.from(listbox.querySelectorAll('[role="option"]'))
          : Array.from(document.querySelectorAll('[role="option"]')).filter(o => o.getBoundingClientRect().height > 0);
        const option = options[i as number] as HTMLElement | undefined;
        option?.click();
        return !!option;
      }, index);
    }
  }
}

/** Location fields often only accept a value chosen from their suggestion list */
async function pickLocationSuggestion(page: Page, answer: string): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 1500));
  const city = normalize(answer.split(',')[0]);
  await page.evaluate((wantedCity: string) => {
    const items = Array.from(document.querySelectorAll('[role="option"], .dropdown-location, [class*="suggestion"]')) as HTMLElement[];
    const match = items.find(i => i.getBoundingClientRect().height > 0 && (i.textContent || '').toLowerCase().includes(wantedCity));
    match?.click();
  }, city);
}

const LANGUAGE_QUESTION = /\blanguages?\b/i;

function isSelfIdQuestion(q: FormQuestion): boolean {
  if (SELF_ID_QUESTION.test(q.label)) return true;
  // e.g. options "I am not a protected veteran" / "Decline to self-identify" under an unreadable label
  const options = q.options || [];
  return options.some(o => DECLINE_ANSWER.test(o)) && options.some(o => SELF_ID_QUESTION.test(o) || /\b(male|female)\b/i.test(o));
}
/**
 * Self-identification answers come only from the profile's eeoData:
 * a stored value picks the matching option, "prefer_not_to_say" picks the decline option,
 * and an unset value leaves the question empty ([]). Nothing is guessed.
 */
const SELF_ID_TOPICS: { question: RegExp; key: string; options: Record<string, RegExp> }[] = [
  { question: /transgender|gender identity.*(same|differ)|identify as trans/i, key: 'transgender',
    options: { yes: /^yes\b/i, no: /^no\b/i } },
  { question: /sexual orientation/i, key: 'sexualOrientation',
    options: { heterosexual: /heterosexual|straight/i, gay: /\bgay\b/i, lesbian: /lesbian/i, bisexual: /bisexual/i,
      asexual: /asexual/i, queer: /\bqueer\b/i } },
  { question: /\bpronouns?\b/i, key: 'pronouns', options: {} },
  { question: /hispanic|latin[oax]/i, key: 'hispanicLatino', options: { yes: /^yes\b/i, no: /^no\b/i } },
  { question: /\brace\b|ethnic/i, key: 'races',
    options: { asian: /\basian\b/i, white: /\bwhite\b/i, black_african_american: /black|african/i,
      hispanic_latino: /^(hispanic|latin[oax])/i, native_american: /american indian|alaska|native american|indigenous/i,
      pacific_islander: /hawaiian|pacific islander/i, middle_eastern: /middle eastern|north african|mena\b/i } },
  { question: /veteran|military|armed forces/i, key: 'veteranStatus',
    options: { not_veteran: /not a (protected )?veteran|i am not a veteran|^no\b/i,
      protected_veteran: /^(yes|i identify as|i am a protected|protected veteran)|one or more of the classifications/i,
      not_protected_veteran: /not a protected veteran|veteran,? but not|^(i am a )?veteran$/i } },
  { question: /disabilit/i, key: 'disabilityStatus',
    options: { no_disability: /^no\b|do(n'?| n)ot have a disability/i,
      has_disability: /^yes\b|i have a disability|have had one/i } },
  { question: /gender|\bsex\b/i, key: 'gender',
    options: { male: /^(male|man)\b/i, female: /^(female|woman)\b/i,
      non_binary: /non[- ]?binary|genderqueer|gender non/i } }
];

function selfIdChoices(q: FormQuestion, profile: any): string[] {
  const eeo = profileScreening(profile).eeoData || {};
  const text = `${q.label} ${(q.options || []).join(' ')}`;
  const topic = SELF_ID_TOPICS.find(t => t.question.test(q.label)) || SELF_ID_TOPICS.find(t => t.question.test(text));
  if (!topic) return [];
  const options = q.options || [];
  const stored = eeo[topic.key];
  const values: string[] = (Array.isArray(stored) ? stored : [stored]).filter((v: unknown) => typeof v === 'string' && v);
  if (!values.length) return [];

  if (values.includes('prefer_not_to_say')) {
    const decline = options.find(o => DECLINE_ANSWER.test(o));
    return decline ? [decline] : [];
  }
  // Pronouns are typed as stored; other questions need options to choose from
  if (topic.key === 'pronouns') return options.length ? options.filter(o => normalize(o) === normalize(values[0])) : [values[0]];
  if (!options.length) return [];
  const candidates = options.filter(o => !DECLINE_ANSWER.test(o));
  const picked: string[] = [];
  for (const value of values) {
    const pattern = topic.options[value];
    const match = pattern
      ? candidates.find(o => pattern.test(o.trim()))
      : candidates.find(o => normalize(o).includes(normalize(value)));
    if (match && !picked.includes(match)) picked.push(match);
  }
  // Several races on a single-choice question: the "two or more races" option
  if (topic.key === 'races' && values.length > 1 && q.type !== 'checkbox') {
    const multiple = candidates.find(o => /two or more|multi/i.test(o));
    return multiple ? [multiple] : [];
  }
  return picked;
}

const SPONSORSHIP_QUESTION = /sponsor/i;
const HEARD_ABOUT_QUESTION = /how did you (first )?(hear|learn|find)|where did you (hear|find|learn)|referral source|how you heard/i;
const AUTHORIZATION_QUESTION = /(authori[sz]ed|eligible|legally (able|permitted)|right) to work|work authori[sz]ation|work permit/i;

/**
 * Legal facts come from the profile only, never from the model:
 * sponsorship from requiresSponsorship; "authorized to work" from workAuthorization.
 * Returns "Yes"/"No", or null when the profile doesn't say (the question is then left empty).
 */
function profileScreening(profile: any): Record<string, any> {
  return (typeof profile.toObject === 'function' ? profile.toObject() : profile).screeningQuestions || {};
}

function legalAnswer(label: string, profile: any): 'Yes' | 'No' | null {
  const sq = profileScreening(profile);
  if (SPONSORSHIP_QUESTION.test(label)) {
    return typeof sq.requiresSponsorship === 'boolean' ? (sq.requiresSponsorship ? 'Yes' : 'No') : null;
  }
  if (AUTHORIZATION_QUESTION.test(label)) {
    if (['us_citizen', 'permanent_resident', 'work_visa'].includes(sq.workAuthorization)) return 'Yes';
    if (sq.workAuthorization === 'not_authorized') return 'No';
    // "require_sponsorship" says nothing about being authorized today (e.g. OPT), so don't guess
    return null;
  }
  return null;
}

/**
 * Questions answered by rules rather than the model (shared by server automation and the extension).
 * Returns the option(s)/text to use, [] when the rule applies but the answer must be left empty,
 * or null when no rule applies and the model should answer.
 * - Self-identification (gender, race, veteran, disability...): only the candidate's own stored answers;
 *   unset questions are left empty (see selfIdChoices).
 * - Work authorization / sponsorship: from the profile only.
 * - Language pick-lists: select the options matching profile languages.
 * - "How did you hear about us": the company's careers site.
 */
export function ruleChoices(q: FormQuestion, profile: any): string[] | null {
  const languages: string[] = (profile.additionalInfo?.languages || []).map((l: any) => normalize(l.name || ''));
  let choices: string[] | null = null;

  if (isSelfIdQuestion(q)) {
    choices = selfIdChoices(q, profile);
  } else if ((SPONSORSHIP_QUESTION.test(q.label) || AUTHORIZATION_QUESTION.test(q.label)) && !/^\s*if\b/i.test(q.label)) {
    const answer = legalAnswer(q.label, profile);
    if (!answer) {
      choices = [];
    } else if (q.options?.length) {
      // Prefer the plain "Yes"/"No" option, else the single one starting with it ("Yes, I am authorized");
      // several ("Yes, Netherlands visa" / "Yes, Ireland visa") are ambiguous, so pick nothing
      const exact = q.options.find(o => normalize(o) === answer.toLowerCase());
      let starting = q.options.filter(o => new RegExp(`^${answer}\\b`, 'i').test(o.trim()));
      // "Yes, no restriction" vs "Yes, but I will need sponsorship": the profile's sponsorship answer decides
      const needsSponsorship = profileScreening(profile).requiresSponsorship;
      if (!exact && starting.length > 1 && typeof needsSponsorship === 'boolean') {
        starting = starting.filter(o => /sponsor/i.test(o) === needsSponsorship);
      }
      choices = exact ? [exact] : starting.length === 1 ? starting : [];
    } else {
      choices = [answer];
    }
  } else if (LANGUAGE_QUESTION.test(q.label) && q.options?.length && languages.length) {
    // Only spoken-language pick-lists: "scripting language" Yes/No questions have no matching options
    const matching = q.options.filter(o => languages.some(lang => lang && normalize(o).startsWith(lang)));
    if (matching.length) choices = matching;
  }

  if (choices === null && HEARD_ABOUT_QUESTION.test(q.label)) {
    const option = (q.options || []).find(o => /company|career|website|job board|online/i.test(o));
    if (option) choices = [option];
    else if (q.type === 'text' || q.type === 'textarea') choices = ["Company's careers website"];
  }
  return choices;
}

/** Applies rule answers on the page; returns the questions still left for the model */
async function answerDeterministicQuestions(
  page: Page, questions: FormQuestion[], profile: any, answered: string[], handled: Set<string>
): Promise<FormQuestion[]> {
  const remaining: FormQuestion[] = [];

  for (const q of questions) {
    const choices = ruleChoices(q, profile);
    if (choices === null) {
      remaining.push(q);
      continue;
    }

    handled.add(q.label);
    let ok = false;
    for (const choice of q.type === 'checkbox' ? choices : choices.slice(0, 1)) {
      ok = (await applyAnswer(page, q, choice).catch(() => false)) || ok;
    }
    logger.debug(`Rule "${q.label.slice(0, 60)}" -> ${JSON.stringify(choices)} applied=${ok}`);
    if (ok) answered.push(q.label);
  }
  return remaining;
}

export interface QuestionFillResult {
  answered: string[];
  /** Required questions still empty after filling — the form must not be auto-submitted */
  unansweredRequired: string[];
}

/**
 * Answers the form's remaining questions with OpenAI using only profile facts.
 * Questions the profile can't answer are left empty and reported back.
 */
export async function answerFormQuestions(page: Page, scope: string, profile: any, job?: JobContext): Promise<QuestionFillResult> {
  const answered: string[] = [];
  const declined = new Set<string>(); // labels the model had no answer for

  // A second round catches fields that React re-rendered (and emptied) while others were filled
  for (let round = 1; round <= 2; round++) {
    await clearTags(page);
    // Yes/No buttons can't be read back, so re-answering them in round 2 would toggle them off
    const questions = (await tagUnansweredQuestions(page, scope))
      .filter(q => !declined.has(q.label) && !answered.includes(q.label));
    if (questions.length === 0) break;

    await readComboboxOptions(page, questions);
    logger.info(`Round ${round}: ${questions.length} unanswered form questions (${questions.filter(q => q.required).length} required)`);

    const answeredBefore = answered.length;
    // Rule-answered questions are never re-asked, so they are tracked with the declined ones
    const modelQuestions = await answerDeterministicQuestions(page, questions, profile, answered, declined);
    let appliedThisRound = answered.length - answeredBefore;

    let answers = new Map<string, string>();
    try {
      if (modelQuestions.length) answers = await generateAnswers(modelQuestions, profile, job);
    } catch (error: any) {
      logger.warn(`Could not generate answers: ${error.message}`);
    }

    for (const q of modelQuestions) {
      const answer = answers.get(q.id);
      if (!answer) declined.add(q.label);

      let ok = false;
      if (answer) {
        try {
          ok = await applyAnswer(page, q, answer);
        } catch (error: any) {
          logger.warn(`Failed to answer "${q.label}": ${error.message}`);
        }
      }
      logger.debug(`Q ${q.id} [${q.type}${q.required ? ', required' : ''}] "${q.label.slice(0, 80)}" ` +
        `options=${JSON.stringify((q.options || []).slice(0, 8))} answer=${JSON.stringify(answer ?? null)} applied=${ok}`);
      if (ok) {
        answered.push(q.label);
        appliedThisRound++;
      }
    }
    if (appliedThisRound === 0) break;
  }

  // Re-read the form: whatever required field is still empty blocks an unattended submit
  await clearTags(page);
  const unansweredRequired = (await tagUnansweredQuestions(page, scope)).filter(q => q.required).map(q => q.label);
  await clearTags(page);

  logger.info(`Answered ${answered.length} questions; ${unansweredRequired.length} required still empty`);
  return { answered, unansweredRequired };
}

async function clearTags(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('[data-aa-q]').forEach(el => {
    el.removeAttribute('data-aa-q');
    el.removeAttribute('data-aa-opt');
  }));
}
