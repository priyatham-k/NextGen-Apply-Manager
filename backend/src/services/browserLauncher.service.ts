import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer';
import { logger } from '../config/logger';

/**
 * Opens the "NextGen Chrome" window (the extension installed, its own profile) on the machine the
 * backend runs on — the same thing `npm run chrome` in extension/ does, so the web app can start it.
 * Google Chrome ignores --load-extension, so this uses Puppeteer's Chrome for Testing build,
 * launched as a normal browser (no automation flags). If it is already open, Chrome opens the
 * URLs as new tabs in that window.
 */

const EXTENSION_DIR = path.resolve(__dirname, '..', '..', '..', 'extension', 'dist');

// Only when the backend runs on the user's own computer; set to false on a server
const launchAllowed = () => process.env.ALLOW_BROWSER_LAUNCH !== 'false';

function profileDir(): string {
  return process.env.NEXTGEN_CHROME_PROFILE
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'NextGenApply', 'chrome-profile');
}

export function browserLaunchStatus(): { available: boolean; reason?: string } {
  if (!launchAllowed()) return { available: false, reason: 'Opening a browser from the app is turned off (ALLOW_BROWSER_LAUNCH=false)' };
  if (!existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
    return { available: false, reason: 'Build the extension first: cd extension && npm install && npm run build' };
  }
  return { available: true };
}

export function launchNextGenChrome(urls: string[]): void {
  const status = browserLaunchStatus();
  if (!status.available) throw new Error(status.reason);

  const executable = process.env.CHROME_PATH || puppeteer.executablePath();
  const dir = profileDir();
  mkdirSync(dir, { recursive: true });

  const child = spawn(executable, [
    `--user-data-dir=${dir}`,
    `--load-extension=${EXTENSION_DIR}`,
    `--disable-extensions-except=${EXTENSION_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...urls
  ], { detached: true, stdio: 'ignore' });
  child.on('error', error => logger.error(`Could not open NextGen Chrome: ${error.message}`));
  child.unref();
  logger.info(`Opened NextGen Chrome with ${urls.length} page(s)`);
}
