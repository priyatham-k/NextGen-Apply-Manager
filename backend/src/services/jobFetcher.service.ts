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

export async function fetchJobs(): Promise<FetchResult> {
  const result: FetchResult = { newJobs: 0, updatedJobs: 0, errors: 0 };

  const keywordsStr = process.env.JOB_KEYWORDS || 'Full Stack Developer,Node.js,React';
  const locationsStr = process.env.JOB_LOCATIONS || 'Remote';
  const maxPages = parseInt(process.env.FETCH_MAX_PAGES || '2', 10);

  const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
  const locations = locationsStr.split(',').map(l => l.trim()).filter(Boolean);

  logger.info(`Starting job fetch: ${keywords.length} keywords x ${locations.length} locations`);

  for (const keyword of keywords) {
    for (const location of locations) {
      for (let page = 1; page <= maxPages; page++) {
        const query = location.toLowerCase() === 'remote'
          ? `${keyword} remote`
          : `${keyword} in ${location}`;

        logger.info(`Fetching: "${query}" (page ${page})`);

        const rawJobs = await fetchFromJSearch(query, page);

        if (rawJobs.length === 0) {
          if (page === 1) {
            logger.info(`No results for "${query}"`);
          }
          break; // No more pages
        }

        for (const rawJob of rawJobs) {
          try {
            const normalized = normalizeJSearchJob(rawJob);
            const action = await upsertJob(normalized);
            if (action === 'new') result.newJobs++;
            else result.updatedJobs++;
          } catch (error: any) {
            result.errors++;
            logger.error(`Error upserting job ${rawJob.job_id}:`, error.message);
          }
        }

        logger.info(`Processed ${rawJobs.length} jobs from "${query}" page ${page}`);
      }
    }
  }

  logger.info(`Job fetch complete: ${result.newJobs} new, ${result.updatedJobs} updated, ${result.errors} errors`);
  return result;
}
