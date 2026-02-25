# 🧪 Automation Testing Guide

## Quick Start - Run Full Test

The easiest way to test the automation system:

```bash
cd backend
node test-automation-full.js
```

This will:
1. ✅ Connect to MongoDB
2. ✅ Create/find a test job with URL
3. ✅ Register/login test user
4. ✅ Create user profile
5. ✅ Trigger automation
6. ✅ Monitor progress in real-time

---

## Option 1: Testing via Script (Recommended)

### Prerequisites Check
```bash
cd backend
node test-automation.js
```

This checks if you have jobs with URLs in the database.

### Full End-to-End Test
```bash
cd backend
node test-automation-full.js
```

**What it does:**
- Creates test user and profile automatically
- Triggers automation
- Monitors progress
- Shows results

---

## Option 2: Testing via API (Postman/curl)

### Step 1: Register a User
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Save the token from response!**

### Step 2: Create Profile
```bash
curl -X POST http://localhost:3000/api/v1/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "personalInfo": {
      "firstName": "Test",
      "lastName": "User",
      "email": "test@example.com",
      "phone": "+1234567890"
    },
    "skills": [
      {"name": "JavaScript", "category": "frontend", "level": "expert"}
    ],
    "workExperience": [],
    "education": [],
    "preferences": {
      "jobTypes": ["full_time"],
      "remoteOnly": false,
      "salaryCurrency": "USD"
    }
  }'
```

### Step 3: Create a Test Job
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "title": "Software Engineer",
    "company": "Test Company",
    "location": "Remote",
    "remote": true,
    "description": "Test job for automation",
    "requirements": ["JavaScript"],
    "jobType": "full_time",
    "experienceLevel": "mid",
    "url": "https://boards.greenhouse.io/embed/job_app?token=test"
  }'
```

**Save the job ID from response!**

### Step 4: Trigger Automation
```bash
curl -X POST http://localhost:3000/api/v1/automation/apply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jobId": "YOUR_JOB_ID_HERE"
  }'
```

**Returns:** `202 Accepted` with `applicationId`

### Step 5: Check Status
```bash
curl http://localhost:3000/api/v1/automation/status/YOUR_APPLICATION_ID \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Option 3: Testing via Frontend UI

### Step 1: Start Frontend
```bash
cd frontend
npm start
```

Frontend will run on `http://localhost:4200`

### Step 2: Register/Login
1. Navigate to `http://localhost:4200/auth/login`
2. Register a new account or login

### Step 3: Complete Profile
1. Go to Profile page
2. Fill in:
   - Personal info (name, email, phone)
   - Skills
   - Work experience
   - Education
3. Save profile

### Step 4: Add a Test Job (via API or directly in DB)
Use MongoDB Compass or mongosh:

```javascript
db.jobs.insertOne({
  title: "Test Software Engineer",
  company: "Test Company",
  location: "Remote",
  remote: true,
  description: "Test position",
  requirements: ["JavaScript", "React"],
  jobType: "full_time",
  experienceLevel: "mid",
  url: "https://boards.greenhouse.io/embed/job_app?token=test",
  source: "manual",
  sourceId: "test-1",
  status: "new",
  postedDate: new Date()
})
```

### Step 5: Test Single Auto Apply
1. Navigate to Jobs → Job Details
2. Click **"Auto Apply"** button (green with robot icon)
3. Watch real-time progress modal
4. Check for success/failure toast

### Step 6: Test Bulk Auto Apply
1. Navigate to Top Matches
2. Click checkboxes on multiple jobs (max 10)
3. Click **"Auto Apply to X Jobs"** button
4. Monitor backend logs for progress

---

## Watching Real-Time Progress

### Backend Logs
Keep the backend terminal open while testing:

```bash
cd backend
npm run dev
```

**You'll see:**
```
🤖 Processing automation job for application 6789...
   Job: 1234
   User: 5678
   URL: https://boards.greenhouse.io/...
🌐 Launched browser #1 (1/3)
📄 Loaded job page: https://...
🔍 Detected ATS: GREENHOUSE (URL pattern)
[6%] Navigating to Greenhouse application form...
[13%] Filling basic information...
✓ Filled basic information
[20%] Uploading resume...
...
✅ Automation completed successfully for application 6789
```

### Frontend Real-Time Updates
If using the frontend:
- Progress modal shows: 0% → 100%
- Step messages update live
- Toast notifications on completion

### Socket.IO Events (Developer Tools)
Open browser console → Network → WS tab to see:
```javascript
automation:progress { step: 7, percentage: 46, message: "Filling basic information..." }
automation:complete { applicationId: "6789", status: "success" }
```

---

## Testing Different Scenarios

### Test 1: Successful Automation
- Use a valid Greenhouse test URL
- Complete profile with all fields
- **Expected:** Status changes to SUBMITTED

### Test 2: Missing Profile
- Don't create profile
- Try to trigger automation
- **Expected:** Error "Profile not found"

### Test 3: Invalid Job URL
```javascript
{
  url: "https://invalid-url.com"
}
```
- **Expected:** Status FAILED with error message

### Test 4: Bulk Apply
- Select 3-5 jobs
- Click bulk apply
- **Expected:** All queued, processed sequentially

### Test 5: Browser Pool
- Trigger 5 automations simultaneously
- **Expected:** Max 3 browsers launch, others wait

---

## Monitoring & Debugging

### Check Application Status in DB
```javascript
// MongoDB shell
db.applications.find({ status: "PENDING" }).pretty()
db.applications.find({ status: "SUBMITTED" }).pretty()
db.applications.find({ status: "FAILED" }).pretty()
```

### Check Bull Queue
```javascript
// In Node.js console or script
const { automationQueue } = require('./src/config/bullQueue');

// Check waiting jobs
automationQueue.getWaiting().then(jobs => console.log(jobs.length));

// Check active jobs
automationQueue.getActive().then(jobs => console.log(jobs.length));

// Check failed jobs
automationQueue.getFailed().then(jobs => console.log(jobs.length));
```

### Check Screenshots
After successful automation:
```bash
ls -la uploads/screenshots/USER_ID/APPLICATION_ID/
```

### Browser Pool Stats
Add this endpoint for debugging (optional):

```typescript
// backend/src/routes/automation.routes.ts
router.get('/browser-stats', (req, res) => {
  const stats = browserManager.getStats();
  res.json(stats);
});
```

Then check:
```bash
curl http://localhost:3000/api/v1/automation/browser-stats
```

---

## Common Issues & Solutions

### Issue: "Profile not found"
**Solution:** Create profile via API or frontend first

### Issue: "Job URL is required"
**Solution:** Ensure job has `url` field populated

### Issue: Browser launch timeout
**Solution:**
- Check if Chromium is installed
- Set `PUPPETEER_HEADLESS=false` to see browser
- Check system resources

### Issue: Socket.IO not connecting
**Solution:**
- Check if user is authenticated
- Verify token in Authorization header
- Check browser console for errors

### Issue: Redis connection errors
**Solution:**
- Verify REDIS_URL in .env
- Check Upstash dashboard
- Restart backend server

---

## Performance Testing

### Test Browser Pool Capacity
```bash
# Run this script 10 times quickly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/v1/automation/apply \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"jobId\":\"$JOB_ID\"}" &
done
```

**Expected:** Max 3 browsers active, others queued

### Test Concurrent Automations
- Use Postman Collection Runner
- Run 10 automation requests
- Monitor: `GET /api/v1/automation/browser-stats`

---

## Test Checklist

Before deploying to production:

- [ ] ✅ Single job automation works
- [ ] ✅ Bulk apply (2-10 jobs) works
- [ ] ✅ Real-time progress updates via Socket.IO
- [ ] ✅ Success toast notifications appear
- [ ] ✅ Failure handling works (retry button)
- [ ] ✅ Screenshots captured on success
- [ ] ✅ Error screenshots captured on failure
- [ ] ✅ Browser pool manages 3+ concurrent jobs
- [ ] ✅ Profile validation works
- [ ] ✅ ATS detection identifies platforms
- [ ] ✅ Generic fallback strategy works

---

## Next Steps

After testing:

1. **Add Real Job URLs**
   - Replace test URLs with actual job postings
   - Ensure they're application-friendly

2. **Configure Environment**
   ```env
   PUPPETEER_HEADLESS=true     # Set to false for debugging
   PUPPETEER_TIMEOUT=60000     # Adjust as needed
   ```

3. **Monitor Production**
   - Set up logging (Winston)
   - Monitor Bull queue metrics
   - Track success/failure rates

4. **Optimize**
   - Tune browser pool size
   - Adjust timeouts
   - Add more ATS strategies
