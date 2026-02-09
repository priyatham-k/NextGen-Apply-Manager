# Implementation Guide

This guide will help you complete and deploy the Job Application Automation system.

## 📋 Table of Contents

1. [Project Status](#project-status)
2. [Next Steps](#next-steps)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Automation Service](#automation-service)
6. [Job Fetcher Service](#job-fetcher-service)
7. [Matching Engine](#matching-engine)
8. [Testing](#testing)
9. [Deployment](#deployment)

## ✅ Project Status

### Completed
- ✅ Project structure and organization
- ✅ Root configuration files (package.json, .env.example, .gitignore)
- ✅ Docker configuration
- ✅ Angular 18+ frontend setup with:
  - Standalone components architecture
  - Signals for reactive state
  - Modern routing with lazy loading
  - Auth, job, and application services
  - Dashboard component with modern template syntax
  - TailwindCSS configuration
- ✅ Backend Express + TypeScript setup
- ✅ Database configuration (MongoDB)
- ✅ Winston logger configuration
- ✅ User model with bcrypt authentication

### Pending Implementation
- ⏳ Remaining backend models (Job, Application, Profile)
- ⏳ All backend controllers and routes
- ⏳ Remaining Angular components (auth, jobs, applications, profile)
- ⏳ Automation service (Puppeteer)
- ⏳ Job fetcher service
- ⏳ Matching engine (AI/NLP)
- ⏳ Queue management (Bull)
- ⏳ Email notifications
- ⏳ Testing suites

## 🚀 Next Steps

### 1. Complete Backend Models

Create these Mongoose models in `backend/src/models/`:

#### Job.model.ts
```typescript
import mongoose, { Document, Schema } from 'mongoose';

export interface IJob extends Document {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary?: {
    min?: number;
    max?: number;
    currency: string;
  };
  description: string;
  requirements: string[];
  benefits?: string[];
  jobType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  applicationUrl: string;
  companyWebsite?: string;
  companyLogo?: string;
  source: string;
  sourceId: string;
  postedDate: Date;
  expiryDate?: Date;
  matchScore?: number;
  status: 'new' | 'reviewed' | 'applied' | 'rejected' | 'expired';
  userId: Schema.Types.ObjectId;
}

const jobSchema = new Schema<IJob>({
  title: { type: String, required: true, index: true },
  company: { type: String, required: true, index: true },
  location: { type: String, required: true },
  remote: { type: Boolean, default: false },
  salary: {
    min: Number,
    max: Number,
    currency: { type: String, default: 'USD' }
  },
  description: { type: String, required: true },
  requirements: [String],
  benefits: [String],
  jobType: { 
    type: String, 
    enum: ['full_time', 'part_time', 'contract', 'internship', 'freelance'],
    required: true 
  },
  experienceLevel: { 
    type: String, 
    enum: ['entry', 'mid', 'senior', 'lead', 'executive'],
    required: true 
  },
  applicationUrl: { type: String, required: true },
  companyWebsite: String,
  companyLogo: String,
  source: { type: String, required: true },
  sourceId: { type: String, required: true, unique: true },
  postedDate: { type: Date, required: true },
  expiryDate: Date,
  matchScore: { type: Number, min: 0, max: 100 },
  status: { 
    type: String, 
    enum: ['new', 'reviewed', 'applied', 'rejected', 'expired'],
    default: 'new' 
  },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

jobSchema.index({ userId: 1, matchScore: -1 });
jobSchema.index({ postedDate: -1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
```

#### Application.model.ts
```typescript
import mongoose, { Document, Schema } from 'mongoose';

export interface IApplication extends Document {
  userId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  resumeId: Schema.Types.ObjectId;
  coverLetterId?: Schema.Types.ObjectId;
  status: 'pending' | 'submitted' | 'failed' | 'in_review' | 'rejected' | 'interview_scheduled' | 'offer_received';
  appliedDate: Date;
  submissionType: 'automated' | 'manual' | 'hybrid';
  atsType?: string;
  notes?: string;
  screenshots?: string[];
  errorLog?: string;
  interviewDate?: Date;
  followUpDate?: Date;
}

const applicationSchema = new Schema<IApplication>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  resumeId: { type: Schema.Types.ObjectId, required: true },
  coverLetterId: Schema.Types.ObjectId,
  status: { 
    type: String, 
    enum: ['pending', 'submitted', 'failed', 'in_review', 'rejected', 'interview_scheduled', 'offer_received'],
    default: 'pending',
    index: true
  },
  appliedDate: { type: Date, default: Date.now },
  submissionType: { 
    type: String, 
    enum: ['automated', 'manual', 'hybrid'],
    required: true 
  },
  atsType: String,
  notes: String,
  screenshots: [String],
  errorLog: String,
  interviewDate: Date,
  followUpDate: Date
}, { timestamps: true });

applicationSchema.index({ userId: 1, status: 1 });
applicationSchema.index({ appliedDate: -1 });

export const Application = mongoose.model<IApplication>('Application', applicationSchema);
```

#### Profile.model.ts
```typescript
// Create a comprehensive profile model following the TypeScript interface
// defined in frontend/src/app/models/index.ts
```

### 2. Complete Backend Controllers

Create controllers in `backend/src/controllers/`:

#### auth.controller.ts
```typescript
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.model';
import { logger } from '../config/logger';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName
    });
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.status(201).json({
      success: true,
      data: {
        user,
        token
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Find user with password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    // Remove password from response
    const userObject = user.toJSON();
    
    res.json({
      success: true,
      data: {
        user: userObject,
        token
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};
```

#### Similar controllers for:
- `job.controller.ts` - CRUD operations for jobs
- `application.controller.ts` - Application management
- `profile.controller.ts` - User profile management
- `analytics.controller.ts` - Stats and analytics

### 3. Complete Backend Routes

Create route files in `backend/src/routes/`:

#### auth.routes.ts
```typescript
import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';

const router = Router();

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    validate
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate
  ],
  login
);

export default router;
```

### 4. Create Middleware

In `backend/src/middleware/`:

#### auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};
```

#### errorHandler.ts
#### notFoundHandler.ts
#### validate.ts (for express-validator)

### 5. Complete Frontend Components

Create remaining components using the dashboard as a template:

- Login/Register components
- Job list and detail components
- Application list and detail components
- Profile component
- Analytics component

All should use:
- Standalone components
- Signals for state
- New control flow syntax (@if, @for, @switch)
- Angular Material + TailwindCSS

### 6. Automation Service

In `automation/src/`:

#### index.ts
```typescript
import puppeteer from 'puppeteer';
import { ATSDetector } from './utils/ats-detector';
import { WorkdayApplier } from './appliers/workday';
import { GreenhouseApplier } from './appliers/greenhouse';
// ... other appliers

export class ApplicationBot {
  async applyToJob(job: any, userData: any) {
    const browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS === 'true',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
      // Navigate to application URL
      await page.goto(job.applicationUrl, { waitUntil: 'networkidle2' });
      
      // Detect ATS type
      const atsType = await ATSDetector.detect(page);
      
      // Select appropriate applier
      let applier;
      switch (atsType) {
        case 'workday':
          applier = new WorkdayApplier();
          break;
        case 'greenhouse':
          applier = new GreenhouseApplier();
          break;
        // ... other cases
        default:
          applier = new GenericApplier();
      }
      
      // Fill and submit application
      await applier.apply(page, userData);
      
      // Take screenshot
      await page.screenshot({ 
        path: `./screenshots/${job.id}.png`,
        fullPage: true 
      });
      
      return { success: true, atsType };
    } catch (error) {
      logger.error('Application failed:', error);
      return { success: false, error: error.message };
    } finally {
      await browser.close();
    }
  }
}
```

### 7. Job Fetcher Service

In `job-fetcher/src/apis/`:

#### jsearch.ts
```typescript
import axios from 'axios';

export class JSearchAPI {
  private apiKey: string;
  
  constructor() {
    this.apiKey = process.env.JSEARCH_API_KEY!;
  }
  
  async searchJobs(query: string, location?: string) {
    const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: {
        query: `${query} ${location || ''}`,
        page: '1',
        num_pages: '1'
      },
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    });
    
    return response.data.data;
  }
}
```

### 8. Matching Engine

In `matching-engine/src/`:

#### matcher/algorithm.ts
```typescript
import OpenAI from 'openai';

export class JobMatcher {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async calculateMatchScore(jobDescription: string, resume: string): Promise<number> {
    const prompt = `
      Compare this job description with the candidate's resume and provide a match score from 0-100.
      
      Job Description:
      ${jobDescription}
      
      Resume:
      ${resume}
      
      Respond with ONLY a number between 0 and 100.
    `;
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10
    });
    
    const score = parseInt(response.choices[0].message.content || '0');
    return Math.min(100, Math.max(0, score));
  }
}
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
ng test
```

### E2E Tests
```bash
cd frontend
ng e2e
```

## 🚀 Deployment

### Local Development
```bash
# Start all services
npm run dev
```

### Docker Deployment
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f
```

### AWS Deployment

1. **Deploy Lambda (Job Fetcher)**
   - Package the job-fetcher service
   - Deploy to AWS Lambda
   - Set up EventBridge for scheduling

2. **Deploy ECS (Backend & Automation)**
   - Build Docker images
   - Push to ECR
   - Deploy ECS services

3. **Deploy Frontend**
   - Build production
   - Deploy to S3
   - Configure CloudFront

## 📝 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [Angular Documentation](https://angular.dev/)
- [Puppeteer Documentation](https://pptr.dev/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [AWS Documentation](https://docs.aws.amazon.com/)

## 🤝 Need Help?

Refer to the main README.md for troubleshooting common issues.
