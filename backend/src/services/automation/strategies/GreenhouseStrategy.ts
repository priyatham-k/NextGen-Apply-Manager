import { BaseATSStrategy } from './BaseStrategy';
import { logger } from '../../../config/logger';

/**
 * Automation strategy for Greenhouse ATS
 */
export class GreenhouseStrategy extends BaseATSStrategy {
  protected async navigateToApplication(): Promise<void> {
    this.emitProgress(6, 'Navigating to Greenhouse application form...');
    logger.info('Starting Greenhouse application');

    // Greenhouse usually has direct application forms or an "Apply" button
    try {
      const applyButton = await this.page.$('a.app-link, button.app-link, a[href*="apply"]');
      if (applyButton) {
        await applyButton.click();
        await this.waitForNavigation();
      }
    } catch (error) {
      // Already on application form
      logger.info('Already on application form');
    }
  }

  protected async fillBasicInfo(): Promise<void> {
    this.emitProgress(7, 'Filling basic information...');
    logger.info('Filling basic information');

    try {
      // First Name
      const firstNameSelector = 'input#first_name, input[name="first_name"], input[name="firstName"]';
      const firstName = await this.page.$(firstNameSelector);
      if (firstName) {
        await firstName.type(this.profileData.personalInfo.firstName, { delay: 50 });
      }

      // Last Name
      const lastNameSelector = 'input#last_name, input[name="last_name"], input[name="lastName"]';
      const lastName = await this.page.$(lastNameSelector);
      if (lastName) {
        await lastName.type(this.profileData.personalInfo.lastName, { delay: 50 });
      }

      // Email
      const emailSelector = 'input#email, input[name="email"], input[type="email"]';
      const email = await this.page.$(emailSelector);
      if (email) {
        await email.type(this.profileData.personalInfo.email, { delay: 50 });
      }

      // Phone
      const phoneSelector = 'input#phone, input[name="phone"], input[type="tel"]';
      const phone = await this.page.$(phoneSelector);
      if (phone) {
        await phone.type(this.profileData.personalInfo.phone, { delay: 50 });
      }

      logger.info('✓ Filled basic information');
    } catch (error: any) {
      logger.error(`Error filling basic info: ${error.message}`);
      throw new Error(`Failed to fill basic information: ${error.message}`);
    }
  }

  protected async fillWorkExperience(): Promise<void> {
    this.emitProgress(8, 'Work experience handled via resume...');
    // Greenhouse typically relies on resume upload for experience
    logger.info('Skipping work experience (handled via resume)');
  }

  protected async fillEducation(): Promise<void> {
    this.emitProgress(9, 'Education handled via resume...');
    // Greenhouse typically relies on resume upload for education
    logger.info('Skipping education (handled via resume)');
  }

  protected async uploadResume(filePath: string): Promise<void> {
    this.emitProgress(10, 'Uploading resume...');
    logger.info(`Uploading resume: ${filePath}`);

    try {
      // Look for file input for resume
      const fileInput = await this.page.$('input[type="file"][name*="resume"], input[type="file"][id*="resume"]');

      if (fileInput) {
        await fileInput.uploadFile(filePath);
        // Wait for upload to complete
        await this.page.waitForTimeout(3000);
        logger.info('✓ Resume uploaded');
      } else {
        logger.warn('Resume upload field not found');
      }
    } catch (error: any) {
      logger.error(`Error uploading resume: ${error.message}`);
      // Continue anyway - resume upload is optional
    }
  }

  protected async uploadCoverLetter(filePath: string): Promise<void> {
    this.emitProgress(11, 'Checking for cover letter field...');
    logger.info(`Uploading cover letter: ${filePath}`);

    try {
      const clInput = await this.page.$('input[type="file"][name*="cover"], input[type="file"][id*="cover"]');

      if (clInput) {
        await clInput.uploadFile(filePath);
        await this.page.waitForTimeout(2000);
        logger.info('✓ Cover letter uploaded');
      } else {
        logger.info('Cover letter field not found (optional)');
      }
    } catch (error: any) {
      logger.warn(`Cover letter upload skipped: ${error.message}`);
      // Cover letter is optional
    }
  }

  protected async submitApplication(): Promise<void> {
    this.emitProgress(12, 'Submitting application...');
    logger.info('Submitting application');

    try {
      // Look for submit button
      const submitButton = await this.page.$('button[type="submit"], input[type="submit"], button#submit_app');

      if (submitButton) {
        await submitButton.click();
        // Wait for submission to complete
        await this.page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 30000
        }).catch(() => {
          // Navigation might not occur on some forms
          logger.info('No navigation after submit');
        });

        logger.info('✓ Application submitted');
      } else {
        throw new Error('Submit button not found');
      }
    } catch (error: any) {
      logger.error(`Error submitting application: ${error.message}`);
      throw new Error(`Failed to submit application: ${error.message}`);
    }
  }

  protected async verifySubmission(): Promise<void> {
    this.emitProgress(13, 'Verifying submission...');
    logger.info('Verifying submission');

    try {
      // Wait a moment for confirmation
      await this.page.waitForTimeout(2000);

      // Check for success message
      const bodyText = await this.page.evaluate(() => document.body.innerText);
      const lowerText = bodyText.toLowerCase();

      const successIndicators = [
        'application submitted',
        'thank you',
        'successfully submitted',
        'we received your application',
        'application received'
      ];

      const isSuccess = successIndicators.some(indicator =>
        lowerText.includes(indicator)
      );

      if (isSuccess) {
        logger.info('✓ Submission verified successfully');
      } else {
        logger.warn('Could not verify submission - no success message found');
        // Don't throw error - submission might have succeeded anyway
      }
    } catch (error: any) {
      logger.warn(`Verification failed: ${error.message}`);
      // Don't throw - verification is best-effort
    }
  }
}
