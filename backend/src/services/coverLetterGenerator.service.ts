import axios from 'axios';
import { logger } from '../config/logger';
import { Profile } from '../models/Profile.model';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Generate a personalized cover letter using AI
 */
export async function generateCoverLetter(
  userId: string,
  company: string,
  position: string,
  jobDescription: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  // Fetch user profile
  const profile = await Profile.findOne({ userId });

  if (!profile) {
    throw new Error('User profile not found. Please complete your profile first.');
  }

  // Build profile summary for AI
  const profileSummary = buildProfileSummary(profile);

  // Construct AI prompt
  const systemPrompt = `You are an expert cover letter writer specializing in creating compelling, personalized application letters.

Write a professional cover letter that:
1. Has a strong opening that shows genuine interest in the specific role and company
2. Highlights 2-3 most relevant achievements from the candidate's background with specific metrics when available
3. Demonstrates understanding of the role requirements and how the candidate's skills align
4. Shows enthusiasm and cultural fit
5. Includes a confident closing with a call to action
6. Is concise (300-400 words)
7. Uses professional but warm tone
8. Avoids clichés and generic statements

Format the letter with proper business letter structure:
- Greeting (Dear Hiring Manager, or Dear [Company] Team,)
- 3-4 body paragraphs
- Professional closing (Best regards,)
- Candidate's name

Return ONLY the cover letter text, no additional commentary or markdown formatting.`;

  const userPrompt = `Generate a cover letter for the following:

CANDIDATE PROFILE:
${profileSummary}

JOB INFORMATION:
Company: ${company}
Position: ${position}

JOB DESCRIPTION:
${jobDescription}

Write a compelling cover letter that showcases why this candidate is an excellent fit for this specific role.`;

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
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

    logger.info(`Cover letter generated successfully for user ${userId}`);

    return content.trim();
  } catch (error: any) {
    logger.error(`Error generating cover letter: ${error.message}`);
    throw new Error('Failed to generate cover letter. Please try again.');
  }
}

/**
 * Build a comprehensive profile summary for AI
 */
function buildProfileSummary(profile: any): string {
  const parts: string[] = [];

  // Personal info
  const fullName = `${profile.personalInfo?.firstName || ''} ${profile.personalInfo?.middleName || ''} ${profile.personalInfo?.lastName || ''}`.trim();
  if (fullName) {
    parts.push(`Name: ${fullName}`);
  }

  // Professional summary
  if (profile.professionalSummary?.summary) {
    parts.push(`\nProfessional Summary:\n${profile.professionalSummary.summary}`);
  }

  // Years of experience
  if (profile.professionalSummary?.yearsOfExperience) {
    parts.push(`\nTotal Experience: ${profile.professionalSummary.yearsOfExperience} years`);
  }

  // Core competencies
  if (profile.professionalSummary?.coreCompetencies && profile.professionalSummary.coreCompetencies.length > 0) {
    parts.push(`\nCore Competencies: ${profile.professionalSummary.coreCompetencies.join(', ')}`);
  }

  // Skills
  if (profile.skills && profile.skills.length > 0) {
    const skillsStr = profile.skills
      .slice(0, 10)
      .map((s: any) => `${s.name} (${s.level})`)
      .join(', ');
    parts.push(`\nKey Skills: ${skillsStr}`);
  }

  // Work experience (top 3)
  if (profile.workExperience && profile.workExperience.length > 0) {
    parts.push(`\nWork Experience:`);
    profile.workExperience.slice(0, 3).forEach((exp: any) => {
      parts.push(`\n- ${exp.position} at ${exp.company}`);
      if (exp.description) {
        parts.push(`  ${exp.description.substring(0, 200)}...`);
      }
      if (exp.achievements && exp.achievements.length > 0) {
        parts.push(`  Key achievements: ${exp.achievements.slice(0, 2).join('; ')}`);
      }
      if (exp.technologies && exp.technologies.length > 0) {
        parts.push(`  Technologies: ${exp.technologies.join(', ')}`);
      }
    });
  }

  // Education (top degree)
  if (profile.education && profile.education.length > 0) {
    const edu = profile.education[0];
    parts.push(`\nEducation: ${edu.degree} in ${edu.field || 'N/A'} from ${edu.institution}`);
  }

  // Certifications (top 3)
  if (profile.certifications && profile.certifications.length > 0) {
    const certs = profile.certifications
      .slice(0, 3)
      .map((c: any) => `${c.name} (${c.issuer})`)
      .join(', ');
    parts.push(`\nCertifications: ${certs}`);
  }

  // Notable projects
  if (profile.projects && profile.projects.length > 0) {
    parts.push(`\nNotable Projects:`);
    profile.projects.slice(0, 2).forEach((proj: any) => {
      parts.push(`\n- ${proj.name}: ${proj.description || 'No description'}`);
      if (proj.technologies && proj.technologies.length > 0) {
        parts.push(`  Tech stack: ${proj.technologies.join(', ')}`);
      }
    });
  }

  return parts.join('\n');
}

/**
 * Extract company name and position title from job description using AI
 */
export async function extractJobDetails(jobDescription: string): Promise<{ company: string; position: string }> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  if (!jobDescription || jobDescription.trim().length < 20) {
    return { company: '', position: '' };
  }

  const systemPrompt = `You are an expert at extracting structured information from job postings.
Extract the company name and position title from the job description provided.

Return ONLY a JSON object in this exact format:
{
  "company": "Company Name",
  "position": "Position Title"
}

If you cannot find the company name or position, use empty strings for those fields.
Do not include any additional text, explanations, or markdown formatting.`;

  const userPrompt = `Extract the company name and position title from this job description:

${jobDescription.substring(0, 2000)}`;

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data.choices?.[0]?.message?.content;

    if (!content) {
      logger.warn('No response content from Groq API for job details extraction');
      return { company: '', position: '' };
    }

    // Parse JSON response
    const cleanContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const extracted = JSON.parse(cleanContent);

    logger.info('Job details extracted successfully');

    return {
      company: extracted.company || '',
      position: extracted.position || ''
    };
  } catch (error: any) {
    logger.error(`Error extracting job details: ${error.message}`);
    // Return empty strings instead of throwing - graceful fallback
    return { company: '', position: '' };
  }
}
