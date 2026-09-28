import { Page } from 'puppeteer';
import { BaseATSStrategy, ProgressCallback } from './BaseStrategy';
import { logger } from '../../../config/logger';

export class LinkedInEasyApplyStrategy extends BaseATSStrategy {
  constructor(page: Page, profileData: any, onProgress: ProgressCallback) {
    super(page, profileData, onProgress);
  }

  /**
   * Execute the full Easy Apply workflow
   */
  async execute(resumePath?: string, coverLetterPath?: string): Promise<void> {
    await this.navigateToApplication();
    await this.handleMultiStepForm(resumePath, coverLetterPath);
    await this.submitApplication();
    await this.verifySubmission();
  }

  /**
   * Click the "Easy Apply" button to open the modal
   */
  protected async navigateToApplication(): Promise<void> {
    this.onProgress(6, 15, 'Looking for Easy Apply button...');
    logger.info('Looking for LinkedIn Easy Apply button');

    // Common selectors for Easy Apply button
    const easyApplySelectors = [
      'button.jobs-apply-button',
      'button[aria-label*="Easy Apply"]',
      'button:has-text("Easy Apply")',
      '.jobs-apply-button--top-card button',
      'button.jobs-s-apply button'
    ];

    let clicked = false;
    for (const selector of easyApplySelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          logger.info('✓ Clicked Easy Apply button');

          // Wait for the modal to appear
          await this.page.waitForSelector('.jobs-easy-apply-modal', { timeout: 5000 });
          clicked = true;
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!clicked) {
      throw new Error('Could not find Easy Apply button');
    }

    // Wait a bit for modal animations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Handle the multi-step form in the Easy Apply modal
   */
  async handleMultiStepForm(resumePath?: string, coverLetterPath?: string): Promise<void> {
    let currentStep = 1;
    const maxSteps = 10; // Safety limit

    while (currentStep <= maxSteps) {
      this.onProgress(6 + currentStep, 15, `Step ${currentStep}: Filling form...`);
      logger.info(`LinkedIn Easy Apply - Step ${currentStep}`);

      // Fill the current step
      await this.fillCurrentStep(resumePath, coverLetterPath);

      // Check if there's a "Next" button
      const nextButton = await this.findNextButton();

      if (!nextButton) {
        // No next button means we're on the final step (Review)
        logger.info('Reached final step (Review)');
        break;
      }

      // Click Next
      await nextButton.click();
      logger.info('✓ Clicked Next button');

      // Wait for next step to load
      await new Promise(resolve => setTimeout(resolve, 1500));

      currentStep++;
    }

    if (currentStep > maxSteps) {
      logger.warn('Exceeded maximum steps in Easy Apply form');
    }
  }

  /**
   * Fill out the current step of the form
   */
  async fillCurrentStep(resumePath?: string, coverLetterPath?: string): Promise<void> {
    // Auto-fill text inputs
    await this.autoFillTextInputs();

    // Handle resume upload if available
    if (resumePath) {
      await this.uploadResumeIfPresent(resumePath);
    }

    // Handle cover letter upload if available
    if (coverLetterPath) {
      await this.uploadCoverLetterIfPresent(coverLetterPath);
    }

    // Handle dropdowns/selects
    await this.handleDropdowns();

    // Handle radio buttons
    await this.handleRadioButtons();

    // Handle checkboxes
    await this.handleCheckboxes();
  }

  /**
   * Get the visible label text for a form field
   */
  private async getFieldLabel(element: any): Promise<string> {
    return element.evaluate((el: HTMLElement) => {
      const name = (el as HTMLInputElement).name || (el as HTMLInputElement).id || '';
      const placeholder = (el as HTMLInputElement).placeholder || '';
      const id = el.id;
      const labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
      const labelText = labelEl?.textContent || '';
      const parentLabel = el.closest('label')?.textContent || '';
      const legend = el.closest('fieldset')?.querySelector('legend')?.textContent || '';
      return `${name} ${placeholder} ${labelText} ${parentLabel} ${legend}`.toLowerCase();
    });
  }

  /**
   * Auto-fill text inputs on the current step using profile data
   */
  async autoFillTextInputs(): Promise<void> {
    const inputs = await this.page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal input[type="email"], .jobs-easy-apply-modal input[type="tel"], .jobs-easy-apply-modal input[type="number"], .jobs-easy-apply-modal textarea');
    const screening = this.profileData.screeningQuestions || {};
    const personalInfo = this.profileData.personalInfo || {};
    const professionalSummary = this.profileData.professionalSummary || {};

    for (const input of inputs) {
      try {
        const value = await input.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => el.value);
        if (value && (value as string).trim().length > 0) continue;

        const label = await this.getFieldLabel(input);
        let fillValue = '';

        // Personal info
        if (label.match(/phone|mobile|tel/i)) {
          fillValue = personalInfo.phone || '';
        } else if (label.match(/email/i)) {
          fillValue = personalInfo.email || '';
        } else if (label.match(/first.*name/i)) {
          fillValue = personalInfo.firstName || '';
        } else if (label.match(/last.*name/i)) {
          fillValue = personalInfo.lastName || '';
        } else if (label.match(/full.*name|name.*full/i)) {
          fillValue = `${personalInfo.firstName || ''} ${personalInfo.lastName || ''}`.trim();
        } else if (label.match(/linkedin/i)) {
          fillValue = personalInfo.linkedin || '';
        } else if (label.match(/github/i)) {
          fillValue = personalInfo.github || '';
        } else if (label.match(/website|portfolio/i)) {
          fillValue = personalInfo.portfolio || personalInfo.website || '';
        } else if (label.match(/city/i)) {
          fillValue = personalInfo.address?.city || '';
        } else if (label.match(/state|province/i)) {
          fillValue = personalInfo.address?.state || '';
        } else if (label.match(/zip|postal/i)) {
          fillValue = personalInfo.address?.zipCode || '';

        // Screening: years of experience
        } else if (label.match(/years?\s*(of)?\s*experience/i)) {
          fillValue = String(professionalSummary.yearsOfExperience || 0);

        // Screening: salary
        } else if (label.match(/salary|compensation|pay.*expect/i)) {
          if (screening.desiredSalary?.min) {
            fillValue = String(screening.desiredSalary.min);
          }

        // Screening: notice period / start date
        } else if (label.match(/notice.*period|start.*date|earliest.*start|when.*start|availability/i)) {
          const noticePeriodMap: Record<string, string> = {
            'immediate': 'Immediately',
            '2_weeks': '2 weeks',
            '1_month': '1 month',
            '2_months': '2 months',
            '3_months': '3 months'
          };
          fillValue = noticePeriodMap[screening.noticePeriod] || '2 weeks';

        // Screening: cover letter / summary
        } else if (label.match(/cover.*letter|additional.*info/i)) {
          fillValue = professionalSummary.summary || '';

        // Screening: GPA
        } else if (label.match(/gpa|grade.*point/i)) {
          const education = this.profileData.education;
          if (education?.length > 0 && education[0].gpa) {
            fillValue = String(education[0].gpa);
          }
        }

        if (fillValue) {
          await input.click({ clickCount: 3 });
          await input.type(fillValue);
          logger.info(`✓ Filled: "${label.substring(0, 40).trim()}" → ${fillValue.substring(0, 30)}`);
        }
      } catch (err) {
        continue;
      }
    }
  }

  /**
   * Upload resume if file input is present
   */
  async uploadResumeIfPresent(resumePath: string): Promise<void> {
    try {
      const fileInput = await this.page.$('.jobs-easy-apply-modal input[type="file"][name*="resume"], .jobs-easy-apply-modal input[type="file"][id*="resume"]');

      if (fileInput) {
        await fileInput.uploadFile(resumePath);
        logger.info('✓ Resume uploaded');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for upload
      }
    } catch (err: any) {
      logger.warn(`Resume upload failed: ${err.message}`);
    }
  }

  /**
   * Upload cover letter if file input is present
   */
  async uploadCoverLetterIfPresent(coverLetterPath: string): Promise<void> {
    try {
      const fileInput = await this.page.$('.jobs-easy-apply-modal input[type="file"][name*="cover"], .jobs-easy-apply-modal input[type="file"][id*="cover"]');

      if (fileInput) {
        await fileInput.uploadFile(coverLetterPath);
        logger.info('✓ Cover letter uploaded');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err: any) {
      logger.warn(`Cover letter upload failed: ${err.message}`);
    }
  }

  /**
   * Handle dropdown/select fields with intelligent profile matching
   */
  async handleDropdowns(): Promise<void> {
    const selects = await this.page.$$('.jobs-easy-apply-modal select');
    const screening = this.profileData.screeningQuestions || {};
    const professionalSummary = this.profileData.professionalSummary || {};

    for (const select of selects) {
      try {
        const value = await select.evaluate((el: HTMLSelectElement) => el.value);
        if (value && value !== '') continue;

        const label = await this.getFieldLabel(select);
        const options = await select.evaluate((el: HTMLSelectElement) =>
          Array.from(el.options).map(o => ({ value: o.value, text: o.textContent?.toLowerCase() || '' }))
        );

        let bestValue = '';

        // Years of experience dropdown
        if (label.match(/years?\s*(of)?\s*experience/i)) {
          const years = professionalSummary.yearsOfExperience || 0;
          bestValue = this.findClosestOption(options, years);

        // Education level
        } else if (label.match(/education|degree|highest.*level/i)) {
          const education = this.profileData.education;
          if (education?.length > 0) {
            const degree = education[0].degree?.toLowerCase() || '';
            bestValue = this.findOptionByKeywords(options, [degree, 'bachelor', 'master', 'phd', 'associate']);
          }

        // Work authorization status
        } else if (label.match(/authorized|authorization|work.*permit|eligible/i)) {
          const authMap: Record<string, string[]> = {
            'us_citizen': ['citizen', 'authorized', 'yes'],
            'permanent_resident': ['permanent', 'green card', 'authorized', 'yes'],
            'work_visa': ['visa', 'authorized', 'yes'],
            'require_sponsorship': ['sponsorship', 'no'],
            'not_authorized': ['not authorized', 'no']
          };
          const keywords = authMap[screening.workAuthorization] || ['yes'];
          bestValue = this.findOptionByKeywords(options, keywords);

        // Remote/onsite preference
        } else if (label.match(/remote|work.*location|work.*arrangement|onsite|hybrid/i)) {
          const prefMap: Record<string, string[]> = {
            'remote_only': ['remote', 'work from home'],
            'hybrid': ['hybrid'],
            'onsite': ['onsite', 'on-site', 'office'],
            'flexible': ['flexible', 'any', 'hybrid']
          };
          const keywords = prefMap[screening.remoteWorkPreference] || ['flexible'];
          bestValue = this.findOptionByKeywords(options, keywords);

        // Language proficiency
        } else if (label.match(/language.*proficiency|english.*level/i)) {
          bestValue = this.findOptionByKeywords(options, ['fluent', 'native', 'professional', 'advanced']);
        }

        // Fallback: select first non-empty option
        if (!bestValue) {
          const nonEmpty = options.find(o => o.value && o.value !== '');
          bestValue = nonEmpty?.value || '';
        }

        if (bestValue) {
          await select.select(bestValue);
          logger.info(`✓ Selected dropdown: "${label.substring(0, 40).trim()}" → ${bestValue}`);
        }
      } catch (err) {
        continue;
      }
    }
  }

  /**
   * Find dropdown option closest to a numeric value
   */
  private findClosestOption(options: { value: string; text: string }[], target: number): string {
    let bestMatch = '';
    let bestDiff = Infinity;
    for (const opt of options) {
      if (!opt.value) continue;
      const num = parseInt(opt.text.replace(/\D/g, ''), 10);
      if (!isNaN(num)) {
        const diff = Math.abs(num - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = opt.value;
        }
      }
    }
    return bestMatch;
  }

  /**
   * Find dropdown option matching keywords
   */
  private findOptionByKeywords(options: { value: string; text: string }[], keywords: string[]): string {
    for (const keyword of keywords) {
      const match = options.find(o => o.value && o.text.includes(keyword.toLowerCase()));
      if (match) return match.value;
    }
    return '';
  }

  /**
   * Handle radio buttons with profile-aware answers
   */
  async handleRadioButtons(): Promise<void> {
    const radioGroups = await this.page.$$('.jobs-easy-apply-modal fieldset');
    const screening = this.profileData.screeningQuestions || {};

    for (const group of radioGroups) {
      try {
        const legend = await group.evaluate(el => el.querySelector('legend')?.textContent || '');
        const legendLower = legend.toLowerCase();

        // Work authorization
        if (legendLower.match(/authorized.*work|eligible.*work|legally.*work/i)) {
          const isAuthorized = ['us_citizen', 'permanent_resident', 'work_visa'].includes(screening.workAuthorization);
          const target = isAuthorized ? 'yes' : 'no';
          await this.clickRadioByValue(group, target);

        // Sponsorship
        } else if (legendLower.match(/require.*sponsorship|need.*visa|sponsor/i)) {
          const needsSponsorship = screening.requiresSponsorship === true;
          const target = needsSponsorship ? 'yes' : 'no';
          await this.clickRadioByValue(group, target);

        // Relocation
        } else if (legendLower.match(/willing.*relocate|relocation|relocate/i)) {
          const willingToRelocate = screening.willingToRelocate === true;
          const target = willingToRelocate ? 'yes' : 'no';
          await this.clickRadioByValue(group, target);

        // Background check
        } else if (legendLower.match(/background.*check|criminal|conviction/i)) {
          const willing = screening.willingToUndergoBackgroundCheck !== false;
          const target = willing ? 'yes' : 'no';
          await this.clickRadioByValue(group, target);

        // Drug test
        } else if (legendLower.match(/drug.*test|drug.*screen/i)) {
          const willing = screening.willingToTakeDrugTest !== false;
          const target = willing ? 'yes' : 'no';
          await this.clickRadioByValue(group, target);

        // Non-compete
        } else if (legendLower.match(/non.?compete|restrictive.*covenant/i)) {
          const has = screening.hasNonCompeteAgreement === true;
          const target = has ? 'yes' : 'no';
          await this.clickRadioByValue(group, target);

        // Default: select first option
        } else {
          const firstRadio = await group.$('input[type="radio"]');
          if (firstRadio) await firstRadio.click();
        }

        logger.info(`✓ Radio group: "${legend.substring(0, 50).trim()}"`);
      } catch (err) {
        continue;
      }
    }
  }

  /**
   * Click a radio button by matching its value or label text
   */
  private async clickRadioByValue(group: any, target: string): Promise<void> {
    // Try matching by value attribute
    const byValue = await group.$(`input[type="radio"][value*="${target}" i]`);
    if (byValue) {
      await byValue.click();
      return;
    }

    // Try matching by label text
    const radios = await group.$$('input[type="radio"]');
    for (const radio of radios) {
      const labelText = await radio.evaluate((el: HTMLInputElement) => {
        const label = el.labels?.[0]?.textContent || '';
        return label.toLowerCase();
      });
      if (labelText.includes(target)) {
        await radio.click();
        return;
      }
    }

    // Fallback: click first radio
    if (radios.length > 0) {
      await radios[0].click();
    }
  }

  /**
   * Handle checkboxes (terms, agreements, etc.)
   */
  async handleCheckboxes(): Promise<void> {
    const checkboxes = await this.page.$$('.jobs-easy-apply-modal input[type="checkbox"]');

    for (const checkbox of checkboxes) {
      try {
        const label = await checkbox.evaluate(el => {
          const labelEl = el.labels?.[0];
          return labelEl?.textContent || '';
        });

        // Auto-check terms/agreements/consent checkboxes
        if (label.match(/agree|terms|privacy|consent|understand/i)) {
          const isChecked = await checkbox.evaluate(el => (el as HTMLInputElement).checked);
          if (!isChecked) {
            await checkbox.click();
            logger.info(`✓ Checked: ${label.substring(0, 50)}...`);
          }
        }
      } catch (err) {
        continue;
      }
    }
  }

  /**
   * Find the Next/Continue/Submit button
   */
  async findNextButton(): Promise<any> {
    const buttonSelectors = [
      'button[aria-label="Continue to next step"]',
      'button[aria-label="Review your application"]',
      'button:has-text("Next")',
      'button:has-text("Continue")',
      '.jobs-easy-apply-modal footer button[type="button"]:not([aria-label*="Dismiss"])',
    ];

    for (const selector of buttonSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          const isDisabled = await button.evaluate(el => (el as HTMLButtonElement).disabled);
          if (!isDisabled) {
            return button;
          }
        }
      } catch (err) {
        continue;
      }
    }

    return null;
  }

  /**
   * Submit the application on the final review step
   */
  protected async submitApplication(): Promise<void> {
    this.onProgress(12, 15, 'Submitting application...');
    logger.info('Submitting LinkedIn Easy Apply application');

    const submitSelectors = [
      'button[aria-label="Submit application"]',
      'button:has-text("Submit application")',
      'button:has-text("Submit")',
      '.jobs-easy-apply-modal footer button.artdeco-button--primary'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          logger.info('✓ Clicked Submit button');
          submitted = true;

          // Wait for submission to process
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!submitted) {
      throw new Error('Could not find Submit button');
    }
  }

  /**
   * Verify the application was submitted successfully
   */
  protected async verifySubmission(): Promise<void> {
    this.onProgress(13, 15, 'Verifying submission...');
    logger.info('Verifying LinkedIn Easy Apply submission');

    try {
      // Look for success message or confirmation modal
      const successSelectors = [
        'h3:has-text("Application sent")',
        'h2:has-text("Your application was sent")',
        '.artdeco-modal__header:has-text("Application sent")',
        '[data-test-modal-id="application-sent-confirmation"]'
      ];

      for (const selector of successSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          logger.info('✓ Application submission confirmed');
          return;
        } catch {
          continue;
        }
      }

      // Check if modal closed (also indicates success)
      const modalGone = await this.page.$('.jobs-easy-apply-modal') === null;
      if (modalGone) {
        logger.info('✓ Modal closed - assuming success');
        return;
      }

      logger.warn('⚠️ Could not verify submission');
    } catch (err: any) {
      logger.error(`Verification error: ${err.message}`);
    }
  }

  // Required implementations of abstract base class methods
  protected async fillBasicInfo(): Promise<void> {
    // Handled in fillCurrentStep via handleMultiStepForm
  }

  protected async fillWorkExperience(): Promise<void> {
    // Handled in fillCurrentStep via handleMultiStepForm
  }

  protected async fillEducation(): Promise<void> {
    // Handled in fillCurrentStep via handleMultiStepForm
  }

  protected async uploadResume(_filePath: string): Promise<void> {
    // Handled in uploadResumeIfPresent via fillCurrentStep
  }

  protected async uploadCoverLetter(_filePath: string): Promise<void> {
    // Handled in uploadCoverLetterIfPresent via fillCurrentStep
  }
}
