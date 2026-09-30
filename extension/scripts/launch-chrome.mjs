// Opens a Chrome window with the NextGen Apply extension installed, using its own profile.
// Google Chrome no longer accepts --load-extension, so this uses the "Chrome for Testing" build that
// Puppeteer downloads for the backend. It is launched as a normal browser (no automation flags),
// and the profile keeps logins, cookies and the extension's connection between launches.
//
//   npm run chrome                      → opens the app's Apply Queue page
//   npm run chrome -- <url> [<url>...]  → opens the given pages (e.g. a queue job's form)
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '..', 'dist');
if (!existsSync(path.join(extensionDir, 'manifest.json'))) {
  console.error('Build the extension first: npm run build');
  process.exit(1);
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  // Reuse the Chrome for Testing that the backend's Puppeteer installed
  const backendRequire = createRequire(path.resolve(here, '..', '..', 'backend', 'package.json'));
  return backendRequire('puppeteer').executablePath();
}

const profileDir = process.env.NEXTGEN_CHROME_PROFILE
  || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'NextGenApply', 'chrome-profile');
mkdirSync(profileDir, { recursive: true });

const urls = process.argv.slice(2);
const args = [
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  ...(urls.length ? urls : ['http://localhost:4200/apply-queue'])
];

const executable = chromePath();
const child = spawn(executable, args, { detached: true, stdio: 'ignore' });
child.unref();
console.log(`Opened Chrome with NextGen Apply (profile: ${profileDir})`);
