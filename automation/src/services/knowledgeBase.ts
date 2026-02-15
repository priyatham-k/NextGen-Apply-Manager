// ─── Resume Generation Knowledge Base ────────────────────────────
// Curated data used by the NLP agent to assemble tailored resumes.

// ─── Skill Categories & Keywords ─────────────────────────────────

export interface SkillCategory {
  name: string;
  keywords: string[];
  skills: string[];
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    name: 'Frontend',
    keywords: ['frontend', 'front-end', 'ui', 'ux', 'react', 'angular', 'vue', 'svelte', 'html', 'css', 'sass', 'scss', 'tailwind', 'bootstrap', 'javascript', 'typescript', 'web', 'responsive', 'dom', 'spa', 'pwa', 'nextjs', 'next.js', 'nuxt', 'gatsby'],
    skills: ['React', 'Angular', 'Vue.js', 'TypeScript', 'JavaScript', 'HTML5', 'CSS3', 'SASS/SCSS', 'Tailwind CSS', 'Bootstrap', 'Responsive Design', 'Redux', 'Next.js', 'Webpack', 'REST APIs']
  },
  {
    name: 'Backend',
    keywords: ['backend', 'back-end', 'server', 'api', 'node', 'nodejs', 'express', 'nestjs', 'django', 'flask', 'spring', 'java', 'python', 'ruby', 'rails', 'php', 'laravel', 'golang', 'go', 'rust', '.net', 'c#', 'microservices', 'graphql', 'rest', 'grpc'],
    skills: ['Node.js', 'Express.js', 'Python', 'Django', 'Java', 'Spring Boot', 'REST API Design', 'GraphQL', 'Microservices Architecture', 'Authentication & Authorization', 'API Security', 'Server-Side Rendering']
  },
  {
    name: 'Database',
    keywords: ['database', 'sql', 'nosql', 'mongodb', 'postgres', 'postgresql', 'mysql', 'redis', 'elasticsearch', 'dynamodb', 'cassandra', 'oracle', 'sqlite', 'prisma', 'sequelize', 'mongoose', 'orm', 'data modeling'],
    skills: ['MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch', 'Database Design', 'Query Optimization', 'Data Modeling', 'ORM (Prisma/Sequelize)', 'Database Migration']
  },
  {
    name: 'Cloud & DevOps',
    keywords: ['aws', 'azure', 'gcp', 'cloud', 'docker', 'kubernetes', 'k8s', 'ci/cd', 'cicd', 'jenkins', 'terraform', 'ansible', 'devops', 'deployment', 'infrastructure', 'lambda', 's3', 'ec2', 'ecs', 'fargate', 'cloudformation', 'helm', 'serverless'],
    skills: ['AWS (EC2, S3, Lambda, ECS)', 'Docker', 'Kubernetes', 'CI/CD Pipelines', 'Terraform', 'GitHub Actions', 'Infrastructure as Code', 'Cloud Architecture', 'Serverless', 'Linux Administration']
  },
  {
    name: 'Data Science & ML',
    keywords: ['machine learning', 'ml', 'ai', 'artificial intelligence', 'data science', 'deep learning', 'nlp', 'natural language', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit', 'computer vision', 'neural network', 'model training', 'data analysis', 'analytics', 'statistics', 'regression', 'classification'],
    skills: ['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy', 'Data Analysis', 'Machine Learning', 'Deep Learning', 'Natural Language Processing', 'Statistical Modeling', 'Data Visualization']
  },
  {
    name: 'Mobile',
    keywords: ['mobile', 'ios', 'android', 'react native', 'flutter', 'swift', 'kotlin', 'xamarin', 'ionic', 'app development', 'mobile app'],
    skills: ['React Native', 'Flutter', 'iOS (Swift)', 'Android (Kotlin)', 'Mobile UI/UX', 'App Store Deployment', 'Push Notifications', 'Mobile Performance Optimization', 'Cross-Platform Development']
  },
  {
    name: 'Security',
    keywords: ['security', 'cybersecurity', 'penetration', 'vulnerability', 'encryption', 'oauth', 'jwt', 'authentication', 'authorization', 'firewall', 'compliance', 'soc', 'gdpr', 'hipaa', 'owasp'],
    skills: ['Application Security', 'OAuth 2.0 / JWT', 'OWASP Top 10', 'Vulnerability Assessment', 'Encryption', 'Security Auditing', 'Identity & Access Management', 'Compliance (GDPR/HIPAA)', 'Penetration Testing']
  },
  {
    name: 'Testing & QA',
    keywords: ['testing', 'test', 'qa', 'quality', 'jest', 'mocha', 'cypress', 'selenium', 'playwright', 'unit test', 'integration test', 'e2e', 'tdd', 'bdd', 'automation testing'],
    skills: ['Jest', 'Cypress', 'Selenium', 'Playwright', 'Unit Testing', 'Integration Testing', 'E2E Testing', 'Test-Driven Development', 'CI/CD Testing', 'Performance Testing']
  },
  {
    name: 'Project Management',
    keywords: ['agile', 'scrum', 'kanban', 'project management', 'jira', 'confluence', 'product', 'stakeholder', 'roadmap', 'sprint', 'backlog', 'product owner', 'scrum master', 'waterfall', 'lean'],
    skills: ['Agile/Scrum', 'Jira', 'Confluence', 'Sprint Planning', 'Stakeholder Management', 'Roadmap Development', 'Cross-functional Collaboration', 'Risk Management', 'OKR/KPI Tracking']
  },
  {
    name: 'Design',
    keywords: ['design', 'figma', 'sketch', 'adobe', 'photoshop', 'illustrator', 'ui/ux', 'wireframe', 'prototype', 'user research', 'accessibility', 'wcag', 'design system'],
    skills: ['Figma', 'Adobe Creative Suite', 'UI/UX Design', 'Wireframing', 'Prototyping', 'User Research', 'Design Systems', 'Accessibility (WCAG)', 'Visual Design', 'Interaction Design']
  }
];

export interface LevelPattern { level: string; years: string; keywords: string[]; }

export const LEVEL_PATTERNS: LevelPattern[] = [
  { level: 'Senior', years: '7+', keywords: ['senior', 'sr.', 'lead', 'principal', 'staff', 'architect', '7+ years', '8+ years', '10+ years', '5+ years', 'extensive experience', 'deep expertise'] },
  { level: 'Mid-Level', years: '3-5', keywords: ['mid', 'intermediate', '3+ years', '4+ years', '3-5 years', '2-4 years', 'solid experience', 'proven track record'] },
  { level: 'Junior', years: '0-2', keywords: ['junior', 'jr.', 'entry', 'associate', 'graduate', 'intern', '0-2 years', '1+ year', '1-2 years', 'new grad', 'early career', 'entry level', 'entry-level'] }
];

export const ACTION_VERBS: Record<string, string[]> = {
  development: ['Developed', 'Engineered', 'Built', 'Implemented', 'Designed', 'Created', 'Architected', 'Constructed', 'Programmed', 'Coded'],
  leadership: ['Led', 'Managed', 'Directed', 'Coordinated', 'Oversaw', 'Mentored', 'Guided', 'Supervised', 'Spearheaded', 'Championed'],
  improvement: ['Optimized', 'Improved', 'Enhanced', 'Streamlined', 'Refactored', 'Accelerated', 'Reduced', 'Increased', 'Modernized', 'Upgraded'],
  collaboration: ['Collaborated', 'Partnered', 'Facilitated', 'Contributed', 'Engaged', 'Liaised', 'Consulted', 'Integrated', 'Aligned', 'Coordinated'],
  analysis: ['Analyzed', 'Evaluated', 'Assessed', 'Investigated', 'Researched', 'Diagnosed', 'Identified', 'Discovered', 'Audited', 'Reviewed'],
  delivery: ['Delivered', 'Launched', 'Deployed', 'Released', 'Shipped', 'Executed', 'Completed', 'Published', 'Migrated', 'Transitioned']
};

export const ACHIEVEMENT_TEMPLATES: string[] = [
  '{verb} {technology} application serving {metric} users, achieving {outcome}% uptime',
  '{verb} system performance by {metric}% through {technology} optimization and caching strategies',
  '{verb} with cross-functional teams of {metric} engineers to deliver features on schedule',
  '{verb} and maintained {metric}+ RESTful APIs using {technology}, reducing response time by {outcome}%',
  '{verb} CI/CD pipelines using {technology}, reducing deployment time from hours to {metric} minutes',
  '{verb} comprehensive test suites achieving {metric}% code coverage using {technology}',
  '{verb} database queries resulting in {metric}% improvement in data retrieval performance',
  '{verb} microservices architecture handling {metric}+ requests per second using {technology}',
  '{verb} responsive UI components using {technology}, improving user engagement by {metric}%',
  '{verb} authentication and authorization system using {technology}, securing {metric}+ user accounts',
  '{verb} automated data pipeline processing {metric}+ records daily using {technology}',
  '{verb} team of {metric} developers, conducting code reviews and establishing coding standards',
  '{verb} legacy monolith into {metric} microservices, reducing deployment failures by {outcome}%',
  '{verb} real-time notification system using {technology}, delivering {metric}+ messages daily',
  '{verb} cloud infrastructure on {technology}, reducing operational costs by {metric}%',
  '{verb} A/B testing framework that increased conversion rates by {metric}%',
  '{verb} documentation and onboarding materials reducing new developer ramp-up time by {metric}%',
  '{verb} monitoring and alerting system using {technology}, reducing incident response time by {metric}%'
];

export const COMPANY_NAMES: Record<string, string[]> = {
  tech: ['TechNova Solutions', 'CloudBridge Systems', 'DataPulse Inc.', 'InnovateTech Corp', 'DigitalEdge Labs', 'NexGen Software', 'CyberVault Technologies'],
  finance: ['FinServe Global', 'CapitalStream Technologies', 'SecureBank Systems', 'PayBridge Solutions', 'WealthTech Partners'],
  healthcare: ['HealthSync Technologies', 'MedConnect Systems', 'CarePoint Digital', 'BioTech Innovations', 'HealthBridge Solutions'],
  ecommerce: ['ShopWave Technologies', 'RetailStack Inc.', 'CartGenius Solutions', 'MarketPulse Digital', 'CommercePro Systems'],
  general: ['Vertex Solutions', 'Pinnacle Technologies', 'Summit Digital', 'Horizon Systems', 'Catalyst Corp', 'Ascend Technologies', 'Vanguard Software']
};

export interface EducationTemplate { school: string; degree: string; fields: string[]; descriptions: string[]; }

export const EDUCATION_TEMPLATES: EducationTemplate[] = [
  { school: 'Georgia Institute of Technology', degree: 'Bachelor of Science', fields: ['Computer Science', 'Software Engineering', 'Information Technology'], descriptions: ['Dean\'s List, GPA: 3.8/4.0', 'Relevant coursework: Data Structures, Algorithms, Software Engineering, Database Systems'] },
  { school: 'University of California, Berkeley', degree: 'Master of Science', fields: ['Computer Science', 'Data Science', 'Artificial Intelligence'], descriptions: ['Graduate Research Assistant', 'Thesis: Scalable Distributed Systems for Real-Time Data Processing'] },
  { school: 'University of Texas at Austin', degree: 'Bachelor of Science', fields: ['Computer Engineering', 'Electrical Engineering', 'Computer Science'], descriptions: ['Magna Cum Laude, GPA: 3.7/4.0', 'Senior Capstone: Full-Stack Web Application for Campus Services'] },
  { school: 'Carnegie Mellon University', degree: 'Master of Science', fields: ['Software Engineering', 'Information Systems', 'Human-Computer Interaction'], descriptions: ['Teaching Assistant for Software Architecture', 'Published research on microservices patterns'] },
  { school: 'University of Michigan', degree: 'Bachelor of Science', fields: ['Information Science', 'Computer Science', 'Data Analytics'], descriptions: ['Dean\'s List, Honors Program', 'Relevant coursework: Machine Learning, Cloud Computing, Cybersecurity'] }
];

export const JOB_TITLE_MAP: Record<string, string[]> = {
  frontend: ['Frontend Developer', 'UI Engineer', 'Frontend Software Engineer', 'Web Developer'],
  backend: ['Backend Developer', 'Software Engineer', 'Backend Engineer', 'API Developer'],
  fullstack: ['Full Stack Developer', 'Software Engineer', 'Full Stack Engineer', 'Web Application Developer'],
  devops: ['DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer', 'Infrastructure Engineer'],
  data: ['Data Engineer', 'Data Analyst', 'Data Scientist', 'Analytics Engineer'],
  mobile: ['Mobile Developer', 'iOS Developer', 'Android Developer', 'Mobile Engineer'],
  security: ['Security Engineer', 'Application Security Engineer', 'Cybersecurity Analyst', 'Security Consultant'],
  cloud: ['Cloud Engineer', 'Cloud Architect', 'Solutions Architect', 'Cloud Infrastructure Engineer'],
  qa: ['QA Engineer', 'Test Automation Engineer', 'Quality Engineer', 'SDET'],
  management: ['Engineering Manager', 'Technical Lead', 'Team Lead', 'Development Manager'],
  design: ['UX Designer', 'UI/UX Designer', 'Product Designer', 'Design Engineer'],
  general: ['Software Developer', 'Software Engineer', 'Application Developer', 'Technology Consultant']
};

export const SUMMARY_TEMPLATES: string[] = [
  'Results-driven {title} with {years} years of experience in {domains}. Proven track record of delivering high-quality {specialty} solutions that drive business growth. Passionate about {passion} and committed to writing clean, maintainable code.',
  'Accomplished {title} with {years}+ years of expertise in {domains}. Skilled at translating complex business requirements into scalable technical solutions. Strong advocate for {passion} and continuous improvement.',
  'Detail-oriented {title} with {years} years of hands-on experience building {specialty} applications. Adept at working in fast-paced agile environments and collaborating with cross-functional teams. Focused on {passion} and delivering exceptional user experiences.',
  'Innovative {title} bringing {years} years of professional experience in {domains}. Demonstrated ability to architect and implement robust {specialty} systems. Committed to {passion} and staying current with emerging technologies.'
];

export const FIRST_NAMES = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Avery', 'Cameron', 'Quinn', 'Sage', 'Reese', 'Blake', 'Skyler', 'Dakota', 'Emery'];
export const LAST_NAMES = ['Anderson', 'Martinez', 'Thompson', 'Nakamura', 'Patel', 'Rodriguez', 'Chen', 'Williams', 'Kim', 'Johnson', 'Singh', 'Park', 'Mitchell', 'Rivera', 'Bennett'];

export const LOCATIONS = [
  'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA',
  'Denver, CO', 'Chicago, IL', 'Boston, MA', 'Portland, OR',
  'Atlanta, GA', 'Raleigh, NC', 'San Diego, CA', 'Minneapolis, MN'
];

export const METRICS = {
  users: ['10K', '50K', '100K', '500K', '1M', '2M'],
  percentage: ['15', '20', '25', '30', '35', '40', '45', '50', '60'],
  teamSize: ['3', '4', '5', '6', '8', '10', '12'],
  count: ['5', '10', '15', '20', '25', '30', '50'],
  time: ['5', '10', '15', '20', '30']
};
