import axios from 'axios';
import { Job, IJob, JobType, ExperienceLevel, JobStatus } from '../models/Job.model';
import { logger } from '../config/logger';

interface FetchResult {
  newJobs: number;
  updatedJobs: number;
  errors: number;
}

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo: string | null;
  employer_website: string | null;
  job_city: string;
  job_state: string;
  job_country: string;
  job_is_remote: boolean;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_description: string;
  job_highlights?: {
    Qualifications?: string[];
    Benefits?: string[];
    Responsibilities?: string[];
  };
  job_employment_type: string;
  job_required_experience?: {
    experience_level?: string;
    required_experience_in_months?: number;
  };
  job_apply_link: string;
  job_posted_at_datetime_utc: string;
  job_offer_expiration_datetime_utc?: string;
}

function mapEmploymentType(type: string): JobType {
  const normalized = (type || '').toUpperCase().replace(/[-\s]/g, '_');
  const mapping: Record<string, JobType> = {
    'FULLTIME': JobType.FULL_TIME,
    'FULL_TIME': JobType.FULL_TIME,
    'PARTTIME': JobType.PART_TIME,
    'PART_TIME': JobType.PART_TIME,
    'CONTRACTOR': JobType.CONTRACT,
    'CONTRACT': JobType.CONTRACT,
    'INTERN': JobType.INTERNSHIP,
    'INTERNSHIP': JobType.INTERNSHIP,
    'FREELANCE': JobType.FREELANCE
  };
  return mapping[normalized] || JobType.FULL_TIME;
}

function mapExperienceLevel(raw?: string, months?: number): ExperienceLevel {
  if (raw) {
    const normalized = raw.toLowerCase();
    if (normalized.includes('entry') || normalized.includes('junior') || normalized.includes('intern')) {
      return ExperienceLevel.ENTRY;
    }
    if (normalized.includes('senior') || normalized.includes('sr')) {
      return ExperienceLevel.SENIOR;
    }
    if (normalized.includes('lead') || normalized.includes('principal') || normalized.includes('staff')) {
      return ExperienceLevel.LEAD;
    }
    if (normalized.includes('executive') || normalized.includes('director') || normalized.includes('vp')) {
      return ExperienceLevel.EXECUTIVE;
    }
  }
  if (months !== undefined) {
    if (months < 24) return ExperienceLevel.ENTRY;
    if (months < 60) return ExperienceLevel.MID;
    if (months < 120) return ExperienceLevel.SENIOR;
    return ExperienceLevel.LEAD;
  }
  return ExperienceLevel.MID;
}

function normalizeJSearchJob(raw: JSearchJob): Partial<IJob> {
  const location = [raw.job_city, raw.job_state, raw.job_country]
    .filter(Boolean)
    .join(', ') || 'Unknown';

  const salary: { min?: number; max?: number; currency: string } = {
    currency: raw.job_salary_currency || 'USD'
  };
  if (raw.job_min_salary) salary.min = raw.job_min_salary;
  if (raw.job_max_salary) salary.max = raw.job_max_salary;

  return {
    title: raw.job_title,
    company: raw.employer_name,
    location,
    remote: raw.job_is_remote || false,
    salary: (salary.min || salary.max) ? salary : undefined,
    description: raw.job_description,
    requirements: raw.job_highlights?.Qualifications || [],
    benefits: raw.job_highlights?.Benefits || [],
    jobType: mapEmploymentType(raw.job_employment_type),
    experienceLevel: mapExperienceLevel(
      raw.job_required_experience?.experience_level,
      raw.job_required_experience?.required_experience_in_months
    ),
    applicationUrl: raw.job_apply_link,
    companyWebsite: raw.employer_website || undefined,
    companyLogo: raw.employer_logo || undefined,
    source: 'jsearch',
    sourceId: raw.job_id,
    postedDate: raw.job_posted_at_datetime_utc
      ? new Date(raw.job_posted_at_datetime_utc)
      : new Date(),
    expiryDate: raw.job_offer_expiration_datetime_utc
      ? new Date(raw.job_offer_expiration_datetime_utc)
      : undefined
  };
}

async function fetchFromJSearch(
  query: string,
  page: number = 1
): Promise<JSearchJob[]> {
  const apiKey = process.env.JSEARCH_API_KEY;
  const apiHost = process.env.JSEARCH_API_HOST || 'jsearch.p.rapidapi.com';

  if (!apiKey || apiKey === 'your-jsearch-api-key') {
    logger.warn('JSearch API key not configured. Set JSEARCH_API_KEY in .env');
    return [];
  }

  try {
    const response = await axios.get(`https://${apiHost}/search`, {
      params: {
        query,
        page: page.toString(),
        num_pages: '1',
        date_posted: 'month'
      },
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': apiHost
      },
      timeout: 15000
    });

    return response.data?.data || [];
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logger.error('JSearch API authentication failed. Check your API key.');
    } else if (error.response?.status === 429) {
      logger.warn('JSearch API rate limit reached. Try again later.');
    } else {
      logger.error(`JSearch API error for query "${query}":`, error.message);
    }
    return [];
  }
}

async function upsertJob(jobData: Partial<IJob>): Promise<'new' | 'updated'> {
  const existing = await Job.findOne({
    source: jobData.source,
    sourceId: jobData.sourceId
  });

  if (existing) {
    // Update job data but preserve user-set status
    const { status: _status, ...updateFields } = jobData;
    await Job.findByIdAndUpdate(existing._id, { $set: updateFields });
    return 'updated';
  } else {
    await Job.create({ ...jobData, status: JobStatus.NEW });
    return 'new';
  }
}

// ─── Remotive (Free — no API key) ────────────────────────────────

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo: string | null;
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
  tags: string[];
}

function mapRemotiveJobType(type: string): JobType {
  const t = (type || '').toLowerCase().replace(/[-\s]/g, '_');
  if (t.includes('part')) return JobType.PART_TIME;
  if (t.includes('contract') || t.includes('freelance')) return JobType.CONTRACT;
  if (t.includes('intern')) return JobType.INTERNSHIP;
  return JobType.FULL_TIME;
}

function normalizeRemotiveJob(raw: RemotiveJob): Partial<IJob> {
  const location = raw.candidate_required_location || 'Remote';
  const isRemote = !location || location.toLowerCase().includes('worldwide') ||
    location.toLowerCase() === 'remote' || location === '';

  return {
    title: raw.title,
    company: raw.company_name,
    location: isRemote ? 'Remote' : location,
    remote: isRemote,
    description: raw.description,
    requirements: raw.tags || [],
    jobType: mapRemotiveJobType(raw.job_type),
    experienceLevel: ExperienceLevel.MID,
    applicationUrl: raw.url,
    companyLogo: raw.company_logo || undefined,
    source: 'remotive',
    sourceId: String(raw.id),
    postedDate: raw.publication_date ? new Date(raw.publication_date) : new Date()
  };
}

async function fetchFromRemotive(search?: string): Promise<RemotiveJob[]> {
  try {
    const params: Record<string, string> = { limit: '100' };
    if (search) params.search = search;

    const response = await axios.get('https://remotive.com/api/remote-jobs', {
      params,
      timeout: 15000
    });
    return response.data?.jobs || [];
  } catch (error: any) {
    logger.error('Remotive API error:', error.message);
    return [];
  }
}

// ─── Arbeitnow (Free — no API key) ───────────────────────────────

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

function mapArbeitnowJobType(types: string[]): JobType {
  const t = (types || []).join(' ').toLowerCase();
  if (t.includes('part')) return JobType.PART_TIME;
  if (t.includes('contract') || t.includes('freelance')) return JobType.CONTRACT;
  if (t.includes('intern')) return JobType.INTERNSHIP;
  return JobType.FULL_TIME;
}

function normalizeArbeitnowJob(raw: ArbeitnowJob): Partial<IJob> {
  return {
    title: raw.title,
    company: raw.company_name,
    location: raw.remote ? 'Remote' : (raw.location || 'Remote'),
    remote: raw.remote,
    description: raw.description,
    requirements: raw.tags || [],
    jobType: mapArbeitnowJobType(raw.job_types),
    experienceLevel: ExperienceLevel.MID,
    applicationUrl: raw.url,
    source: 'arbeitnow',
    sourceId: raw.slug,
    postedDate: raw.created_at ? new Date(raw.created_at * 1000) : new Date()
  };
}

async function fetchFromArbeitnow(page: number = 1): Promise<ArbeitnowJob[]> {
  try {
    const response = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
      params: { page },
      timeout: 15000
    });
    return response.data?.data || [];
  } catch (error: any) {
    logger.error('Arbeitnow API error:', error.message);
    return [];
  }
}

// ─── Keyword filter for free sources ─────────────────────────────

function jobMatchesKeywords(job: Partial<IJob>, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = [job.title, job.description, ...(job.requirements || [])]
    .join(' ')
    .toLowerCase();
  return keywords.some(kw => haystack.includes(kw.toLowerCase()));
}

// ─── Internet search types ────────────────────────────────────────

// Internet search types
export interface CompanyJobEntry {
  id: string;
  title: string;
  location: string;
  remote: boolean;
  jobType: string;
  experienceLevel: string;
  applicationUrl: string;
  salary?: { min?: number; max?: number; currency: string };
  postedDate: Date;
}

export interface CompanyGroup {
  company: string;
  companyWebsite: string | null;
  companyLogo: string | null;
  jobCount: number;
  jobs: CompanyJobEntry[];
}

export interface SearchFetchResult {
  totalJobs: number;
  newJobs: number;
  updatedJobs: number;
  companies: CompanyGroup[];
}

async function processNormalizedJobs(
  normalizedList: Partial<IJob>[],
  companyMap: Map<string, { website: string | null; logo: string | null; jobs: CompanyJobEntry[] }>,
  result: SearchFetchResult
): Promise<void> {
  for (const normalized of normalizedList) {
    try {
      const action = await upsertJob(normalized);
      if (action === 'new') result.newJobs++;
      else result.updatedJobs++;
      result.totalJobs++;

      const persisted = await Job.findOne({ source: normalized.source, sourceId: normalized.sourceId });
      const company = normalized.company || 'Unknown';

      if (!companyMap.has(company)) {
        companyMap.set(company, {
          website: normalized.companyWebsite || null,
          logo: normalized.companyLogo || null,
          jobs: []
        });
      }

      companyMap.get(company)!.jobs.push({
        id: persisted ? persisted._id.toString() : normalized.sourceId!,
        title: normalized.title!,
        location: normalized.location!,
        remote: normalized.remote || false,
        jobType: normalized.jobType || 'full_time',
        experienceLevel: normalized.experienceLevel || 'mid',
        applicationUrl: normalized.applicationUrl!,
        salary: normalized.salary,
        postedDate: normalized.postedDate || new Date()
      });
    } catch (error: any) {
      logger.error(`Error processing job:`, error.message);
    }
  }
}

export async function searchAndFetchJobs(
  query: string,
  location?: string,
  page: number = 1
): Promise<SearchFetchResult> {
  const fullQuery = location
    ? (location.toLowerCase() === 'remote' ? `${query} remote` : `${query} in ${location}`)
    : query;

  logger.info(`Internet search: "${fullQuery}" (page ${page})`);

  const result: SearchFetchResult = { totalJobs: 0, newJobs: 0, updatedJobs: 0, companies: [] };
  const companyMap = new Map<string, { website: string | null; logo: string | null; jobs: CompanyJobEntry[] }>();

  // JSearch (requires API key)
  const jsearchJobs = await fetchFromJSearch(fullQuery, page);
  await processNormalizedJobs(jsearchJobs.map(normalizeJSearchJob), companyMap, result);
  logger.info(`JSearch: ${jsearchJobs.length} jobs`);

  // Remotive (free, only on page 1 to avoid duplicate calls)
  if (page === 1) {
    const remotiveJobs = await fetchFromRemotive(query);
    const queryKeywords = query.split(/[\s,]+/).filter(k => k.length > 2);
    const filteredRemotive = remotiveJobs
      .map(normalizeRemotiveJob)
      .filter(j => jobMatchesKeywords(j, queryKeywords));
    await processNormalizedJobs(filteredRemotive, companyMap, result);
    logger.info(`Remotive: ${remotiveJobs.length} raw, ${filteredRemotive.length} matched`);
  }

  result.companies = Array.from(companyMap.entries())
    .map(([company, data]) => ({
      company,
      companyWebsite: data.website,
      companyLogo: data.logo,
      jobCount: data.jobs.length,
      jobs: data.jobs
    }))
    .sort((a, b) => b.jobCount - a.jobCount);

  logger.info(`Internet search complete: ${result.totalJobs} total, ${result.newJobs} new, ${result.companies.length} companies`);
  return result;
}

export async function fetchJobs(): Promise<FetchResult> {
  const result: FetchResult = { newJobs: 0, updatedJobs: 0, errors: 0 };

  const keywordsStr = process.env.JOB_KEYWORDS || 'Full Stack Developer,Node.js,React';
  const locationsStr = process.env.JOB_LOCATIONS || 'Remote';
  const maxPages = parseInt(process.env.FETCH_MAX_PAGES || '2', 10);

  const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
  const locations = locationsStr.split(',').map(l => l.trim()).filter(Boolean);

  // ── JSearch (requires API key) ──
  logger.info(`JSearch fetch: ${keywords.length} keywords x ${locations.length} locations`);
  for (const keyword of keywords) {
    for (const location of locations) {
      for (let page = 1; page <= maxPages; page++) {
        const query = location.toLowerCase() === 'remote'
          ? `${keyword} remote`
          : `${keyword} in ${location}`;

        const rawJobs = await fetchFromJSearch(query, page);
        if (rawJobs.length === 0) break;

        for (const rawJob of rawJobs) {
          try {
            const action = await upsertJob(normalizeJSearchJob(rawJob));
            if (action === 'new') result.newJobs++;
            else result.updatedJobs++;
          } catch (error: any) {
            result.errors++;
            logger.error(`JSearch upsert error ${rawJob.job_id}:`, error.message);
          }
        }
        logger.info(`JSearch: "${query}" page ${page} → ${rawJobs.length} jobs`);
      }
    }
  }

  // ── Remotive (free, no key) ──
  logger.info('Fetching from Remotive (free)...');
  for (const keyword of keywords.slice(0, 3)) {
    const remotiveJobs = await fetchFromRemotive(keyword);
    const filtered = remotiveJobs
      .map(normalizeRemotiveJob)
      .filter(j => jobMatchesKeywords(j, keywords));
    for (const normalized of filtered) {
      try {
        const action = await upsertJob(normalized);
        if (action === 'new') result.newJobs++;
        else result.updatedJobs++;
      } catch (error: any) {
        result.errors++;
        logger.error(`Remotive upsert error:`, error.message);
      }
    }
    logger.info(`Remotive: "${keyword}" → ${remotiveJobs.length} raw, ${filtered.length} matched`);
  }

  // ── Arbeitnow (free, no key) — filter by keywords since it has no search param ──
  logger.info('Fetching from Arbeitnow (free)...');
  for (let page = 1; page <= 2; page++) {
    const arbeitnowJobs = await fetchFromArbeitnow(page);
    if (arbeitnowJobs.length === 0) break;

    const filtered = arbeitnowJobs
      .map(normalizeArbeitnowJob)
      .filter(j => jobMatchesKeywords(j, keywords));
    for (const normalized of filtered) {
      try {
        const action = await upsertJob(normalized);
        if (action === 'new') result.newJobs++;
        else result.updatedJobs++;
      } catch (error: any) {
        result.errors++;
        logger.error(`Arbeitnow upsert error:`, error.message);
      }
    }
    logger.info(`Arbeitnow: page ${page} → ${arbeitnowJobs.length} raw, ${filtered.length} matched`);
  }

  logger.info(`Job fetch complete: ${result.newJobs} new, ${result.updatedJobs} updated, ${result.errors} errors`);
  return result;
}
