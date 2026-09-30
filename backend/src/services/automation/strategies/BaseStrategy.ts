import { ElementHandle, Page } from 'puppeteer';
import { logger } from '../../../config/logger';
import { JobContext } from '../formQuestions.service';
import { LogLevel } from '../../../models/Application.model';

export type ProgressCallback = (step: number, total: number, message: string, level?: LogLevel) => void;

// Phrases ATS confirmation pages use after a successful submission
const CONFIRMATION_PATTERN =
  /thank(s| you) for (applying|your (application|interest))|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)|your application is (complete|on its way)/i;

/**
 * Base class for all ATS automation strategies.
 * Automation runs in two phases so the user can review the filled form before it is sent:
 * fillForm() fills everything without submitting, then submit() clicks submit and verifies.
 */
export abstract class BaseATSStrategy {
  protected page: Page;
  protected profileData: any;
  protected onProgress: ProgressCallback;
  protected readonly totalSteps = 15;
  protected jobContext?: JobContext;
  /** Required questions left empty after filling; a form with any must not be auto-submitted */
  unansweredRequired: string[] = [];

  constructor(page: Page, profileData: any, onProgress: ProgressCallback, jobContext?: JobContext) {
    this.page = page;
    this.profileData = profileData;
    this.onProgress = onProgress;
    this.jobContext = jobContext;
  }

  /** Fill the application form without submitting it */
  async fillForm(resumePath?: string, coverLetterPath?: string): Promise<void> {
    await this.navigateToApplication();
    await this.fillBasicInfo();

    if (resumePath) {
      await this.uploadResume(resumePath);
    }
    if (coverLetterPath) {
      await this.uploadCoverLetter(coverLetterPath);
    }

    await this.answerCustomQuestions();
  }

  /** Submit the filled form. Returns true only when a confirmation message is detected. */
  async submit(): Promise<boolean> {
    await this.submitApplication();
    return this.verifySubmission();
  }

  protected abstract navigateToApplication(): Promise<void>;
  protected abstract fillBasicInfo(): Promise<void>;
  protected abstract uploadResume(filePath: string): Promise<void>;
  protected abstract uploadCoverLetter(filePath: string): Promise<void>;
  protected abstract submitApplication(): Promise<void>;

  /** Answer the form's remaining custom questions; sets unansweredRequired */
  protected async answerCustomQuestions(): Promise<void> {
    // Optional: strategies without custom-question support leave the form as filled
  }

  /** True when the page shows an "application received" style confirmation */
  async isConfirmationShown(): Promise<boolean> {
    const bodyText = await this.page.evaluate(() => document.body.innerText).catch(() => '');
    return CONFIRMATION_PATTERN.test(bodyText);
  }

  protected async verifySubmission(): Promise<boolean> {
    this.emitProgress(13, 'Verifying submission...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const confirmed = await this.isConfirmationShown();
      if (confirmed) {
        logger.info('✓ Submission confirmed');
      } else {
        logger.warn('No confirmation message found after submit');
      }
      return confirmed;
    } catch (error: any) {
      logger.warn(`Verification failed: ${error.message}`);
      return false;
    }
  }

  // Utility methods

  protected get personalInfo(): Record<string, any> {
    return this.profileData.personalInfo || {};
  }

  protected get fullName(): string {
    const { firstName, lastName } = this.personalInfo;
    return [firstName, lastName].filter(Boolean).join(' ');
  }

  /** Types into an empty field; returns false if the field or value is missing */
  protected async typeInto(target: string | ElementHandle<Element> | null, value?: string): Promise<boolean> {
    if (!value) return false;
    const element = typeof target === 'string' ? await this.page.$(target) : target;
    if (!element) return false;

    const current = await element.evaluate((el: any) => el.value || '');
    if (current) return true; // Don't duplicate text on a retry or a pre-filled field

    await element.click();
    await element.type(value, { delay: 30 });
    return true;
  }

  /**
   * Finds a visible form field whose label, name, id, aria-label or placeholder matches the pattern.
   * The description starts with the label text, so patterns can anchor on it with ^.
   */
  protected async findFieldByLabel(pattern: RegExp, fileInput = false): Promise<ElementHandle<Element> | null> {
    const handle = await this.page.evaluateHandle((source: string, flags: string, wantFile: boolean) => {
      const regex = new RegExp(source, flags);
      const describe = (el: HTMLElement): string => {
        const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
        const wrappingLabel = el.closest('label')?.textContent;
        // Greenhouse, Lever and Ashby wrap each label + input in a container element
        const containerLabel = el.closest('.field, .application-question, [class*="field"], [class*="question"]')
          ?.querySelector('label')?.textContent;
        return [forLabel, wrappingLabel, containerLabel, el.getAttribute('aria-label'),
          el.getAttribute('name'), el.id, el.getAttribute('placeholder')]
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
      };
      const fields = Array.from(document.querySelectorAll('input, textarea')) as HTMLInputElement[];
      return fields.find(el => {
        const isFile = el.type === 'file';
        if (isFile !== wantFile || ['hidden', 'checkbox', 'radio', 'submit'].includes(el.type)) return false;
        return regex.test(describe(el));
      }) || null;
    }, pattern.source, pattern.flags, fileInput);

    return handle.asElement() as ElementHandle<Element> | null;
  }

  /** Fills name, contact and profile-link fields found by their labels */
  protected async fillCommonFields(): Promise<string[]> {
    const pi = this.personalInfo;
    const filled: string[] = [];
    const fill = async (label: string, pattern: RegExp, value?: string) => {
      if (value && await this.typeInto(await this.findFieldByLabel(pattern), value)) {
        filled.push(label);
      }
    };

    await fill('first name', /first.?name|given.?name/, pi.firstName);
    await fill('last name', /last.?name|family.?name|surname/, pi.lastName);
    if (!filled.includes('first name')) {
      // Lever and Ashby use a single full-name field
      await fill('full name', /^(full |legal )?name\b|_systemfield_name/, this.fullName);
    }
    await fill('email', /e-?mail/, pi.email);
    await fill('phone', /phone|mobile/, pi.phone);
    await fill('LinkedIn', /linkedin/, pi.linkedin);
    await fill('GitHub', /github/, pi.github);
    await fill('website', /portfolio|website|personal site/, pi.portfolio || pi.website);
    await fill('current company', /current (company|employer)|^org\b/, this.profileData.workExperience?.[0]?.company);

    return filled;
  }

  /**
   * Clicks the first button/link whose visible text starts with one of the given phrases.
   * Puppeteer has no :has-text() selector, so matching happens in the page.
   */
  protected async clickByText(phrases: string[], scopeSelector = 'body'): Promise<boolean> {
    const handle = await this.page.evaluateHandle((scope: string, wanted: string[]) => {
      const root = document.querySelector(scope) || document.body;
      const candidates = Array.from(
        root.querySelectorAll('button, a, input[type="submit"], [role="button"]')
      ) as HTMLElement[];
      return candidates.find(el => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        const text = ((el as HTMLInputElement).value || el.innerText || el.getAttribute('aria-label') || '')
          .trim()
          .toLowerCase();
        // Never trigger third-party sign-in flows like "Apply with LinkedIn" or "Autofill with MyGreenhouse"
        if (!text || /linkedin|indeed|google|glassdoor|seek|autofill|\bwith\b/.test(text)) return false;
        return wanted.some(w => text === w || text.startsWith(w));
      }) || null;
    }, scopeSelector, phrases.map(p => p.toLowerCase()));

    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) return false;
    await element.evaluate(el => (el as HTMLElement).click());
    return true;
  }

  /**
   * Pages that stop an automated submit and want a person: email verification codes,
   * spam flags, CAPTCHAs. Returns a short description, or null.
   */
  async detectHumanCheck(): Promise<string | null> {
    const text = await this.page.evaluate(() => document.body.innerText).catch(() => '');
    if (/verification code|confirm you'?re a human|security code/i.test(text)) {
      return 'The site sent a verification code to your email and wants it entered to confirm you are a human';
    }
    if (/flagged as (possible )?spam|possible spam/i.test(text)) {
      return 'The site flagged the automated submission as possible spam';
    }
    if (/captcha|i'?m not a robot|verify you are human/i.test(text)) {
      return 'The site asked for a CAPTCHA';
    }
    return null;
  }

  protected async waitForNavigation(timeout = 30000): Promise<void> {
    await this.page.waitForNavigation({
      waitUntil: 'networkidle2',
      timeout
    });
  }

  protected emitProgress(step: number, message: string, level?: LogLevel): void {
    this.onProgress(step, this.totalSteps, message, level);
  }
}
