import fs from 'fs';
import { logger } from '../config/logger';
import { chatCompletion, parseJsonResponse, assertOpenAIConfigured } from './openai.service';

// pdf-parse v2 uses a class-based API
// eslint-disable-next-line @typescript-eslint/no-var-requires -- untyped access to PDFParse internals (see load() below)
const { PDFParse } = require('pdf-parse');

/**
 * Extract raw text content from a PDF file
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  await parser.load();
  const result = await parser.getText();
  return result.text;
}

/**
 * Send resume text to the OpenAI API for structured extraction
 */
export async function parseResumeWithAI(resumeText: string): Promise<Record<string, any>> {
  assertOpenAIConfigured();

  const systemPrompt = `You are a resume parser. Extract structured data from the resume text below and return ONLY valid JSON (no markdown, no explanation, no code fences). The JSON must match this exact structure:

{
  "personalInfo": {
    "firstName": "string",
    "middleName": "string or empty",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "address": {
      "street": "string",
      "city": "string",
      "state": "string",
      "country": "string",
      "zipCode": "string"
    },
    "linkedin": "string or empty",
    "github": "string or empty",
    "portfolio": "string or empty",
    "website": "string or empty"
  },
  "professionalSummary": {
    "summary": "string (2-4 sentence professional summary, max 1000 chars)",
    "yearsOfExperience": 0,
    "coreCompetencies": ["string"],
    "specialization": "string"
  },
  "workExperience": [
    {
      "company": "string",
      "position": "string",
      "location": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or null if current",
      "current": false,
      "description": "string",
      "achievements": ["string"],
      "technologies": ["string"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "location": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "gpa": null,
      "achievements": ["string"]
    }
  ],
  "skills": [
    {
      "name": "string",
      "category": "frontend|backend|database|devops|cloud|mobile|design|soft_skills|other",
      "level": "beginner|intermediate|advanced|expert",
      "yearsOfExperience": 0
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "role": "string",
      "technologies": ["string"],
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "current": false,
      "githubUrl": "string or empty",
      "demoUrl": "string or empty"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "issueDate": "YYYY-MM-DD or null",
      "expiryDate": "YYYY-MM-DD or null",
      "credentialId": "string or empty",
      "credentialUrl": "string or empty"
    }
  ],
  "additionalInfo": {
    "languages": [
      {
        "name": "string",
        "proficiency": "elementary|limited_working|professional_working|full_professional|native"
      }
    ],
    "awards": [],
    "publications": [],
    "volunteerExperience": []
  }
}

Rules:
- Extract ONLY information that is explicitly stated in the resume
- For dates, use the first day of the month if only month/year is given (e.g., "Jan 2020" → "2020-01-01")
- For skills, categorize them accurately: frontend (React, Angular, Vue, CSS, HTML), backend (Node.js, Python, Java, Go, Express), database (MongoDB, PostgreSQL, MySQL, Redis), devops (Docker, Kubernetes, CI/CD, Jenkins), cloud (AWS, Azure, GCP), mobile (React Native, Flutter, iOS, Android), design (Figma, UI/UX), soft_skills (leadership, teamwork), other (for anything else)
- For skill level, estimate based on context: expert (10+ years or lead-level), advanced (5-10 years), intermediate (2-5 years), beginner (<2 years)
- If a section has no data, use an empty array [] or null
- If a date is not in the resume, use null — never the "YYYY-MM-DD" placeholder
- Do NOT invent or guess information not in the resume
- Return ONLY the JSON object, nothing else`;

  const content = await chatCompletion({
    system: systemPrompt,
    user: `Parse this resume:\n\n${resumeText}`,
    temperature: 0.1,
    maxTokens: 8000,
    json: true
  });

  const parsed = sanitizeParsedResume(parseJsonResponse(content));

  logger.info('Resume parsed successfully via OpenAI API');

  return parsed;
}

const SKILL_CATEGORIES = ['frontend', 'backend', 'database', 'devops', 'cloud', 'mobile', 'design', 'soft_skills', 'other'];
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];
const LANGUAGE_LEVELS = ['elementary', 'limited_working', 'professional_working', 'full_professional', 'native'];
const DATE_KEYS = new Set(['startDate', 'endDate', 'issueDate', 'expiryDate', 'date', 'publishDate']);

/**
 * The model sometimes echoes template placeholders ("YYYY-MM-DD") or invents enum values
 * ("technical"); Mongoose rejects the whole profile update for either. Drop unusable dates
 * and map enums to allowed values so one bad field doesn't lose the rest of the resume.
 */
export function sanitizeParsedResume(data: Record<string, any>): Record<string, any> {
  const fixDates = (value: any): any => {
    if (Array.isArray(value)) return value.map(fixDates);
    if (!value || typeof value !== 'object') return value;

    for (const [key, v] of Object.entries(value)) {
      if (DATE_KEYS.has(key)) {
        if (typeof v === 'string' && /^(present|current|now|ongoing)$/i.test(v.trim())) {
          delete value[key];
          if (key === 'endDate') value.current = true;
        } else if (v === null || typeof v !== 'string' || isNaN(Date.parse(v))) {
          delete value[key];
        }
      } else if (v && typeof v === 'object') {
        fixDates(v);
      }
    }
    return value;
  };
  fixDates(data);

  if (Array.isArray(data.skills)) {
    data.skills = data.skills.map((s: any) => ({
      ...s,
      category: SKILL_CATEGORIES.includes(s?.category) ? s.category : 'other',
      level: SKILL_LEVELS.includes(s?.level) ? s.level : 'intermediate'
    }));
  }
  const languages = data.additionalInfo?.languages;
  if (Array.isArray(languages)) {
    data.additionalInfo.languages = languages.map((l: any) => ({
      ...l,
      proficiency: LANGUAGE_LEVELS.includes(l?.proficiency) ? l.proficiency : 'professional_working'
    }));
  }
  if (Array.isArray(data.education)) {
    // gpa is a number in the schema; drop "3.8/4.0"-style strings that won't cast
    data.education.forEach((e: any) => {
      if (e && e.gpa !== undefined && (e.gpa === null || isNaN(Number(e.gpa)))) delete e.gpa;
    });
  }
  return data;
}
