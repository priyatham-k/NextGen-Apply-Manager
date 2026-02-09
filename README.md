# Job Application Automation System

A fully automated job application system that fetches job postings, matches them with your resume using AI, and automatically applies to relevant positions.

## 🚀 Features

- **Automated Job Fetching**: Fetches jobs from multiple APIs (JSearch, Adzuna, etc.)
- **AI-Powered Matching**: Uses NLP to match job descriptions with your resume
- **Automated Applications**: Uses Puppeteer to fill and submit applications on company portals
- **Smart Tracking**: Dashboard to monitor all applications and their status
- **CAPTCHA Solving**: Integration with 2captcha for automated CAPTCHA solving
- **Multi-ATS Support**: Works with Workday, Greenhouse, Lever, and custom application forms

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│         Frontend (Angular 18+)                  │
│  - Signals, Standalone Components              │
│  - Modern Control Flow (@if, @for)             │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│         Backend API (Node.js + Express)         │
│  - RESTful API, Authentication                  │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌──────▼────────┐
│  Job Fetcher │ │ Matching  │ │ Auto Applier  │
│  (Scheduler) │ │  Engine   │ │  (Puppeteer)  │
└──────────────┘ └───────────┘ └───────────────┘
```

## 📦 Tech Stack

### Frontend
- **Angular 18+** with standalone components
- **Angular Signals** for reactive state management
- **Angular Material 18** for UI components
- **TailwindCSS** for styling
- **Chart.js** for analytics

### Backend
- **Node.js 20+** with Express
- **TypeScript** for type safety
- **MongoDB** with Mongoose
- **JWT** for authentication
- **Bull** for job queues

### Automation
- **Puppeteer** for browser automation
- **2captcha** API for CAPTCHA solving
- **OpenAI API** for AI matching (or AWS Comprehend)

### Infrastructure
- **AWS Lambda** for scheduled job fetching
- **AWS ECS/Fargate** for Puppeteer automation
- **AWS S3** for resume storage
- **Docker** for containerization

## 📁 Project Structure

```
job-application-automation/
├── frontend/                      # Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/             # Core services, guards, interceptors
│   │   │   ├── features/         # Feature modules
│   │   │   │   ├── dashboard/    # Dashboard components
│   │   │   │   ├── jobs/         # Job listing and details
│   │   │   │   ├── applications/ # Application tracking
│   │   │   │   ├── profile/      # User profile management
│   │   │   │   └── analytics/    # Analytics and reports
│   │   │   ├── shared/           # Shared components, directives, pipes
│   │   │   └── models/           # TypeScript interfaces
│   │   └── assets/
│   ├── angular.json
│   ├── package.json
│   └── tailwind.config.js
│
├── backend/                       # Node.js API server
│   ├── src/
│   │   ├── controllers/          # API controllers
│   │   ├── models/               # MongoDB models
│   │   ├── routes/               # Express routes
│   │   ├── middleware/           # Custom middleware
│   │   ├── services/             # Business logic
│   │   ├── config/               # Configuration
│   │   └── server.ts             # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── automation/                    # Puppeteer automation
│   ├── src/
│   │   ├── appliers/             # ATS-specific appliers
│   │   │   ├── workday.ts
│   │   │   ├── greenhouse.ts
│   │   │   ├── lever.ts
│   │   │   └── generic.ts
│   │   ├── captcha/              # CAPTCHA solving
│   │   ├── utils/                # Helper functions
│   │   └── index.ts
│   └── package.json
│
├── job-fetcher/                   # Job fetching service
│   ├── src/
│   │   ├── apis/                 # API integrations
│   │   │   ├── jsearch.ts
│   │   │   ├── adzuna.ts
│   │   │   └── remotive.ts
│   │   ├── scheduler.ts          # Cron jobs
│   │   └── index.ts
│   └── package.json
│
├── matching-engine/               # AI matching service
│   ├── src/
│   │   ├── parsers/              # Resume and JD parsers
│   │   ├── matcher/              # Matching algorithms
│   │   ├── openai-service.ts    # OpenAI integration
│   │   └── index.ts
│   └── package.json
│
├── shared/                        # Shared types and utilities
│   ├── types/
│   └── utils/
│
├── infrastructure/                # AWS and deployment
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.automation
│   │   └── docker-compose.yml
│   ├── aws/
│   │   ├── lambda/
│   │   └── ecs/
│   └── k8s/                      # Kubernetes configs (optional)
│
├── .env.example
├── .gitignore
├── package.json                   # Root package.json for scripts
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 7+
- Docker & Docker Compose
- AWS Account (for deployment)
- API Keys:
  - JSearch API (RapidAPI)
  - Adzuna API
  - OpenAI API
  - 2captcha API

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd job-application-automation
```

2. **Install dependencies**
```bash
# Install all dependencies
npm run install:all

# Or install individually
cd frontend && npm install
cd ../backend && npm install
cd ../automation && npm install
cd ../job-fetcher && npm install
cd ../matching-engine && npm install
```

3. **Environment Configuration**
```bash
# Copy example environment files
cp .env.example .env

# Configure your API keys and settings
# Edit .env with your credentials
```

4. **Database Setup**
```bash
# Start MongoDB with Docker
docker-compose up -d mongodb

# Run migrations
npm run db:migrate
```

5. **Start Development Servers**
```bash
# Start all services
npm run dev

# Or start individually
npm run dev:frontend   # Angular dev server (http://localhost:4200)
npm run dev:backend    # API server (http://localhost:3000)
npm run dev:fetcher    # Job fetcher service
npm run dev:automation # Automation service
```

## 📝 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/job-automation
MONGODB_TEST_URI=mongodb://localhost:27017/job-automation-test

# API Server
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key-here

# Job APIs
JSEARCH_API_KEY=your-jsearch-api-key
ADZUNA_APP_ID=your-adzuna-app-id
ADZUNA_API_KEY=your-adzuna-api-key
REMOTIVE_API_KEY=your-remotive-api-key

# AI Services
OPENAI_API_KEY=your-openai-api-key
# OR use AWS Comprehend
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# CAPTCHA
CAPTCHA_API_KEY=your-2captcha-api-key

# AWS (for production)
AWS_S3_BUCKET=your-s3-bucket-name
AWS_LAMBDA_ROLE=your-lambda-role-arn

# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-email-password

# Frontend URL
FRONTEND_URL=http://localhost:4200
```

### User Profile Configuration

Before running the automation, set up your profile in the dashboard:

1. Navigate to Profile section
2. Upload your resume(s)
3. Fill in personal information
4. Add work experience
5. Configure job preferences (location, salary, remote, etc.)
6. Set matching threshold (minimum match score to auto-apply)

## 🎯 Usage

### 1. Job Fetching

Jobs are automatically fetched every 6 hours. You can also manually trigger:

```bash
npm run fetch:jobs
```

### 2. Manual Job Search

Use the dashboard to:
- Search for specific jobs
- Filter by location, salary, company
- View match scores
- Mark jobs as favorites

### 3. Automated Applications

The system automatically applies to jobs with match score > 70% (configurable).

Monitor applications in the dashboard:
- Pending applications
- Successful submissions
- Failed attempts (with error logs)
- Application screenshots

### 4. Analytics

View insights:
- Total applications sent
- Success rate
- Match score distribution
- Top companies applied to
- Application timeline

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific services
npm run test:frontend
npm run test:backend
npm run test:automation

# E2E tests
npm run test:e2e
```

## 🚢 Deployment

### Docker Deployment

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### AWS Deployment

1. **Deploy Lambda Functions** (Job Fetcher)
```bash
cd infrastructure/aws/lambda
./deploy-lambda.sh
```

2. **Deploy ECS Services** (Backend & Automation)
```bash
cd infrastructure/aws/ecs
./deploy-ecs.sh
```

3. **Deploy Frontend** (S3 + CloudFront)
```bash
cd frontend
npm run build:prod
aws s3 sync dist/job-automation s3://your-bucket-name
```

## 🔒 Security Considerations

⚠️ **Important Legal & Ethical Notes:**

1. **Terms of Service**: Automated applications may violate some platforms' ToS
2. **Rate Limiting**: Implement delays between applications to avoid bans
3. **Data Privacy**: Securely store personal information and API keys
4. **CAPTCHA**: Use 2captcha responsibly and within their terms
5. **Quality Over Quantity**: Set high match thresholds to ensure relevant applications

## 🛠️ Advanced Configuration

### Custom ATS Support

Add support for new ATS platforms:

1. Create new applier in `automation/src/appliers/`
2. Implement the `ATSApplier` interface
3. Add detection logic in `automation/src/utils/ats-detector.ts`

### Custom Matching Algorithm

Modify the matching engine:

1. Edit `matching-engine/src/matcher/algorithm.ts`
2. Adjust scoring weights
3. Add custom keywords or requirements

### Webhook Integration

Send application updates to external services:

```typescript
// backend/src/config/webhooks.ts
export const webhooks = {
  onApplicationSubmitted: 'https://your-webhook-url.com',
  onApplicationSuccess: 'https://your-webhook-url.com',
  onApplicationFailed: 'https://your-webhook-url.com'
};
```

## 🐛 Troubleshooting

### Common Issues

1. **Puppeteer fails to launch**
   - Install Chrome dependencies: `npm run install:chrome-deps`

2. **CAPTCHA not solving**
   - Check 2captcha balance
   - Verify API key in .env

3. **Jobs not fetching**
   - Verify API keys
   - Check rate limits
   - Review logs: `docker-compose logs job-fetcher`

4. **MongoDB connection issues**
   - Ensure MongoDB is running: `docker-compose ps`
   - Check connection string in .env

## 📊 Performance Optimization

- **Caching**: Redis layer for frequently accessed data
- **Queue Management**: Bull for handling application queue
- **Parallel Processing**: Multiple Puppeteer instances
- **Database Indexing**: Optimized queries for large datasets

## 🤝 Contributing

This is a personal project, but suggestions are welcome!

## 📄 License

MIT License - See LICENSE file for details

## ⚠️ Disclaimer

This tool is for educational and personal use. Users are responsible for ensuring compliance with all applicable laws, terms of service, and ethical guidelines when using automated job application systems.

## 📧 Support

For issues or questions, please open a GitHub issue.

---

**Built with ❤️ for automating the job search process**

## 🗺️ Roadmap

- [ ] LinkedIn Easy Apply automation
- [ ] Cover letter AI generation per job
- [ ] Interview scheduling automation
- [ ] Salary negotiation assistant
- [ ] Mobile app (React Native)
- [ ] Chrome extension for one-click apply
- [ ] Integration with more job boards
- [ ] Advanced analytics and ML predictions
