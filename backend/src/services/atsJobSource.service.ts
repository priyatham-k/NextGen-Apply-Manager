import axios from 'axios';
import { IJob, JobType, ExperienceLevel } from '../models/Job.model';
import { logger } from '../config/logger';

/**
 * Jobs straight from company boards on Greenhouse, Lever and Ashby. Unlike job-board
 * listings, every one of these is a public application form that Auto Apply can fill.
 * The public board APIs are free and need no key.
 */

type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

// Companies with active US engineering hiring on each ATS (verified against the board APIs).
// Override with GREENHOUSE_COMPANIES / LEVER_COMPANIES / ASHBY_COMPANIES (comma-separated slugs).
const DEFAULT_COMPANIES: Record<AtsProvider, string[]> = {
  greenhouse: [
    'affirm', 'databricks', 'coinbase', 'grafanalabs', 'stripe', 'reddit', 'doordashusa', 'gitlab',
    'robinhood', 'brex', 'gusto', 'samsara', 'discord', 'datadog', 'vercel', 'toast', 'figma',
    'twilio', 'pinterest', 'mongodb', 'airbnb', 'instacart', 'okta', 'elastic', 'lyft'
  ],
  lever: ['palantir', 'spotify'],
  ashby: ['openai', 'cursor', 'ramp', 'vanta', 'replit', 'notion', 'supabase', 'linear']
};

// Titles worth applying to for a developer profile; override with ATS_TITLE_PATTERN
const DEFAULT_TITLE_PATTERN = 'software engineer|software developer|full.?stack|front.?end|back.?end|web (engineer|developer)|node|react|javascript|typescript';
// Leadership and non-IC roles a developer auto-apply should skip
const EXCLUDED_TITLES = /\b(manager|director|head of|vp|vice president|principal|distinguished|intern(ship)?|recruit)/i;

const MAX_AGE_DAYS = 60;
// Greenhouse needs one request per job for the description, so cap jobs taken per company
const MAX_JOBS_PER_COMPANY = 15;

const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const US_PATTERN = new RegExp(`united states|\\bu\\.?s\\.?a?\\b|, (${US_STATES})\\b|\\b(new york|san francisco|seattle|austin|boston|chicago|los angeles|denver|atlanta|miami)\\b`, 'i');
const NON_US_PATTERN = /canada|united kingdom|\buk\b|europe|emea|apac|latam|india|bangalore|germany|mexico|brazil|australia|ireland|israel|poland|spain|france|netherlands|japan|singapore|london|toronto/i;

interface AtsJob {
  provider: AtsProvider;
  company: string;
  id: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  /** Direct application-form URL when it differs from the listing URL */
  formUrl?: string;
  postedDate: Date;
  description?: string;
  /** Country code/name when the ATS provides one */
  country?: string;
}

function companyList(provider: AtsProvider): string[] {
  const configured = process.env[`${provider.toUpperCase()}_COMPANIES`];
  return configured
    ? configured.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_COMPANIES[provider];
}

function isUSLocation(location: string, country?: string): boolean {
  if (country) return /^(us|usa|united states)$/i.test(country.trim());
  if (US_PATTERN.test(location)) return true;
  return /remote/i.test(location) && !NON_US_PATTERN.test(location);
}

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function experienceLevelFromTitle(title: string): ExperienceLevel {
  if (/\b(staff|lead|architect)\b/i.test(title)) return ExperienceLevel.LEAD;
  if (/\b(senior|sr\.?)\b/i.test(title)) return ExperienceLevel.SENIOR;
  if (/\b(junior|jr\.?|new grad|entry|associate)\b/i.test(title)) return ExperienceLevel.ENTRY;
  return ExperienceLevel.MID;
}

function prettyCompany(slug: string, name?: string): string {
  return name || slug.charAt(0).toUpperCase() + slug.slice(1);
}

async function fetchGreenhouse(slug: string, isWanted: (job: AtsJob) => boolean): Promise<AtsJob[]> {
  const { data } = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, { timeout: 20000 });
  const candidates: AtsJob[] = (data.jobs || []).map((j: any) => ({
    provider: 'greenhouse' as const,
    company: prettyCompany(slug, j.company_name),
    id: String(j.id),
    title: j.title,
    location: j.location?.name || '',
    remote: /remote/i.test(j.location?.name || ''),
    url: j.absolute_url,
    // absolute_url often redirects to the company's careers site with the form in an iframe;
    // the embed URL serves the Greenhouse form itself
    formUrl: `https://job-boards.greenhouse.io/embed/job_app?for=${slug}&token=${j.id}`,
    postedDate: new Date(j.first_published || j.updated_at)
  })).filter(isWanted).slice(0, MAX_JOBS_PER_COMPANY);

  // The list endpoint has no description; fetch it for the jobs we keep
  for (const job of candidates) {
    try {
      const detail = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${job.id}`, { timeout: 20000 });
      job.description = stripHtml(detail.data.content || '');
    } catch {
      job.description = '';
    }
  }
  return candidates;
}

async function fetchLever(slug: string, isWanted: (job: AtsJob) => boolean): Promise<AtsJob[]> {
  const { data } = await axios.get(`https://api.lever.co/v0/postings/${slug}?mode=json`, { timeout: 20000 });
  return (data || []).map((j: any) => ({
    provider: 'lever' as const,
    company: prettyCompany(slug),
    id: j.id,
    title: j.text,
    location: j.categories?.location || '',
    remote: j.workplaceType === 'remote',
    url: j.hostedUrl,
    postedDate: new Date(j.createdAt),
    description: [j.descriptionPlain, ...(j.lists || []).map((l: any) => `${l.text}\n${stripHtml(l.content || '')}`), j.additionalPlain]
      .filter(Boolean).join('\n\n'),
    country: j.country
  })).filter(isWanted).slice(0, MAX_JOBS_PER_COMPANY);
}

async function fetchAshby(slug: string, isWanted: (job: AtsJob) => boolean): Promise<AtsJob[]> {
  const { data } = await axios.get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { timeout: 20000 });
  return (data.jobs || [])
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => {
      // Ashby lists every location separately; keep the job if any of them is in the US
      const locations = [
        { name: j.location, country: j.address?.postalAddress?.addressCountry },
        ...(j.secondaryLocations || []).map((l: any) => ({ name: l.location, country: l.address?.postalAddress?.addressCountry }))
      ];
      const usLocation = locations.find(l => isUSLocation(l.name || '', l.country));
      return {
        provider: 'ashby' as const,
        company: prettyCompany(slug),
        id: j.id,
        title: j.title,
        location: usLocation?.name || j.location || '',
        remote: !!j.isRemote,
        url: j.jobUrl,
        postedDate: new Date(j.publishedAt),
        description: j.descriptionPlain || stripHtml(j.descriptionHtml || ''),
        country: usLocation ? 'US' : locations[0]?.country
      };
    })
    .filter(isWanted)
    .slice(0, MAX_JOBS_PER_COMPANY);
}

const FETCHERS: Record<AtsProvider, typeof fetchGreenhouse> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby
};

function toJob(job: AtsJob): Partial<IJob> {
  // Stored locations end in "USA" so text search on "usa" finds them (see jobFetcher)
  const location = job.location || (job.remote ? 'Remote' : 'Unknown');
  return {
    title: job.title,
    company: job.company,
    location: /\bUSA$/i.test(location) ? location : `${location}, USA`,
    remote: job.remote,
    description: job.description || job.title,
    requirements: [],
    jobType: JobType.FULL_TIME,
    experienceLevel: experienceLevelFromTitle(job.title),
    applicationUrl: job.url,
    atsApplyUrl: job.formUrl || job.url,
    autoApplySupported: true,
    extensionSupported: true,
    source: job.provider,
    sourceId: `${job.company.toLowerCase()}:${job.id}`,
    postedDate: job.postedDate
  };
}

/**
 * Fetches recent US developer jobs from the configured company boards.
 * A company whose board fails (renamed, removed) is logged and skipped.
 */
export async function fetchAtsJobs(
  onProgress: (message: string, level?: 'info' | 'warn') => void = () => undefined
): Promise<Partial<IJob>[]> {
  const titlePattern = new RegExp(process.env.ATS_TITLE_PATTERN || DEFAULT_TITLE_PATTERN, 'i');
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const isWanted = (job: AtsJob) =>
    titlePattern.test(job.title) &&
    !EXCLUDED_TITLES.test(job.title) &&
    isUSLocation(job.location, job.country) &&
    job.postedDate.getTime() >= cutoff;

  const jobs: Partial<IJob>[] = [];
  for (const provider of Object.keys(FETCHERS) as AtsProvider[]) {
    for (const slug of companyList(provider)) {
      try {
        const found = await FETCHERS[provider](slug, isWanted);
        jobs.push(...found.map(toJob));
        logger.info(`ATS ${provider}/${slug}: ${found.length} matching US jobs`);
        onProgress(found.length
          ? `${found[0].company} (${provider}): ${found.length} matching US jobs — auto-apply ready`
          : `${slug} (${provider}): no matching US jobs right now`);
      } catch (error: any) {
        logger.warn(`ATS ${provider}/${slug} skipped: ${error.response?.status || error.message}`);
        onProgress(`${slug} (${provider}): board unavailable, skipped`, 'warn');
      }
    }
  }
  return jobs;
}
