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
  async navigateToApplication(): Promise<void> {
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
    await this.page.waitForTimeout(1000);
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
      await this.page.waitForTimeout(1500);

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
   * Auto-fill text inputs on the current step
   */
  async autoFillTextInputs(): Promise<void> {
    const inputs = await this.page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal input[type="email"], .jobs-easy-apply-modal input[type="tel"]');

    for (const input of inputs) {
      try {
        const name = await input.evaluate(el => (el as HTMLInputElement).name || (el as HTMLInputElement).id);
        const placeholder = await input.evaluate(el => (el as HTMLInputElement).placeholder);
        const label = (name + ' ' + placeholder).toLowerCase();

        // Check if already filled
        const value = await input.evaluate(el => (el as HTMLInputElement).value);
        if (value && value.trim().length > 0) {
          continue; // Skip if already has value
        }

        // Fill based on label matching
        if (label.match(/phone|mobile|tel/i)) {
          await input.type(this.profileData.personalInfo?.phone || '');
        } else if (label.match(/email/i)) {
          await input.type(this.profileData.personalInfo?.email || '');
        } else if (label.match(/first.*name/i)) {
          await input.type(this.profileData.personalInfo?.firstName || '');
        } else if (label.match(/last.*name/i)) {
          await input.type(this.profileData.personalInfo?.lastName || '');
        } else if (label.match(/linkedin/i)) {
          await input.type(this.profileData.personalInfo?.linkedin || '');
        } else if (label.match(/github/i)) {
          await input.type(this.profileData.personalInfo?.github || '');
        } else if (label.match(/website|portfolio/i)) {
          await input.type(this.profileData.personalInfo?.portfolio || '');
        }
      } catch (err) {
        // Skip on error
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
        await this.page.waitForTimeout(2000); // Wait for upload
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
        await this.page.waitForTimeout(2000);
      }
    } catch (err: any) {
      logger.warn(`Cover letter upload failed: ${err.message}`);
    }
  }

  /**
   * Handle dropdown/select fields
   */
  async handleDropdowns(): Promise<void> {
    const selects = await this.page.$$('.jobs-easy-apply-modal select');

    for (const select of selects) {
      try {
        const name = await select.evaluate(el => (el as HTMLSelectElement).name || (el as HTMLSelectElement).id);
        const label = name.toLowerCase();

        // Check if already selected
        const value = await select.evaluate(el => (el as HTMLSelectElement).value);
        if (value && value !== '') {
          continue;
        }

        // Select first non-empty option for now
        // TODO: Add intelligent matching based on profile data
        await select.select(await select.evaluate(el => {
          const options = Array.from((el as HTMLSelectElement).options);
          const nonEmpty = options.find(opt => opt.value && opt.value !== '');
          return nonEmpty?.value || '';
        }));
      } catch (err) {
        continue;
      }
    }
  }

  /**
   * Handle radio buttons
   */
  async handleRadioButtons(): Promise<void> {
    const radioGroups = await this.page.$$('.jobs-easy-apply-modal fieldset');

    for (const group of radioGroups) {
      try {
        // For yes/no questions, default to "Yes" for eligibility questions
        const legend = await group.evaluate(el => el.querySelector('legend')?.textContent || '');

        if (legend.match(/authorized.*work|eligible.*work|legally.*work/i)) {
          // Work authorization - select "Yes"
          const yesRadio = await group.$('input[type="radio"][value*="yes" i]');
          if (yesRadio) await yesRadio.click();
        } else if (legend.match(/require.*sponsorship|need.*visa/i)) {
          // Sponsorship - select "No"
          const noRadio = await group.$('input[type="radio"][value*="no" i]');
          if (noRadio) await noRadio.click();
        } else {
          // For other questions, select first option
          const firstRadio = await group.$('input[type="radio"]');
          if (firstRadio) await firstRadio.click();
        }
      } catch (err) {
        continue;
      }
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
  async submitApplication(): Promise<void> {
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
          await this.page.waitForTimeout(3000);
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
  async verifySubmission(): Promise<boolean> {
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
          return true;
        } catch {
          continue;
        }
      }

      // Check if modal closed (also indicates success)
      const modalGone = await this.page.$('.jobs-easy-apply-modal') === null;
      if (modalGone) {
        logger.info('✓ Modal closed - assuming success');
        return true;
      }

      logger.warn('⚠️ Could not verify submission');
      return false;
    } catch (err: any) {
      logger.error(`Verification error: ${err.message}`);
      return false;
    }
  }

  // Inherited methods from BaseATSStrategy (not used for LinkedIn)
  async navigateToApplication(): Promise<void> {
    // Already implemented above
  }

  async fillBasicInfo(): Promise<void> {
    // Handled in fillCurrentStep
  }

  async fillWorkExperience(): Promise<void> {
    // Handled in fillCurrentStep
  }

  async fillEducation(): Promise<void> {
    // Handled in fillCurrentStep
  }

  async uploadResume(filePath: string): Promise<void> {
    // Handled in fillCurrentStep
  }

  async uploadCoverLetter(filePath?: string): Promise<void> {
    // Handled in fillCurrentStep
  }
}
