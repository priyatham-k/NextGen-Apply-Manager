import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../../config/logger';

class BrowserManager {
  private browsers: Browser[] = [];
  private inUse: Map<Browser, boolean> = new Map();
  private readonly maxBrowsers = 3;
  private readonly headless = process.env.PUPPETEER_HEADLESS !== 'false';

  /**
   * Get an available browser instance from the pool
   */
  async getBrowser(): Promise<Browser> {
    // Find an available browser
    for (const browser of this.browsers) {
      if (!this.inUse.get(browser)) {
        this.inUse.set(browser, true);
        logger.info(`♻️  Reusing browser (${this.getActiveCount()}/${this.browsers.length} in use)`);
        return browser;
      }
    }

    // Create new browser if under limit
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await this.launchBrowser();
      this.browsers.push(browser);
      this.inUse.set(browser, true);
      logger.info(`🌐 Launched browser #${this.browsers.length} (${this.getActiveCount()}/${this.maxBrowsers})`);
      return browser;
    }

    // Wait for an available browser
    logger.info('⏳ Waiting for available browser...');
    return this.waitForAvailable();
  }

  /**
   * Release a browser back to the pool
   */
  async releaseBrowser(browser: Browser): Promise<void> {
    this.inUse.set(browser, false);
    logger.info(`✓ Browser released (${this.getActiveCount()}/${this.browsers.length} in use)`);
  }

  /**
   * Launch a new Puppeteer browser instance
   */
  private async launchBrowser(): Promise<Browser> {
    const browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    // Handle browser disconnect
    browser.on('disconnected', () => {
      logger.warn('Browser disconnected');
      this.removeBrowser(browser);
    });

    return browser;
  }

  /**
   * Wait for a browser to become available
   */
  private async waitForAvailable(): Promise<Browser> {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        for (const browser of this.browsers) {
          if (!this.inUse.get(browser)) {
            clearInterval(interval);
            this.inUse.set(browser, true);
            resolve(browser);
            return;
          }
        }
      }, 1000);
    });
  }

  /**
   * Remove a browser from the pool
   */
  private removeBrowser(browser: Browser): void {
    const index = this.browsers.indexOf(browser);
    if (index > -1) {
      this.browsers.splice(index, 1);
      this.inUse.delete(browser);
    }
  }

  /**
   * Get count of browsers currently in use
   */
  private getActiveCount(): number {
    return Array.from(this.inUse.values()).filter(Boolean).length;
  }

  /**
   * Close all browsers and clean up
   */
  async closeAll(): Promise<void> {
    logger.info('Closing all browsers...');
    const closePromises = this.browsers.map(browser =>
      browser.close().catch(err => logger.error(`Error closing browser: ${err.message}`))
    );
    await Promise.all(closePromises);
    this.browsers = [];
    this.inUse.clear();
    logger.info('✅ All browsers closed');
  }

  /**
   * Get browser pool statistics
   */
  getStats() {
    return {
      total: this.browsers.length,
      active: this.getActiveCount(),
      available: this.browsers.length - this.getActiveCount(),
      max: this.maxBrowsers
    };
  }
}

export const browserManager = new BrowserManager();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await browserManager.closeAll();
});

process.on('SIGINT', async () => {
  await browserManager.closeAll();
  process.exit(0);
});
