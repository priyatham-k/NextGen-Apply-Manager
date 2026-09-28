import natural from 'natural';
import axios from 'axios';
import { logger } from '../logger';
import {
  SKILL_CATEGORIES, LEVEL_PATTERNS, ACTION_VERBS, ACHIEVEMENT_TEMPLATES,
  COMPANY_NAMES, EDUCATION_TEMPLATES, JOB_TITLE_MAP, SUMMARY_TEMPLATES,
  FIRST_NAMES, LAST_NAMES, LOCATIONS, METRICS,
  SkillCategory
} from './knowledgeBase';

// ─── Types ───────────────────────────────────────────────────────

export interface ResumeTemplateData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  summary: string;
  experiences: {
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
    description: string;
  }[];
  skills: string[];
}

export interface UserProfile {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
  summary?: string;
  yearsOfExperience?: number;
  specialization?: string;
  experiences?: Array<{
    company: string;
    position: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current: boolean;
    description?: string;
    achievements?: string[];
    technologies?: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
    gpa?: number;
  }>;
  skills?: Array<{
    name: string;
    category: string;
    level: string;
  }>;
  certifications?: Array<{
    name: string;
    issuer: string;
    issueDate?: string;
  }>;
}

interface JobAnalysis {
  detectedTitle: string;
  domain: string;
  experienceLevel: string;
  yearsRange: string;
  matchedCategories: SkillCategory[];
  extractedKeywords: string[];
  detectedTechnologies: string[];
  industry: string;
}

// ─── Utilities ───────────────────────────────────────────────────

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPicks<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDateStr(date: string | Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatExpDescription(exp: { description?: string; achievements?: string[] }): string {
  const bullets: string[] = [];

  if (exp.description) {
    const desc = exp.description.trim();
    const lines = desc.split('\n').map(l => l.trim()).filter(Boolean);
    const alreadyBullets = lines.some(l => l.startsWith('•') || l.startsWith('-'));
    if (alreadyBullets) {
      bullets.push(...lines.map(l => (l.startsWith('•') || l.startsWith('-')) ? l : `• ${l}`));
    } else {
      // Convert paragraph into sentence-level bullet points
      const sentences = desc.match(/[^.!?]+[.!?]+/g) || [desc];
      bullets.push(...sentences.map(s => `• ${s.trim()}`).filter(b => b.length > 4));
    }
  }

  if (exp.achievements && exp.achievements.length > 0) {
    bullets.push(...exp.achievements.map(a => a.startsWith('•') ? a : `• ${a}`));
  }

  return bullets.join('\n');
}

// ─── Step 1: Analyze Job Description ─────────────────────────────

function analyzeJobDescription(jobDescription: string): JobAnalysis {
  logger.info('Agent Step 1: Analyzing job description with NLP...');

  const lowerText = jobDescription.toLowerCase();
  const _tokens = tokenizer.tokenize(lowerText) || [];

  let experienceLevel = 'Mid-Level';
  let yearsRange = '3-5';
  for (const pattern of LEVEL_PATTERNS) {
    if (pattern.keywords.some(kw => lowerText.includes(kw))) {
      experienceLevel = pattern.level;
      yearsRange = pattern.years;
      break;
    }
  }

  const categoryScores: { cat: SkillCategory; score: number }[] = [];
  for (const category of SKILL_CATEGORIES) {
    const matchCount = category.keywords.filter(kw => lowerText.includes(kw)).length;
    if (matchCount > 0) categoryScores.push({ cat: category, score: matchCount });
  }
  categoryScores.sort((a, b) => b.score - a.score);
  const matchedCategories = categoryScores.slice(0, 4).map(cs => cs.cat);
  if (matchedCategories.length === 0) matchedCategories.push(SKILL_CATEGORIES[0], SKILL_CATEGORIES[1]);

  let domain = 'general';
  const domainKeywords: Record<string, string[]> = {
    frontend: ['frontend', 'front-end', 'react', 'angular', 'vue', 'ui', 'ux', 'css', 'html'],
    backend: ['backend', 'back-end', 'server', 'api', 'node', 'django', 'spring', 'microservices'],
    fullstack: ['full stack', 'fullstack', 'full-stack', 'mern', 'mean'],
    devops: ['devops', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'sre'],
    data: ['data science', 'machine learning', 'data engineer', 'analytics', 'ml', 'ai'],
    mobile: ['mobile', 'ios', 'android', 'react native', 'flutter'],
    security: ['security', 'cybersecurity', 'penetration', 'owasp'],
    cloud: ['cloud', 'aws', 'azure', 'gcp', 'solutions architect'],
    qa: ['qa', 'testing', 'quality assurance', 'test automation', 'sdet'],
    management: ['engineering manager', 'tech lead', 'team lead', 'director of engineering'],
    design: ['ux design', 'ui design', 'product design', 'figma']
  };
  const domainScores: Record<string, number> = {};
  for (const [d, keywords] of Object.entries(domainKeywords)) {
    domainScores[d] = keywords.filter(kw => lowerText.includes(kw)).length;
  }
  const topDomain = Object.entries(domainScores).sort((a, b) => b[1] - a[1])[0];
  if (topDomain && topDomain[1] > 0) domain = topDomain[0];

  const tfidf = new TfIdf();
  tfidf.addDocument(jobDescription);
  const stopwords = new Set(['the', 'and', 'for', 'with', 'you', 'our', 'will', 'are', 'have', 'this', 'that', 'from', 'your', 'can', 'about', 'more', 'what', 'who', 'how', 'been', 'were', 'able', 'must', 'should', 'would', 'could']);
  const extractedKeywords: string[] = [];
  tfidf.listTerms(0).slice(0, 30).forEach((item: { term: string }) => {
    if (item.term.length > 2 && !stopwords.has(item.term)) extractedKeywords.push(item.term);
  });

  const techPatterns = [
    'react', 'angular', 'vue', 'node.js', 'nodejs', 'express', 'django', 'flask',
    'spring', 'java', 'python', 'typescript', 'javascript', 'go', 'golang', 'rust',
    'c#', '.net', 'ruby', 'rails', 'php', 'laravel', 'swift', 'kotlin',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
    'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
    'graphql', 'rest', 'grpc', 'kafka', 'rabbitmq',
    'jenkins', 'github actions', 'circleci', 'gitlab',
    'jest', 'cypress', 'selenium', 'playwright',
    'figma', 'sketch', 'storybook',
    'tensorflow', 'pytorch', 'pandas', 'scikit-learn',
    'react native', 'flutter', 'next.js', 'nuxt', 'svelte',
    'tailwind', 'bootstrap', 'material ui', 'sass', 'scss'
  ];
  const detectedTechnologies = techPatterns.filter(tech => lowerText.includes(tech));

  let industry = 'tech';
  const industryKeywords: Record<string, string[]> = {
    finance: ['fintech', 'financial', 'banking', 'payment', 'trading', 'investment', 'insurance'],
    healthcare: ['healthcare', 'health', 'medical', 'clinical', 'patient', 'pharma', 'biotech'],
    ecommerce: ['ecommerce', 'e-commerce', 'retail', 'marketplace', 'shopping', 'commerce'],
    tech: ['saas', 'platform', 'software', 'tech', 'startup', 'product']
  };
  for (const [ind, kws] of Object.entries(industryKeywords)) {
    if (kws.some(kw => lowerText.includes(kw))) { industry = ind; break; }
  }

  let detectedTitle = 'Software Developer';
  const titlePatterns = [
    { pattern: /(?:senior|sr\.?)\s+(\w+\s+\w+(?:\s+\w+)?)/i, prefix: 'Senior ' },
    { pattern: /(?:junior|jr\.?)\s+(\w+\s+\w+(?:\s+\w+)?)/i, prefix: 'Junior ' },
    { pattern: /(?:lead)\s+(\w+\s+\w+(?:\s+\w+)?)/i, prefix: 'Lead ' },
    { pattern: /(?:staff)\s+(\w+\s+\w+(?:\s+\w+)?)/i, prefix: 'Staff ' }
  ];
  for (const tp of titlePatterns) {
    const match = jobDescription.match(tp.pattern);
    if (match) { detectedTitle = tp.prefix + match[1].replace(/\b\w/g, c => c.toUpperCase()); break; }
  }
  if (detectedTitle === 'Software Developer' && JOB_TITLE_MAP[domain]) detectedTitle = JOB_TITLE_MAP[domain][0];

  logger.info(`Step 1 complete: "${detectedTitle}" (${experienceLevel}), domain=${domain}, ${matchedCategories.length} categories, ${detectedTechnologies.length} technologies`);

  return { detectedTitle, domain, experienceLevel, yearsRange, matchedCategories, extractedKeywords, detectedTechnologies, industry };
}

// ─── Step 2: Assemble Resume Content ─────────────────────────────

function assembleResumeContent(analysis: JobAnalysis, userProfile?: UserProfile): ResumeTemplateData {
  logger.info('Agent Step 2: Assembling tailored resume content...');

  // ── Contact Info: prefer real, fallback to generated ──
  const firstName = userProfile?.firstName || randomPick(FIRST_NAMES);
  const middleName = userProfile?.middleName || '';
  const lastName = userProfile?.lastName || randomPick(LAST_NAMES);
  const fullName = middleName ? `${firstName} ${middleName} ${lastName}` : `${firstName} ${lastName}`;
  const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;

  const email = userProfile?.email || `${username}@email.com`;
  const phone = userProfile?.phone || `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${randomInt(1000, 9999)}`;
  const location = userProfile?.location || randomPick(LOCATIONS);
  const linkedin = userProfile?.linkedin || `https://linkedin.com/in/${username}`;
  const github = userProfile?.github || `https://github.com/${username}`;
  const website = userProfile?.website || userProfile?.portfolio || '';

  // ── Skills: use real profile skills + supplement with job-matched ──
  let skills: string[];
  if (userProfile?.skills && userProfile.skills.length > 0) {
    skills = userProfile.skills.map(s => s.name);
    // Add job-matched technologies not already in the user's skills
    for (const tech of analysis.detectedTechnologies) {
      const techTitle = tech.replace(/\b\w/g, c => c.toUpperCase());
      if (!skills.some(s => s.toLowerCase() === tech.toLowerCase())) skills.push(techTitle);
    }
  } else {
    const allSkills: string[] = [];
    for (const cat of analysis.matchedCategories) allSkills.push(...cat.skills);
    for (const tech of analysis.detectedTechnologies) {
      const techTitle = tech.replace(/\b\w/g, c => c.toUpperCase());
      if (!allSkills.some(s => s.toLowerCase() === tech.toLowerCase())) allSkills.push(techTitle);
    }
    skills = randomPicks([...new Set(allSkills)], randomInt(10, 14));
  }

  // ── Summary: use real or generate ──
  let summary: string;
  if (userProfile?.summary) {
    summary = userProfile.summary;
  } else {
    const domainNames = analysis.matchedCategories.map(c => c.name).slice(0, 3).join(', ');
    const specialtyMap: Record<string, string> = {
      fullstack: 'full-stack web', frontend: 'frontend', backend: 'backend',
      data: 'data-driven', mobile: 'mobile', devops: 'cloud infrastructure',
      cloud: 'cloud-native', security: 'secure', qa: 'quality-focused'
    };
    const specialty = userProfile?.specialization || specialtyMap[analysis.domain] || 'software';
    const passions = ['best practices and clean architecture', 'developer experience and code quality', 'scalable systems and performance optimization', 'user-centric design and accessibility', 'automation and continuous delivery', 'mentoring junior developers and knowledge sharing'];
    const years = userProfile?.yearsOfExperience ? String(userProfile.yearsOfExperience)
      : analysis.yearsRange === '7+' ? String(randomInt(7, 12))
      : analysis.yearsRange === '3-5' ? String(randomInt(3, 6))
      : String(randomInt(1, 2));

    summary = randomPick(SUMMARY_TEMPLATES)
      .replace('{title}', analysis.detectedTitle).replace('{years}', years)
      .replace('{domains}', domainNames).replace('{specialty}', specialty)
      .replace('{passion}', randomPick(passions));
  }

  // ── Work Experience: use real or generate ──
  let experiences: { company: string; position: string; startDate: string; endDate: string; current: boolean; description: string }[];
  if (userProfile?.experiences && userProfile.experiences.length > 0) {
    experiences = userProfile.experiences.map(exp => ({
      company: exp.company,
      position: exp.position,
      startDate: formatDateStr(exp.startDate),
      endDate: exp.current ? '' : formatDateStr(exp.endDate),
      current: exp.current,
      description: formatExpDescription(exp)
    }));
  } else {
    experiences = [];
    const numExp = analysis.experienceLevel === 'Senior' ? randomInt(3, 4) : analysis.experienceLevel === 'Mid-Level' ? randomInt(2, 3) : randomInt(1, 2);
    const companies = COMPANY_NAMES[analysis.industry] || COMPANY_NAMES.general;
    const usedCompanies = randomPicks(companies, numExp);
    const titles = JOB_TITLE_MAP[analysis.domain] || JOB_TITLE_MAP.general;
    const currentYear = new Date().getFullYear();
    const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let endYear = currentYear;
    const verbCategories = Object.keys(ACTION_VERBS);

    for (let i = 0; i < numExp; i++) {
      const isCurrent = i === 0;
      const duration = randomInt(1, 3);
      const startYear = isCurrent ? currentYear - duration : endYear - duration;
      const bullets: string[] = [];
      for (let b = 0; b < randomInt(5, 6); b++) {
        const template = randomPick(ACHIEVEMENT_TEMPLATES);
        const verb = randomPick(ACTION_VERBS[verbCategories[b % verbCategories.length]]);
        const tech = skills.length > 0 ? randomPick(skills) : 'modern technologies';
        bullets.push('• ' + template.replace('{verb}', verb).replace('{technology}', tech).replace('{metric}', randomPick(METRICS.percentage)).replace('{outcome}', randomPick(METRICS.percentage)));
      }
      experiences.push({
        company: usedCompanies[i] || randomPick(COMPANY_NAMES.general),
        position: i === 0 ? analysis.detectedTitle : (titles[Math.min(i, titles.length - 1)] || randomPick(titles)),
        startDate: `${randomPick(allMonths)} ${startYear}`,
        endDate: isCurrent ? '' : `${randomPick(allMonths)} ${endYear}`,
        current: isCurrent,
        description: bullets.join('\n')
      });
      endYear = startYear;
    }
  }

  // ── Education: use real or generate ──
  let education: { school: string; degree: string; field: string; startDate: string; endDate: string; description: string }[];
  if (userProfile?.education && userProfile.education.length > 0) {
    education = userProfile.education.map(edu => ({
      school: edu.institution,
      degree: edu.degree,
      field: edu.field || '',
      startDate: edu.startDate ? String(new Date(edu.startDate).getFullYear()) : '',
      endDate: edu.endDate ? String(new Date(edu.endDate).getFullYear()) : '',
      description: edu.gpa ? `GPA: ${edu.gpa}` : ''
    }));
  } else {
    const years = userProfile?.yearsOfExperience ? String(userProfile.yearsOfExperience) : analysis.yearsRange === '7+' ? String(randomInt(7, 12)) : String(randomInt(3, 6));
    const currentYear = new Date().getFullYear();
    const eduTemplate = randomPick(EDUCATION_TEMPLATES);
    const isSenior = analysis.experienceLevel === 'Senior';
    const degree = isSenior ? 'Master of Science' : eduTemplate.degree;
    const gradYear = currentYear - parseInt(years) - (isSenior ? 6 : 4);
    education = [{ school: eduTemplate.school, degree, field: randomPick(eduTemplate.fields), startDate: String(gradYear - (degree.includes('Master') ? 2 : 4)), endDate: String(gradYear), description: randomPick(eduTemplate.descriptions) }];
    if (isSenior && EDUCATION_TEMPLATES.length > 1) {
      const bsTemplate = EDUCATION_TEMPLATES.find(e => e !== eduTemplate) || EDUCATION_TEMPLATES[1];
      education.push({ school: bsTemplate.school, degree: 'Bachelor of Science', field: randomPick(bsTemplate.fields), startDate: String(gradYear - 6), endDate: String(gradYear - 2), description: randomPick(bsTemplate.descriptions) });
    }
  }

  logger.info(`Step 2 complete: ${experiences.length} experiences, ${education.length} education, ${skills.length} skills (profile data: ${userProfile?.experiences ? 'real' : 'generated'})`);

  return { fullName, email, phone, location, linkedin, github, website, summary, experiences, education, skills };
}

// ─── Step 3: Validate ────────────────────────────────────────────

function validateAndPolish(data: ResumeTemplateData): ResumeTemplateData {
  logger.info('Agent Step 3: Final validation...');
  if (!data.fullName) data.fullName = 'Alex Johnson';
  if (!data.summary) data.summary = 'Experienced software professional with a strong track record.';
  if (!data.skills || data.skills.length === 0) data.skills = ['JavaScript', 'TypeScript', 'Problem Solving'];
  data.skills = [...new Set(data.skills)];
  logger.info('Step 3 complete: Resume validated');
  return data;
}

// ─── Groq AI Resume Generation ───────────────────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function buildProfileContext(userProfile: UserProfile): string {
  const lines: string[] = [];

  lines.push(`Name: ${userProfile.firstName}${userProfile.middleName ? ' ' + userProfile.middleName : ''} ${userProfile.lastName}`);
  lines.push(`Email: ${userProfile.email}`);
  if (userProfile.phone) lines.push(`Phone: ${userProfile.phone}`);
  if (userProfile.location) lines.push(`Location: ${userProfile.location}`);
  if (userProfile.linkedin) lines.push(`LinkedIn: ${userProfile.linkedin}`);
  if (userProfile.github) lines.push(`GitHub: ${userProfile.github}`);
  if (userProfile.website || userProfile.portfolio) lines.push(`Website: ${userProfile.website || userProfile.portfolio}`);
  if (userProfile.yearsOfExperience) lines.push(`Years of Experience: ${userProfile.yearsOfExperience}`);
  if (userProfile.summary) lines.push(`\nCurrent Summary:\n${userProfile.summary}`);

  if (userProfile.skills && userProfile.skills.length > 0) {
    lines.push(`\nSkills:\n${userProfile.skills.map(s => `- ${s.name} (${s.level})`).join('\n')}`);
  }

  if (userProfile.experiences && userProfile.experiences.length > 0) {
    lines.push('\nWork Experience:');
    userProfile.experiences.forEach(exp => {
      lines.push(`\n  ${exp.position} at ${exp.company}${exp.location ? `, ${exp.location}` : ''}`);
      lines.push(`  ${exp.startDate || ''} - ${exp.current ? 'Present' : (exp.endDate || '')}`);
      if (exp.description) lines.push(`  Description: ${exp.description}`);
      if (exp.achievements && exp.achievements.length > 0) {
        lines.push(`  Achievements: ${exp.achievements.join('; ')}`);
      }
      if (exp.technologies && exp.technologies.length > 0) {
        lines.push(`  Technologies: ${exp.technologies.join(', ')}`);
      }
    });
  }

  if (userProfile.education && userProfile.education.length > 0) {
    lines.push('\nEducation:');
    userProfile.education.forEach(edu => {
      lines.push(`  ${edu.degree}${edu.field ? ' in ' + edu.field : ''} — ${edu.institution}`);
      lines.push(`  ${edu.startDate || ''} - ${edu.endDate || ''}`);
      if (edu.gpa) lines.push(`  GPA: ${edu.gpa}`);
    });
  }

  if (userProfile.certifications && userProfile.certifications.length > 0) {
    lines.push('\nCertifications:');
    userProfile.certifications.forEach(cert => {
      lines.push(`  ${cert.name} — ${cert.issuer}${cert.issueDate ? ' (' + cert.issueDate + ')' : ''}`);
    });
  }

  return lines.join('\n');
}

async function generateResumeWithGroq(jobDescription: string, userProfile: UserProfile): Promise<ResumeTemplateData> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const profileContext = buildProfileContext(userProfile);

  const systemPrompt = `You are an expert resume writer specializing in ATS-optimized, results-driven resumes.
Your task is to create a tailored, professional resume that closely matches the given job description.
Respond ONLY with valid JSON — no markdown, no explanation, no code blocks.`;

  const userPrompt = `Job Description:
${jobDescription}

---
Candidate Profile:
${profileContext}

---
Generate a tailored resume as a JSON object with this exact structure:
{
  "fullName": "candidate full name",
  "email": "email",
  "phone": "phone",
  "location": "city, country",
  "linkedin": "linkedin url or empty string",
  "github": "github url or empty string",
  "website": "website url or empty string",
  "summary": "3-4 concise bullet points separated by newlines (\\n), each starting with a strong keyword, tightly tailored to the job description",
  "experiences": [
    {
      "company": "Company Name",
      "position": "Job Title",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or empty string if current",
      "current": false,
      "description": "Action verb + achievement with metric\nAction verb + achievement with metric\nAction verb + achievement with metric\nAction verb + achievement with metric\nAction verb + achievement with metric"
    }
  ],
  "education": [
    {
      "school": "Institution Name",
      "degree": "Degree Type",
      "field": "Field of Study",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "description": "GPA or honors if available, else empty string"
    }
  ],
  "skills": ["Skill1", "Skill2", "Skill3"]
}

Rules:
- Use ALL real data from the candidate profile — do not invent companies, schools, or credentials
- Write 5-6 bullet points per experience role in the description field, separated by newlines (\\n)
- Each bullet must start with a strong action verb (Led, Built, Reduced, Increased, Designed, etc.)
- Include quantifiable results wherever possible (percentages, dollar amounts, user counts, time saved)
- Tailor the skills list to prioritize what the job description requires
- The summary must be 3-4 bullet points separated by \\n, each addressing the role, seniority, or key requirements (e.g. "5+ years of full-stack experience with React and Node.js")
- Dates must be in "Mon YYYY" format for experience (e.g., "Jan 2022"), YYYY only for education
- Return only the JSON object, nothing else`;

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
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
  if (!content) throw new Error('No content returned from Groq');

  // Strip markdown code blocks if Groq wraps the JSON
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate required fields exist
  if (!parsed.fullName || !parsed.experiences || !parsed.skills) {
    throw new Error('Groq returned incomplete resume data');
  }

  return parsed as ResumeTemplateData;
}

// ─── Main Entry ──────────────────────────────────────────────────

export async function generateResumeFromJobDescription(jobDescription: string, userProfile?: UserProfile): Promise<ResumeTemplateData> {
  logger.info('=== Resume Generation Started ===');

  // Try Groq AI first if profile is available
  if (userProfile && process.env.GROQ_API_KEY) {
    try {
      logger.info('Using Groq AI for resume generation...');
      const result = await generateResumeWithGroq(jobDescription, userProfile);
      logger.info('=== Groq AI Resume Generation Complete ===');
      return validateAndPolish(result);
    } catch (err: any) {
      logger.warn(`Groq AI failed, falling back to NLP: ${err.message}`);
    }
  }

  // Fallback: local NLP
  logger.info('Using local NLP for resume generation...');
  const analysis = analyzeJobDescription(jobDescription);
  const resume = assembleResumeContent(analysis, userProfile);
  const polished = validateAndPolish(resume);
  logger.info('=== NLP Resume Generation Complete ===');
  return polished;
}
