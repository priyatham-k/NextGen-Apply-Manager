import axios from 'axios';
import { logger } from '../config/logger';
import { Profile } from '../models/Profile.model';
import { UserSettings } from '../models/Settings.model';
import { Job } from '../models/Job.model';
import { Application } from '../models/Application.model';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Cache for storing match results (userId -> { results, timestamp })
const matchCache = new Map<string, { results: any[]; timestamp: number }>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface JobMatchResult {
  job: any;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceFit: 'excellent' | 'good' | 'stretch' | 'overqualified';
  locationFit: 'perfect' | 'good' | 'poor';
  salaryFit: 'above' | 'meets' | 'below' | 'unknown';
  overallReason: string;
  pros: string[];
  cons: string[];
}

/**
 * Calculate job matches for a user using AI-powered analysis
 */
export async function calculateMatches(userId: string, limit: number = 20): Promise<JobMatchResult[]> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  // Check cache
  const cached = matchCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    logger.info(`Returning cached matches for user ${userId}`);
    return cached.results.slice(0, limit);
  }

  // Fetch user profile and preferences
  const profile = await Profile.findOne({ userId });
  const settings = await UserSettings.findOne({ userId });

  if (!profile) {
    throw new Error('User profile not found. Please complete your profile first.');
  }

  // Fetch jobs user already applied to
  const applications = await Application.find({ userId }).select('jobId');
  const appliedJobIds = new Set(applications.map((app: any) => app.jobId.toString()));

  // Fetch available jobs (recent, not expired, not applied)
  const jobs = await Job.find({
    status: 'new',
    $or: [
      { expiryDate: { $gte: new Date() } },
      { expiryDate: { $exists: false } }
    ]
  })
    .sort({ postedDate: -1 })
    .limit(200)
    .lean();

  // Filter out jobs user already applied to
  const availableJobs = jobs.filter(job => !appliedJobIds.has(job._id.toString()));

  if (availableJobs.length === 0) {
    logger.info(`No available jobs found for user ${userId}`);
    return [];
  }

  // Build user profile summary for AI
  const profileSummary = buildProfileSummary(profile, settings);

  // Process jobs in batches to reduce API calls
  const batchSize = 5;
  const allMatches: JobMatchResult[] = [];

  for (let i = 0; i < Math.min(availableJobs.length, 50); i += batchSize) {
    const batch = availableJobs.slice(i, i + batchSize);
    const batchMatches = await analyzeJobBatch(profileSummary, batch, apiKey);
    allMatches.push(...batchMatches);
  }

  // Sort by match score descending
  allMatches.sort((a, b) => b.matchScore - a.matchScore);

  // Cache results
  matchCache.set(userId, { results: allMatches, timestamp: Date.now() });

  logger.info(`Calculated ${allMatches.length} matches for user ${userId}`);

  return allMatches.slice(0, limit);
}

/**
 * Build a concise profile summary for AI analysis
 */
function buildProfileSummary(profile: any, settings: any): string {
  const parts: string[] = [];

  // Professional summary
  if (profile.professionalSummary?.summary) {
    parts.push(`Professional Summary: ${profile.professionalSummary.summary}`);
  }

  // Years of experience
  if (profile.professionalSummary?.yearsOfExperience) {
    parts.push(`Total Experience: ${profile.professionalSummary.yearsOfExperience} years`);
  }

  // Skills with levels
  if (profile.skills && profile.skills.length > 0) {
    const skillsStr = profile.skills
      .map((s: any) => `${s.name} (${s.level})`)
      .join(', ');
    parts.push(`Skills: ${skillsStr}`);
  }

  // Recent work experience (last 2)
  if (profile.workExperience && profile.workExperience.length > 0) {
    const recentWork = profile.workExperience.slice(0, 2);
    const workStr = recentWork
      .map((w: any) => `${w.position} at ${w.company}`)
      .join('; ');
    parts.push(`Recent Experience: ${workStr}`);
  }

  // Education
  if (profile.education && profile.education.length > 0) {
    const edu = profile.education[0];
    parts.push(`Education: ${edu.degree} in ${edu.field || 'N/A'} from ${edu.institution}`);
  }

  // Preferences from settings
  if (settings) {
    if (settings.jobPreferences?.preferredJobTypes && settings.jobPreferences.preferredJobTypes.length > 0) {
      parts.push(`Preferred Job Types: ${settings.jobPreferences.preferredJobTypes.join(', ')}`);
    }
    if (settings.jobPreferences?.preferredLocations && settings.jobPreferences.preferredLocations.length > 0) {
      parts.push(`Preferred Locations: ${settings.jobPreferences.preferredLocations.join(', ')}`);
    }
    if (settings.jobPreferences?.salaryMin) {
      parts.push(`Minimum Salary: ${settings.jobPreferences.salaryCurrency || 'USD'} ${settings.jobPreferences.salaryMin}`);
    }
    if (settings.jobPreferences?.willingToRelocate !== undefined) {
      parts.push(`Willing to Relocate: ${settings.jobPreferences.willingToRelocate ? 'Yes' : 'No'}`);
    }
  }

  return parts.join('\n');
}

/**
 * Analyze a batch of jobs against user profile using AI
 */
async function analyzeJobBatch(
  profileSummary: string,
  jobs: any[],
  apiKey: string
): Promise<JobMatchResult[]> {
  const systemPrompt = `You are an expert job matching AI. Analyze the candidate's profile against each job posting and return match scores with detailed analysis.

For each job, evaluate:
1. **Skills Match** - How well candidate's skills align with job requirements
2. **Experience Level** - Whether candidate's experience matches the role level
3. **Location Fit** - Geographic compatibility (remote, relocation, preferred locations)
4. **Salary Fit** - Whether job salary meets candidate expectations
5. **Career Growth** - Whether this role aligns with candidate's career trajectory

Return a JSON array with one object per job. Each object must have this EXACT structure:
{
  "jobId": "<the job _id>",
  "matchScore": <number 0-100>,
  "matchedSkills": ["skill1", "skill2", ...],
  "missingSkills": ["requirement1", "requirement2", ...],
  "experienceFit": "excellent" | "good" | "stretch" | "overqualified",
  "locationFit": "perfect" | "good" | "poor",
  "salaryFit": "above" | "meets" | "below" | "unknown",
  "overallReason": "<2-3 sentence explanation of why this job matches>",
  "pros": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "cons": ["<concern 1>", "<concern 2>"]
}

Rules:
- Be honest with match scores (don't inflate)
- matchScore should reflect overall fit (skills + experience + preferences)
- matchedSkills should list candidate's skills that directly apply to this job
- missingSkills should list job requirements the candidate doesn't have
- pros should highlight why this is a good opportunity for this candidate
- cons should note any gaps, concerns, or mismatches
- Return ONLY the JSON array, no markdown, no explanation`;

  const jobsPrompt = jobs.map(job => {
    const reqStr = job.requirements && job.requirements.length > 0
      ? job.requirements.join('; ')
      : 'Not specified';

    const salaryStr = job.salary?.min && job.salary?.max
      ? `${job.salary.currency || 'USD'} ${job.salary.min}-${job.salary.max}`
      : 'Not specified';

    return `JOB ID: ${job._id}
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}${job.remote ? ' (Remote)' : ''}
Experience Level: ${job.experienceLevel}
Job Type: ${job.jobType}
Salary: ${salaryStr}
Requirements: ${reqStr}
Description: ${job.description?.substring(0, 500) || 'N/A'}...`;
  }).join('\n\n---\n\n');

  const userPrompt = `CANDIDATE PROFILE:
${profileSummary}

---

JOBS TO ANALYZE:
${jobsPrompt}

Return a JSON array with match analysis for each job.`;

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const content = response.data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content from Groq API');
    }

    // Clean up response - strip markdown fences if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const matchAnalyses = JSON.parse(jsonStr);

    // Map results back to jobs
    const results: JobMatchResult[] = [];
    for (const analysis of matchAnalyses) {
      const job = jobs.find(j => j._id.toString() === analysis.jobId);
      if (job) {
        // Transform _id to id for frontend compatibility
        const transformedJob = { ...job, id: job._id.toString() };
        results.push({
          job: transformedJob,
          matchScore: analysis.matchScore || 0,
          matchedSkills: analysis.matchedSkills || [],
          missingSkills: analysis.missingSkills || [],
          experienceFit: analysis.experienceFit || 'good',
          locationFit: analysis.locationFit || 'good',
          salaryFit: analysis.salaryFit || 'unknown',
          overallReason: analysis.overallReason || 'Match analysis unavailable',
          pros: analysis.pros || [],
          cons: analysis.cons || []
        });
      }
    }

    return results;
  } catch (error: any) {
    logger.error(`Error analyzing job batch: ${error.message}`);
    // Fallback: basic keyword matching
    return jobs.map(job => fallbackMatch(profileSummary, job));
  }
}

/**
 * Fallback matching logic when AI fails (basic keyword matching)
 */
function fallbackMatch(profileSummary: string, job: any): JobMatchResult {
  const profileLower = profileSummary.toLowerCase();
  const jobText = `${job.title} ${job.description} ${job.requirements?.join(' ') || ''}`.toLowerCase();

  // Simple keyword overlap score
  const keywords = job.requirements || [];
  const matchedCount = keywords.filter((kw: string) =>
    profileLower.includes(kw.toLowerCase())
  ).length;

  const matchScore = keywords.length > 0
    ? Math.min(100, (matchedCount / keywords.length) * 100)
    : 50;

  // Transform _id to id for frontend compatibility
  const transformedJob = { ...job, id: job._id.toString() };

  return {
    job: transformedJob,
    matchScore: Math.round(matchScore),
    matchedSkills: [],
    missingSkills: [],
    experienceFit: 'good',
    locationFit: 'good',
    salaryFit: 'unknown',
    overallReason: 'Basic keyword matching applied (AI analysis unavailable)',
    pros: ['Job title matches your profile'],
    cons: ['Complete analysis unavailable']
  };
}

/**
 * Get detailed match information for a specific job
 */
export async function getMatchDetails(userId: string, jobId: string): Promise<JobMatchResult | null> {
  // Check cache first
  const cached = matchCache.get(userId);
  if (cached) {
    const match = cached.results.find((m: JobMatchResult) => m.job._id.toString() === jobId);
    if (match) {
      return match;
    }
  }

  // If not in cache, calculate matches and find it
  const matches = await calculateMatches(userId, 50);
  return matches.find(m => m.job._id.toString() === jobId) || null;
}

/**
 * Clear cache for a specific user (call when profile updates)
 */
export function clearMatchCache(userId: string): void {
  matchCache.delete(userId);
  logger.info(`Cleared match cache for user ${userId}`);
}

/**
 * Clear entire match cache
 */
export function clearAllMatchCache(): void {
  matchCache.clear();
  logger.info('Cleared all match cache');
}
