import { BaseATSStrategy } from './BaseStrategy';
import { logger } from '../../../config/logger';
import { answerFormQuestions } from '../formQuestions.service';

// Marks the form being filled so submit clicks stay inside it
const FORM_MARKER = 'data-autoapply-form';

/**
 * Fills public ATS application forms (Greenhouse, Lever, Ashby).
 * These share the same shape: an optional "Apply" button that reveals the form,
 * labelled contact fields, a resume file input and a submit button inside the form.
 */
export class ApplicationFormStrategy extends BaseATSStrategy {
  protected async navigateToApplication(): Promise<void> {
    this.emitProgress(6, 'Opening application form...');

    // Single-page apps (e.g. Ashby) render the form after the page has finished loading
    if (await this.waitForEmailField(10000)) return;

    // Some pages show the job description first, with the form behind an "Apply" button
    const clicked = await this.clickByText(['apply for this job', 'apply for this position', 'apply now', 'apply']);
    if (!clicked || !(await this.waitForEmailField(15000))) {
      throw new Error('Application form not found on this page. Please apply manually.');
    }
    logger.info('✓ Application form is open');
  }

  protected async fillBasicInfo(): Promise<void> {
    this.emitProgress(7, 'Filling your details...');

    const filled = await this.fillCommonFields();
    logger.info(`✓ Filled fields: ${filled.join(', ') || 'none'}`);
    this.emitProgress(7, `Filled: ${filled.join(', ') || 'no standard fields found'}`, filled.length ? 'success' : 'warn');

    if (!filled.includes('email')) {
      throw new Error('Could not find the email field on the application form');
    }

    // Remember which form was filled so submit only clicks buttons inside it
    await (await this.findEmailField())?.evaluate((el: Element, marker: string) => {
      el.closest('form')?.setAttribute(marker, 'true');
    }, FORM_MARKER);
  }

  /** An application form is on the page once it has an email field (found by its label, not its type) */
  private findEmailField() {
    return this.findFieldByLabel(/e-?mail/);
  }

  private async waitForEmailField(timeoutMs: number): Promise<boolean> {
    for (let waited = 0; waited <= timeoutMs; waited += 1000) {
      if (await this.findEmailField()) return true;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
  }

  protected async uploadResume(filePath: string): Promise<void> {
    this.emitProgress(10, 'Uploading resume...');

    // Prefer the real resume field over "Autofill from resume" boxes, which would overwrite filled fields
    const input = await this.page.$('input[type="file"][name*="resume" i], input[type="file"][id*="resume" i]')
      || await this.findFieldByLabel(/resume|\bcv\b/, true)
      || await this.page.$('input[type="file"]');
    if (!input) {
      logger.warn('Resume upload field not found');
      this.emitProgress(10, 'Resume upload field not found on the form', 'warn');
      return;
    }

    await (input as any).uploadFile(filePath);
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info('✓ Resume uploaded');
    this.emitProgress(10, 'Resume uploaded', 'success');
  }

  protected async uploadCoverLetter(filePath: string): Promise<void> {
    this.emitProgress(11, 'Uploading cover letter...');

    const input = await this.findFieldByLabel(/cover.?letter/, true);
    if (!input) {
      logger.info('No cover letter upload field (optional)');
      return;
    }

    await (input as any).uploadFile(filePath);
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info('✓ Cover letter uploaded');
  }

  protected async answerCustomQuestions(): Promise<void> {
    this.emitProgress(11, 'Answering application questions...');
    const scope = (await this.page.$(`form[${FORM_MARKER}]`)) ? `form[${FORM_MARKER}]` : 'body';
    const result = await answerFormQuestions(this.page, scope, this.profileData, this.jobContext);
    this.unansweredRequired = result.unansweredRequired;
    this.emitProgress(11, result.answered.length
      ? `Answered ${result.answered.length} question(s): ${result.answered.map(q => q.replace(/\s*\*$/, '').slice(0, 60)).join(' | ')}`
      : 'No extra questions to answer', 'success');
    if (result.unansweredRequired.length) {
      this.emitProgress(11, `Required questions left empty (profile has no answer): ${result.unansweredRequired.map(q => q.slice(0, 80)).join(' | ')}`, 'warn');
    }
  }

  protected async submitApplication(): Promise<void> {
    this.emitProgress(12, 'Submitting application...');

    const scope = `form[${FORM_MARKER}]`;
    const scopeExists = await this.page.$(scope);
    const clicked = await this.clickByText(['submit application', 'submit', 'send application', 'apply'], scopeExists ? scope : 'body')
      || await this.clickSubmitButtonIn(scope);

    if (!clicked) {
      throw new Error('Submit button not found on the application form');
    }

    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      .catch(() => logger.info('No navigation after submit (single-page form)'));
  }

  private async clickSubmitButtonIn(scope: string): Promise<boolean> {
    const button = await this.page.$(`${scope} button[type="submit"], ${scope} input[type="submit"]`);
    if (!button) return false;
    await button.click();
    return true;
  }
}
