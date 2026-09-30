import { Page } from 'puppeteer';
import { ATSType } from '../../models/Application.model';
import { logger } from '../../config/logger';

/**
 * ATS platforms with public application forms (no candidate account or login needed).
 * Only these are automated; job boards like LinkedIn, Indeed and Dice require a login
 * and prohibit bots, so jobs there are applied to manually.
 */
const AUTO_APPLY_ATS = new Set<ATSType>([ATSType.GREENHOUSE, ATSType.LEVER, ATSType.ASHBY]);

export function isAutoApplySupported(url: string | undefined): boolean {
  return !!url && AUTO_APPLY_ATS.has(detectATSFromUrl(url));
}

/**
 * ATS whose forms the Chrome extension can fill in the user's own browser. Wider than
 * AUTO_APPLY_ATS: sites that need an account (Workday, iCIMS) work because the user is signed in.
 */
const EXTENSION_ATS = new Set<ATSType>([
  ...AUTO_APPLY_ATS, ATSType.WORKDAY, ATSType.ICIMS, ATSType.SMARTRECRUITERS,
  ATSType.WORKABLE, ATSType.JOBVITE, ATSType.BAMBOOHR
]);

export function isExtensionSupported(url: string | undefined): boolean {
  return !!url && EXTENSION_ATS.has(detectATSFromUrl(url));
}

/**
 * Lever and Ashby show the job description first with the form on a sub-page;
 * returns the URL of the form itself so no "Apply" click is needed.
 */
export function applicationFormUrl(url: string): string {
  const ats = detectATSFromUrl(url);
  const [base, query] = url.split('?');
  const trimmed = base.replace(/\/+$/, '');
  const withQuery = (u: string) => (query ? `${u}?${query}` : u);

  if (ats === ATSType.LEVER && !trimmed.endsWith('/apply')) return withQuery(`${trimmed}/apply`);
  if (ats === ATSType.ASHBY && !trimmed.endsWith('/application')) return withQuery(`${trimmed}/application`);
  return url;
}

/**
 * Detect the ATS platform being used for a job application
 * Uses both URL patterns and DOM fingerprinting
 */
export async function detectATS(page: Page, url: string): Promise<ATSType> {
  logger.info(`🔍 Detecting ATS for URL: ${url}`);

  // Step 1: URL pattern matching (fastest method)
  const atsFromUrl = detectATSFromUrl(url);
  if (atsFromUrl !== ATSType.GENERIC) {
    logger.info(`✓ Detected ${atsFromUrl} from URL pattern`);
    return atsFromUrl;
  }

  // Step 2: DOM fingerprinting (fallback)
  try {
    const html = await page.content();
    const atsFromDom = detectATSFromDOM(html);
    if (atsFromDom !== ATSType.GENERIC) {
      logger.info(`✓ Detected ${atsFromDom} from DOM structure`);
      return atsFromDom;
    }
  } catch (error: any) {
    logger.error(`Error detecting ATS from DOM: ${error.message}`);
  }

  // Step 3: Fallback to generic strategy
  logger.info(`⚠️  Unknown ATS platform, using GENERIC strategy`);
  return ATSType.GENERIC;
}

/**
 * Detect ATS from URL patterns
 */
export function detectATSFromUrl(url: string): ATSType {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return ATSType.GENERIC;
  }
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  if (matches('myworkdayjobs.com') || matches('workday.com')) return ATSType.WORKDAY;
  if (matches('greenhouse.io')) return ATSType.GREENHOUSE;
  if (matches('lever.co')) return ATSType.LEVER;
  if (matches('ashbyhq.com')) return ATSType.ASHBY;
  if (matches('taleo.net')) return ATSType.TALEO;
  if (matches('smartrecruiters.com')) return ATSType.SMARTRECRUITERS;
  if (matches('workable.com')) return ATSType.WORKABLE;
  if (matches('bamboohr.com')) return ATSType.BAMBOOHR;
  if (matches('icims.com')) return ATSType.ICIMS;
  if (matches('jobvite.com')) return ATSType.JOBVITE;

  return ATSType.GENERIC;
}

/**
 * Detect ATS from DOM structure
 */
function detectATSFromDOM(html: string): ATSType {
  const lowerHtml = html.toLowerCase();

  if (lowerHtml.includes('data-automation-id') && (lowerHtml.includes('workday') || lowerHtml.includes('wd-'))) {
    return ATSType.WORKDAY;
  }
  if (lowerHtml.includes('grnhse') || lowerHtml.includes('greenhouse-application') || lowerHtml.includes('boards.greenhouse.io')) {
    return ATSType.GREENHOUSE;
  }
  if (lowerHtml.includes('lever-application') || lowerHtml.includes('jobs.lever.co')) {
    return ATSType.LEVER;
  }
  if (lowerHtml.includes('jobs.ashbyhq.com') || lowerHtml.includes('ashby-application')) {
    return ATSType.ASHBY;
  }
  if (lowerHtml.includes('taleobusinessedition') || lowerHtml.includes('taleo.net')) {
    return ATSType.TALEO;
  }
  if (lowerHtml.includes('icims.com')) {
    return ATSType.ICIMS;
  }
  if (lowerHtml.includes('jobvite.com')) {
    return ATSType.JOBVITE;
  }

  return ATSType.GENERIC;
}
