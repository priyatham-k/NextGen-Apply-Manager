import { BaseATSStrategy } from './BaseStrategy';
import { logger } from '../../../config/logger';

/**
 * Generic fallback strategy for unknown ATS platforms
 * Uses best-effort approach to fill common form fields
 */
export class GenericStrategy extends BaseATSStrategy {
  protected async navigateToApplication(): Promise<void> {
    this.emitProgress(6, 'Looking for application form...');
    logger.info('Using generic strategy - looking for application form');

    // Try to find and click "Apply" buttons
    const applySelectors = [
      'a[href*="apply"]',
      'button:has-text("Apply")',
      '.apply-button',
      '[data-test="apply-button"]'
    ];

    for (const selector of applySelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.click();
          await this.page.waitForTimeout(3000);
          logger.info('✓ Clicked apply button');
          break;
        }
      } catch (error) {
        continue;
      }
    }
  }

  protected async fillBasicInfo(): Promise<void> {
    this.emitProgress(7, 'Auto-filling form fields...');
    logger.info('Auto-filling basic information');

    try {
      // Find all text/email/tel inputs
      const inputs = await this.page.$$('input[type="text"], input[type="email"], input[type="tel"], input:not([type])');

      for (const input of inputs) {
        const name = await input.evaluate((el: any) => el.name || '');
        const placeholder = await input.evaluate((el: any) => el.placeholder || '');
        const id = await input.evaluate((el: any) => el.id || '');

        const combined = (name + ' ' + placeholder + ' ' + id).toLowerCase();

        try {
          if (combined.match(/first.*name|fname/i)) {
            await input.type(this.profileData.personalInfo.firstName, { delay: 50 });
          } else if (combined.match(/last.*name|lname/i)) {
            await input.type(this.profileData.personalInfo.lastName, { delay: 50 });
          } else if (combined.match(/email/i)) {
            await input.type(this.profileData.personalInfo.email, { delay: 50 });
          } else if (combined.match(/phone|mobile|tel/i)) {
            await input.type(this.profileData.personalInfo.phone, { delay: 50 });
          }
        } catch (error) {
          // Skip if field already filled or error occurs
          continue;
        }
      }

      logger.info('✓ Filled basic information (best effort)');
    } catch (error: any) {
      logger.warn(`Error filling basic info: ${error.message}`);
      // Continue anyway
    }
  }

  protected async fillWorkExperience(): Promise<void> {
    this.emitProgress(8, 'Skipping work experience...');
    logger.info('Generic strategy: relying on resume for work experience');
  }

  protected async fillEducation(): Promise<void> {
    this.emitProgress(9, 'Skipping education...');
    logger.info('Generic strategy: relying on resume for education');
  }

  protected async uploadResume(filePath: string): Promise<void> {
    this.emitProgress(10, 'Uploading resume...');
    logger.info('Attempting to upload resume');

    try {
      // Find any file input (priority to resume-related ones)
      const fileInputs = await this.page.$$('input[type="file"]');

      if (fileInputs.length > 0) {
        // Try resume-specific first
        for (const input of fileInputs) {
          const name = await input.evaluate((el: any) => (el.name || el.id || '').toLowerCase());
          if (name.includes('resume') || name.includes('cv')) {
            await input.uploadFile(filePath);
            await this.page.waitForTimeout(2000);
            logger.info('✓ Resume uploaded');
            return;
          }
        }

        // Fall back to first file input
        await fileInputs[0].uploadFile(filePath);
        await this.page.waitForTimeout(2000);
        logger.info('✓ Resume uploaded (generic file input)');
      } else {
        logger.warn('No file input found for resume');
      }
    } catch (error: any) {
      logger.error(`Resume upload failed: ${error.message}`);
      // Continue without resume
    }
  }

  protected async uploadCoverLetter(filePath: string): Promise<void> {
    this.emitProgress(11, 'Skipping cover letter...');
    logger.info('Generic strategy: cover letter not supported');
    // Generic strategy doesn't handle cover letters
  }

  protected async submitApplication(): Promise<void> {
    this.emitProgress(12, 'Looking for submit button...');
    logger.info('Attempting to submit application');

    try {
      // Try various submit button selectors
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Apply")',
        'button:has-text("Send")',
        '[data-test="submit-button"]'
      ];

      for (const selector of submitSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            await this.page.waitForTimeout(5000);
            logger.info('✓ Clicked submit button');
            return;
          }
        } catch (error) {
          continue;
        }
      }

      logger.warn('No submit button found - application may not be submitted');
    } catch (error: any) {
      logger.error(`Submit failed: ${error.message}`);
      throw new Error(`Failed to submit application: ${error.message}`);
    }
  }

  protected async verifySubmission(): Promise<void> {
    this.emitProgress(13, 'Checking for confirmation...');
    logger.info('Checking for submission confirmation');

    try {
      await this.page.waitForTimeout(2000);
      const text = await this.page.evaluate(() => document.body.innerText);
      const lowerText = text.toLowerCase();

      const successIndicators = ['success', 'submitted', 'thank', 'received', 'application sent'];
      const isSuccess = successIndicators.some(indicator => lowerText.includes(indicator));

      if (isSuccess) {
        logger.info('✓ Submission appears successful');
      } else {
        logger.warn('Could not verify submission');
      }
    } catch (error: any) {
      logger.warn(`Verification skipped: ${error.message}`);
    }
  }
}
