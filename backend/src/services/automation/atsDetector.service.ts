import { Page } from 'puppeteer';
import { logger } from '../../config/logger';

export type ATSType =
  | 'LINKEDIN_EASY_APPLY'
  | 'WORKDAY'
  | 'GREENHOUSE'
  | 'LEVER'
  | 'TALEO'
  | 'ICIMS'
  | 'JOBVITE'
  | 'GENERIC';

/**
 * Detect the ATS platform being used for a job application
 * Uses both URL patterns and DOM fingerprinting
 */
export async function detectATS(page: Page, url: string): Promise<ATSType> {
  logger.info(`🔍 Detecting ATS for URL: ${url}`);

  // Step 1: URL pattern matching (fastest method)
  const atsFromUrl = detectATSFromUrl(url);
  if (atsFromUrl !== 'GENERIC') {
    logger.info(`✓ Detected ${atsFromUrl} from URL pattern`);
    return atsFromUrl;
  }

  // Step 2: DOM fingerprinting (fallback)
  try {
    const html = await page.content();
    const atsFromDom = detectATSFromDOM(html);
    if (atsFromDom !== 'GENERIC') {
      logger.info(`✓ Detected ${atsFromDom} from DOM structure`);
      return atsFromDom;
    }
  } catch (error: any) {
    logger.error(`Error detecting ATS from DOM: ${error.message}`);
  }

  // Step 3: Fallback to generic strategy
  logger.info(`⚠️  Unknown ATS platform, using GENERIC strategy`);
  return 'GENERIC';
}

/**
 * Detect ATS from URL patterns
 */
function detectATSFromUrl(url: string): ATSType {
  const lowerUrl = url.toLowerCase();

  // LinkedIn Easy Apply (highest priority - most common)
  if (lowerUrl.includes('linkedin.com/jobs')) {
    return 'LINKEDIN_EASY_APPLY';
  }

  if (lowerUrl.includes('myworkdayjobs.com') || lowerUrl.includes('workday.com')) {
    return 'WORKDAY';
  }

  if (lowerUrl.includes('greenhouse.io') || lowerUrl.includes('boards.greenhouse')) {
    return 'GREENHOUSE';
  }

  if (lowerUrl.includes('lever.co') || lowerUrl.includes('jobs.lever')) {
    return 'LEVER';
  }

  if (lowerUrl.includes('taleo.net')) {
    return 'TALEO';
  }

  if (lowerUrl.includes('icims.com')) {
    return 'ICIMS';
  }

  if (lowerUrl.includes('jobvite.com')) {
    return 'JOBVITE';
  }

  return 'GENERIC';
}

/**
 * Detect ATS from DOM structure
 */
function detectATSFromDOM(html: string): ATSType {
  const lowerHtml = html.toLowerCase();

  // LinkedIn Easy Apply signatures
  if (
    lowerHtml.includes('jobs-apply-button') ||
    lowerHtml.includes('jobs-easy-apply') ||
    lowerHtml.includes('linkedin.com/jobs')
  ) {
    return 'LINKEDIN_EASY_APPLY';
  }

  // Workday signatures
  if (
    lowerHtml.includes('data-automation-id') &&
    (lowerHtml.includes('workday') || lowerHtml.includes('wd-'))
  ) {
    return 'WORKDAY';
  }

  // Greenhouse signatures
  if (
    lowerHtml.includes('greenhouse') ||
    lowerHtml.includes('grnhse') ||
    lowerHtml.includes('greenhouse-application')
  ) {
    return 'GREENHOUSE';
  }

  // Lever signatures
  if (
    lowerHtml.includes('lever-application') ||
    lowerHtml.includes('lever-jobs')
  ) {
    return 'LEVER';
  }

  // Taleo signatures
  if (
    lowerHtml.includes('taleo') ||
    lowerHtml.includes('taleobusinessedition')
  ) {
    return 'TALEO';
  }

  // iCIMS signatures
  if (
    lowerHtml.includes('icims') ||
    lowerHtml.includes('talent-management')
  ) {
    return 'ICIMS';
  }

  // Jobvite signatures
  if (lowerHtml.includes('jobvite')) {
    return 'JOBVITE';
  }

  return 'GENERIC';
}
