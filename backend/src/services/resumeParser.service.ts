import fs from 'fs';
import axios from 'axios';
import { logger } from '../config/logger';

// pdf-parse v2 uses a class-based API
const { PDFParse } = require('pdf-parse');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
 * Send resume text to Groq API (LLaMA) for structured extraction
 */
export async function parseResumeWithAI(resumeText: string): Promise<Record<string, any>> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured. Please add it to your .env file.');
  }

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
- Do NOT invent or guess information not in the resume
- Return ONLY the JSON object, nothing else`;

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Parse this resume:\n\n${resumeText}` }
      ],
      temperature: 0.1,
      max_tokens: 8000
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

  logger.info('Resume parsed successfully via Groq API');

  return parsed;
}
