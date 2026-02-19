import axios from 'axios';
import { logger } from '../config/logger';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const CATEGORY_ICONS: Record<string, string> = {
  'Formatting & Layout': 'bi-layout-text-sidebar-reverse',
  'Content Quality': 'bi-file-earmark-text',
  'Keyword Optimization': 'bi-key',
  'ATS Compatibility': 'bi-robot',
  'Structure & Organization': 'bi-list-check',
  'Impact & Achievements': 'bi-graph-up-arrow'
};

function getGradeAndColor(score: number): { grade: string; gradeColor: string } {
  if (score >= 90) return { grade: 'A+', gradeColor: '#22c55e' };
  if (score >= 85) return { grade: 'A', gradeColor: '#22c55e' };
  if (score >= 80) return { grade: 'A-', gradeColor: '#34d399' };
  if (score >= 75) return { grade: 'B+', gradeColor: '#60a5fa' };
  if (score >= 70) return { grade: 'B', gradeColor: '#3b82f6' };
  if (score >= 65) return { grade: 'B-', gradeColor: '#818cf8' };
  if (score >= 60) return { grade: 'C+', gradeColor: '#f59e0b' };
  if (score >= 55) return { grade: 'C', gradeColor: '#f97316' };
  return { grade: 'D', gradeColor: '#ef4444' };
}

export async function analyzeResumeATS(resumeText: string, jobDescription?: string): Promise<Record<string, any>> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured. Please add it to your .env file.');
  }

  const jdSection = jobDescription
    ? `\n\nThe user also provided a JOB DESCRIPTION to compare against:\n"""\n${jobDescription}\n"""\n\nUse this job description to evaluate keyword optimization — check which keywords from the JD appear in the resume and which are missing.`
    : '\n\nNo job description was provided. For keyword optimization, evaluate based on general industry keywords found in the resume. Set "missing" to ["Provide a job description for targeted keyword analysis"].';

  const systemPrompt = `You are an expert ATS (Applicant Tracking System) resume analyzer. Analyze the resume text and return ONLY valid JSON (no markdown, no explanation, no code fences).

Evaluate the resume across these 6 categories, each scored 0-100:

1. **Formatting & Layout** — Is the resume clean, consistent, with proper font usage, margins, whitespace, and visual hierarchy? Penalize if it appears to use tables, images, or complex layouts that ATS systems struggle with.

2. **Content Quality** — Does it use strong action verbs, quantified achievements, and results-oriented language? Are bullet points concise and impactful?

3. **Keyword Optimization** — Does the resume contain relevant industry keywords, technical skills, and role-specific terms?${jobDescription ? ' Compare against the provided job description.' : ''}

4. **ATS Compatibility** — Does it use standard section headings (Experience, Education, Skills)? Avoid headers/footers for critical info? Use simple formatting that ATS parsers can read? Avoid special characters or graphics descriptions?

5. **Structure & Organization** — Are sections logically ordered? Is reverse chronological order used? Are related items grouped? Is there a clear professional summary?

6. **Impact & Achievements** — Are accomplishments quantified with metrics (revenue, users, percentages, time saved)? Does it show career progression, leadership, and scope of work?

Return this exact JSON structure:
{
  "overallScore": <number 0-100, weighted average of all categories>,
  "categories": [
    {
      "name": "Formatting & Layout",
      "score": <number 0-100>,
      "maxScore": 100,
      "feedback": "<1-2 sentence assessment>",
      "tips": ["<actionable improvement tip>", "<tip>", "<tip>"]
    },
    {
      "name": "Content Quality",
      "score": <number>,
      "maxScore": 100,
      "feedback": "<assessment>",
      "tips": ["<tip>", "<tip>", "<tip>"]
    },
    {
      "name": "Keyword Optimization",
      "score": <number>,
      "maxScore": 100,
      "feedback": "<assessment>",
      "tips": ["<tip>", "<tip>", "<tip>"]
    },
    {
      "name": "ATS Compatibility",
      "score": <number>,
      "maxScore": 100,
      "feedback": "<assessment>",
      "tips": ["<tip>", "<tip>", "<tip>"]
    },
    {
      "name": "Structure & Organization",
      "score": <number>,
      "maxScore": 100,
      "feedback": "<assessment>",
      "tips": ["<tip>", "<tip>", "<tip>"]
    },
    {
      "name": "Impact & Achievements",
      "score": <number>,
      "maxScore": 100,
      "feedback": "<assessment>",
      "tips": ["<tip>", "<tip>", "<tip>"]
    }
  ],
  "keywords": {
    "found": ["<keyword found in resume>", ...],
    "missing": ["<important keyword NOT in resume>", ...]
  },
  "summary": "<2-3 sentence overall assessment with the most important recommendation>"
}

Rules:
- Be honest and critical — do not inflate scores
- Each tip must be specific and actionable (not generic advice)
- Identify real keywords from the resume text for "found"
- For "missing", suggest keywords that would strengthen the resume for the target role
- The summary should highlight the biggest strength and most impactful improvement
- Return ONLY the JSON object, nothing else`;

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this resume for ATS compatibility:\n\n${resumeText}${jdSection}` }
      ],
      temperature: 0.2,
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

  const parsed = JSON.parse(jsonStr);

  // Add icons and grade/color (not AI-generated)
  if (parsed.categories) {
    for (const cat of parsed.categories) {
      cat.icon = CATEGORY_ICONS[cat.name] || 'bi-check-circle';
    }
  }

  const { grade, gradeColor } = getGradeAndColor(parsed.overallScore || 0);
  parsed.grade = grade;
  parsed.gradeColor = gradeColor;

  logger.info('ATS score analysis completed via Groq API');

  return parsed;
}
