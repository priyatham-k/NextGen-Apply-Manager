# Puppeteer Automation Engine - Setup Guide

## Overview

The Puppeteer Automation Engine is a sophisticated job application automation system that automatically fills out and submits job applications across multiple ATS (Applicant Tracking System) platforms.

## Architecture

### Core Components

1. **Asynchronous Processing** - Bull queue with Redis for background job processing
2. **Browser Pool Management** - Reuses 3 Puppeteer instances for efficiency
3. **ATS Detection** - Identifies platform via URL patterns and DOM fingerprinting
4. **Strategy Pattern** - Platform-specific automation strategies (Greenhouse, Generic fallback)
5. **Real-time Progress** - Socket.IO emits 15-step progress updates (0-100%)
6. **Error Handling** - Screenshot capture, automatic retries, graceful degradation

## Prerequisites

### Required Software

1. **Node.js** >= 16.x
2. **MongoDB** >= 5.x (running on localhost:27017)
3. **Redis** >= 6.x (running on localhost:6379)

### Installation

#### Install Redis (Windows)

**Option 1: Using Memurai (Redis-compatible for Windows)**
```bash
# Download from https://www.memurai.com/get-memurai
# Or use Chocolatey:
choco install memurai-developer
```

**Option 2: Using Docker**
```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

**Option 3: WSL2**
```bash
wsl --install
wsl
sudo apt update
sudo apt install redis-server
redis-server
```

#### Verify Redis Connection
```bash
redis-cli ping
# Should return: PONG
```

## Environment Configuration

### Backend (.env file)

Create `backend/.env` with the following:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/job-automation

# JWT
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRES_IN=7d

# AI
GROQ_API_KEY=your-groq-api-key

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Puppeteer
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=60000
SCREENSHOT_STORAGE_PATH=./uploads/screenshots

# CORS
CORS_ORIGIN=http://localhost:4200
```

## Running the System

### Start Backend Server

```bash
cd backend
npm install
npm run dev
```

**Expected Output:**
```
✅ MongoDB connected successfully
✅ Redis connected
✅ Automation worker started and listening for jobs
Socket.IO initialized
🚀 Server is running on port 3000
```

### Start Frontend (separate terminal)

```bash
cd frontend
npm install
npm start
```

## API Endpoints

### 1. Apply to Single Job

```http
POST /api/v1/automation/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "jobId": "507f1f77bcf86cd799439011",
  "resumeId": "resume-123",
  "coverLetterId": "cover-456" // optional
}
```

**Response:**
```json
{
  "message": "Application queued for automation",
  "applicationId": "507f1f77bcf86cd799439012"
}
```

### 2. Bulk Apply

```http
POST /api/v1/automation/apply-bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "jobIds": ["id1", "id2", "id3"],
  "resumeId": "resume-123"
}
```

### 3. Check Automation Status

```http
GET /api/v1/automation/status/:applicationId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "SUBMITTED",
  "submissionType": "AUTOMATED",
  "atsType": "GREENHOUSE",
  "screenshots": ["/uploads/screenshots/user123/app456/screenshot-123.png"],
  "submittedAt": "2026-02-23T18:30:00.000Z"
}
```

### 4. Retry Failed Application

```http
POST /api/v1/automation/retry/:applicationId
Authorization: Bearer <token>
```

### 5. Cancel Automation

```http
DELETE /api/v1/automation/cancel/:applicationId
Authorization: Bearer <token>
```

## Socket.IO Events

### Progress Updates (Client listens)

```javascript
socket.on('automation:progress', (data) => {
  console.log(data);
  // {
  //   applicationId: "...",
  //   step: 7,
  //   totalSteps: 15,
  //   percentage: 47,
  //   message: "Filling basic information..."
  // }
});
```

### Completion Event

```javascript
socket.on('automation:complete', (data) => {
  console.log('Success!', data.applicationId);
});
```

### Failure Event

```javascript
socket.on('automation:failed', (data) => {
  console.error('Failed:', data.error);
});
```

## Automation Workflow

### 15-Step Process

1. **Initialize browser** (0%) - Launch Puppeteer instance from pool
2. **Load job page** (7%) - Navigate to job URL
3. **Detect ATS** (13%) - Identify platform (Greenhouse, Workday, etc.)
4. **Load profile** (20%) - Fetch user profile data
5. **Prepare strategy** (27%) - Create platform-specific strategy instance
6. **Navigate to form** (33%) - Find and click "Apply" button
7. **Fill basic info** (40%) - Name, email, phone
8. **Fill experience** (47%) - Work history (or skip if resume-based)
9. **Fill education** (53%) - Academic background
10. **Upload resume** (60%) - Attach PDF/DOCX file
11. **Upload cover letter** (67%) - Attach if provided
12. **Submit application** (73%) - Click submit button
13. **Verify submission** (87%) - Check for success message
14. **Capture screenshot** (93%) - Save confirmation page
15. **Finalize** (100%) - Update database, emit completion

## Supported ATS Platforms

### Currently Implemented

| Platform | Status | Detection Method | Strategy |
|----------|--------|-----------------|----------|
| **Greenhouse** | ✅ Full Support | URL pattern + DOM | GreenhouseStrategy |
| **Generic** | ✅ Fallback | Any platform | GenericStrategy (best-effort) |

### Planned (Add as needed)

- Workday (WorkdayStrategy)
- Lever (LeverStrategy)
- Taleo (TaleoStrategy)
- iCIMS (iCIMSStrategy)
- Jobvite (JobviteStrategy)

## Adding New ATS Strategy

1. Create strategy file: `backend/src/services/automation/strategies/WorkdayStrategy.ts`

```typescript
import { BaseATSStrategy } from './BaseStrategy';

export class WorkdayStrategy extends BaseATSStrategy {
  async navigateToApplication(): Promise<void> {
    // Implementation
  }

  async fillBasicInfo(): Promise<void> {
    // Implementation
  }

  // ... implement all abstract methods
}
```

2. Register in automation engine:

```typescript
// backend/src/services/automation/automationEngine.service.ts
import { WorkdayStrategy } from './strategies/WorkdayStrategy';

private createStrategy(atsType: ATSType, page: Page, profile: any, onProgress: any): BaseATSStrategy {
  switch (atsType) {
    case 'GREENHOUSE':
      return new GreenhouseStrategy(page, profile, onProgress);
    case 'WORKDAY':
      return new WorkdayStrategy(page, profile, onProgress); // Add this
    default:
      return new GenericStrategy(page, profile, onProgress);
  }
}
```

3. Update ATS detector:

```typescript
// backend/src/services/automation/atsDetector.service.ts
if (url.includes('myworkdayjobs.com')) return 'WORKDAY';
```

## Error Handling

### Automatic Retries

Bull queue automatically retries failed jobs:
- **Attempts:** 3
- **Backoff:** Exponential (5s, 10s, 20s)
- **Strategy:** Create new browser instance each time

### Error Categories

1. **Navigation Errors** - Job URL inaccessible → Mark FAILED with error log
2. **Form Detection Errors** - Can't find fields → Falls back to Generic strategy
3. **Submission Failures** - Submit button not found → Capture screenshot, retry
4. **Verification Failures** - No success message → Still mark SUBMITTED (cautious)
5. **Network Timeouts** - 60s timeout → Retry with fresh browser

### Manual Fallback

If automation fails after 3 attempts:
1. Application status = `FAILED`
2. Error screenshot saved
3. User receives notification
4. User can view error log and manually complete application
5. User can retry automation via API endpoint

## Performance Optimization

### Browser Pool

- **Pool Size:** 3 browsers (configurable)
- **Reuse:** Browsers reused across jobs (faster than launching each time)
- **Cleanup:** Browsers closed on server shutdown

### Concurrent Processing

- **Max Concurrent:** 3 automations (limited by browser pool)
- **Queue:** Additional jobs wait in Bull queue
- **Priority:** FIFO (First In First Out)

### Image Blocking

```typescript
// Browsers launch with --disable-images flag
// 3x speed improvement (no image downloads)
```

## Security & Privacy

### No Credential Storage (Important!)

- ⚠️ **Never store job site passwords**
- Only use "Easy Apply" features (no login required)
- If job requires login, mark as `MANUAL` submission type

### Screenshot Retention

- Screenshots stored for **7 days** only
- Stored in user-specific folders: `uploads/screenshots/{userId}/{applicationId}/`
- Automatic cleanup via scheduled job (optional)

### Rate Limiting

- **Max applications per user:** 5 concurrent
- **Max applications per day:** Configurable in user preferences
- **Bull queue delay:** 2s between jobs to avoid rate limiting

## Monitoring & Debugging

### Bull Dashboard (Optional)

Install Bull Board for visual queue monitoring:

```bash
npm install @bull-board/express @bull-board/api
```

Access at: `http://localhost:3000/admin/queues`

### Logs

```bash
# Backend logs
cd backend
npm run dev | grep "automation"

# Watch for:
# 🤖 Processing automation job
# ✅ Job completed successfully
# ❌ Job failed
```

### Debug Mode

Set `PUPPETEER_HEADLESS=false` in .env to see browser automation in real-time:

```env
PUPPETEER_HEADLESS=false
```

## Testing

### Manual API Test

```bash
# 1. Get auth token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Trigger automation
curl -X POST http://localhost:3000/api/v1/automation/apply \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "507f1f77bcf86cd799439011",
    "resumeId": "resume-123"
  }'

# 3. Monitor progress via Socket.IO
# Use frontend or socket.io-client
```

### Integration Test

```bash
cd backend
npm run test:automation  # If test script exists
```

## Troubleshooting

### Issue: Redis connection failed

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# If not, start Redis
redis-server  # Linux/Mac
memurai  # Windows
```

### Issue: Browser launch failed

**Solution:**
```bash
# Install Chromium dependencies (Linux)
sudo apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libgbm1 libasound2

# Or use bundled Chromium
npm install puppeteer  # Not puppeteer-core
```

### Issue: Automation gets stuck

**Solution:**
- Check `PUPPETEER_TIMEOUT` (default: 60s)
- Increase if slow internet: `PUPPETEER_TIMEOUT=120000`
- Check browser pool availability (max 3 concurrent)

### Issue: Form fields not detected

**Solution:**
- ATS platform may have updated DOM structure
- Falls back to Generic strategy (best-effort)
- May require strategy update for that specific platform
- User can manually complete application

## Production Considerations

### Scaling

For high volume (>100 applications/day):

1. **Increase browser pool:**
```typescript
// browserManager.service.ts
private maxBrowsers = 10;  // Increase from 3
```

2. **Add more Redis workers:**
```bash
# Run multiple worker processes
PM2_INSTANCES=4 pm2 start backend/src/workers/automation.worker.ts
```

3. **Use separate Redis for Bull:**
```env
REDIS_URL=redis://localhost:6379/1  # Database 1 for Bull
```

### Monitoring

- Set up Sentry for error tracking
- Use Prometheus + Grafana for metrics
- Monitor Bull queue depth
- Alert on high failure rates

## FAQ

**Q: Can I run multiple backend instances?**
A: Yes, but ensure all share the same Redis instance. Bull will distribute jobs across instances.

**Q: How do I add support for a new ATS platform?**
A: See "Adding New ATS Strategy" section above.

**Q: What if a job requires login?**
A: Mark it as MANUAL. For MVP, we only support "Easy Apply" (no login required).

**Q: Can I customize the automation speed?**
A: Yes, adjust delays in strategy files. Default: 50ms typing delay.

**Q: How do I disable automation for testing?**
A: Stop the Redis server. Automation requires Redis to queue jobs.

## Support

For issues or questions:
- GitHub Issues: [repo-url]/issues
- Documentation: This file
- Logs: `backend/logs/` (if using file logging)
