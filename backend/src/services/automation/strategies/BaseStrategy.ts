import { Page } from 'puppeteer';

export type ProgressCallback = (step: number, total: number, message: string) => void;

/**
 * Base class for all ATS automation strategies
 */
export abstract class BaseATSStrategy {
  protected page: Page;
  protected profileData: any;
  protected onProgress: ProgressCallback;
  protected readonly totalSteps = 15;

  constructor(page: Page, profileData: any, onProgress: ProgressCallback) {
    this.page = page;
    this.profileData = profileData;
    this.onProgress = onProgress;
  }

  /**
   * Execute the full automation workflow
   */
  async execute(resumePath?: string, coverLetterPath?: string): Promise<void> {
    await this.navigateToApplication();
    await this.fillBasicInfo();
    await this.fillWorkExperience();
    await this.fillEducation();

    if (resumePath) {
      await this.uploadResume(resumePath);
    }

    if (coverLetterPath) {
      await this.uploadCoverLetter(coverLetterPath);
    }

    await this.submitApplication();
    await this.verifySubmission();
  }

  /**
   * Navigate to the application form
   */
  protected abstract navigateToApplication(): Promise<void>;

  /**
   * Fill basic personal information
   */
  protected abstract fillBasicInfo(): Promise<void>;

  /**
   * Fill work experience section
   */
  protected abstract fillWorkExperience(): Promise<void>;

  /**
   * Fill education section
   */
  protected abstract fillEducation(): Promise<void>;

  /**
   * Upload resume file
   */
  protected abstract uploadResume(filePath: string): Promise<void>;

  /**
   * Upload cover letter file
   */
  protected abstract uploadCoverLetter(filePath: string): Promise<void>;

  /**
   * Submit the application
   */
  protected abstract submitApplication(): Promise<void>;

  /**
   * Verify that the submission was successful
   */
  protected abstract verifySubmission(): Promise<void>;

  // Utility methods

  protected async waitAndClick(selector: string, timeout = 10000): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
    await this.page.click(selector);
  }

  protected async waitAndType(selector: string, text: string, timeout = 10000): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
    await this.page.type(selector, text, { delay: 50 });
  }

  protected async selectDropdown(selector: string, value: string): Promise<void> {
    await this.page.waitForSelector(selector, { timeout: 10000 });
    await this.page.select(selector, value);
  }

  protected async waitForNavigation(timeout = 30000): Promise<void> {
    await this.page.waitForNavigation({
      waitUntil: 'networkidle2',
      timeout
    });
  }

  protected async takeScreenshot(name: string): Promise<string> {
    const filename = `screenshot-${name}-${Date.now()}.png`;
    await this.page.screenshot({ path: filename, fullPage: true });
    return filename;
  }

  protected emitProgress(step: number, message: string): void {
    this.onProgress(step, this.totalSteps, message);
  }
}
