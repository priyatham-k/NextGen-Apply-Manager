# 🚀 Quick Start Guide

Get the Job Application Automation system running in 15 minutes!

## Prerequisites

Before you begin, ensure you have:

- ✅ Node.js 20+ installed
- ✅ MongoDB 7+ running (or Docker)
- ✅ Git installed
- ✅ A code editor (VS Code recommended)

## Step 1: Clone and Setup (2 minutes)

```bash
# If using Git, initialize your repository
cd job-application-automation
git init
git add .
git commit -m "Initial commit: Job application automation system"

# Install root dependencies
npm install

# Install all service dependencies
npm run install:all
```

## Step 2: Environment Configuration (3 minutes)

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your API keys
nano .env  # or use your preferred editor
```

**Minimum required variables:**
```env
# Database
MONGODB_URI=mongodb://localhost:27017/job-automation

# Server
JWT_SECRET=your-super-secret-key-change-this

# Job APIs (get free keys from RapidAPI)
JSEARCH_API_KEY=your-jsearch-api-key

# OpenAI (for matching)
OPENAI_API_KEY=your-openai-api-key
```

**Where to get API keys:**

1. **JSearch API** (Free tier available)
   - Go to https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
   - Sign up and subscribe to free tier
   - Copy your API key

2. **OpenAI API** (Pay as you go)
   - Go to https://platform.openai.com/api-keys
   - Create an account
   - Generate an API key

3. **2captcha** (Optional, for CAPTCHA solving)
   - Go to https://2captcha.com/
   - Sign up and add funds
   - Copy your API key

## Step 3: Start MongoDB (1 minute)

### Option A: Using Docker (Recommended)
```bash
docker-compose up -d mongodb
```

### Option B: Local MongoDB
```bash
# If MongoDB is installed locally
mongod --dbpath /path/to/your/data
```

## Step 4: Start Development Servers (2 minutes)

```bash
# Start all services in development mode
npm run dev
```

This will start:
- ✅ Frontend on http://localhost:4200
- ✅ Backend API on http://localhost:3000
- ✅ Job Fetcher service
- ✅ Automation service

## Step 5: Create Your First User (1 minute)

1. Open browser to http://localhost:4200
2. Click "Register"
3. Fill in your details:
   - First Name
   - Last Name
   - Email
   - Password
4. Click "Sign Up"

## Step 6: Setup Your Profile (3 minutes)

1. After logging in, go to "Profile"
2. Fill in your information:
   - Personal details
   - Work experience
   - Education
   - Skills
3. Upload your resume (PDF format)
4. Set your job preferences:
   - Job types you're interested in
   - Preferred locations
   - Minimum salary
   - Remote preferences
5. Click "Save"

## Step 7: Fetch Jobs (1 minute)

1. Go to Dashboard
2. Click "Refresh Data" or "Fetch Jobs"
3. The system will fetch jobs from configured APIs
4. Jobs will be matched against your profile
5. View your match scores!

## Step 8: Test Auto-Apply (2 minutes)

1. Go to "Jobs" page
2. Find a high-match job (>75% match)
3. Click "Quick Apply"
4. Review the application
5. The system will:
   - Navigate to the company's application page
   - Detect the ATS system
   - Fill in your information
   - Submit the application
   - Take a screenshot for verification

## 🎉 You're All Set!

Your job automation system is now running. Here's what happens automatically:

### Automatic Processes:
- 🔄 Jobs are fetched every 6 hours
- 🎯 Jobs are matched against your profile
- 🤖 High-match jobs (>75%) are auto-applied
- 📧 You receive daily summary emails
- 📊 Analytics are updated in real-time

## 📱 Next Steps

### Customize Your Experience

1. **Adjust Auto-Apply Threshold**
   - Go to Profile > Preferences
   - Change "Auto Apply Threshold" (default: 75%)
   - Higher = more selective, Lower = more applications

2. **Set Application Limits**
   - Max applications per day
   - Max applications per company
   - Delay between applications

3. **Configure Notifications**
   - Email notifications
   - Application summaries
   - Error alerts

### Advanced Features

1. **Create Multiple Resume Versions**
   - Upload different resumes for different job types
   - System will automatically choose the best match

2. **Generate Custom Cover Letters**
   - AI will generate tailored cover letters for each job
   - Edit and save your favorites

3. **Track Your Applications**
   - View all applications in one place
   - Update status as you hear back
   - Schedule interviews
   - Add notes

## 🐛 Troubleshooting

### MongoDB Connection Error
```bash
# Check if MongoDB is running
docker-compose ps mongodb
# or
ps aux | grep mongo

# Restart MongoDB
docker-compose restart mongodb
```

### Port Already in Use
```bash
# Find process using port 3000 or 4200
lsof -i :3000
lsof -i :4200

# Kill the process
kill -9 <PID>
```

### Puppeteer/Chrome Issues
```bash
# Install Chrome dependencies
cd automation
npm run install:chrome-deps
```

### API Rate Limits
- Free tiers have limited requests
- Upgrade to paid plans for higher limits
- Reduce fetch frequency in .env

## 📚 Learn More

- [Full Documentation](./README.md)
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- [API Documentation](./docs/API.md)
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)

## 💡 Pro Tips

1. **Start with a high match threshold (80%+)** to ensure quality applications
2. **Review auto-applied jobs daily** to learn and adjust
3. **Keep your profile updated** for better matches
4. **Monitor your application success rate** and adjust strategy
5. **Don't forget to follow up** on applications manually

## ⚠️ Important Notes

- **Always review applications before they go out** (at least initially)
- **Some companies prohibit automated applications** - check their terms
- **Quality over quantity** - better to apply to fewer, better-matched jobs
- **Keep your resume and profile current** for best results
- **Follow up on applications** - automation is just the first step

## 🆘 Need Help?

- Check the [FAQ](./docs/FAQ.md)
- Review [Common Issues](./docs/TROUBLESHOOTING.md)
- Open an issue on GitHub
- Review server logs: `docker-compose logs -f`

---

**Ready to automate your job search? Let's go! 🚀**
