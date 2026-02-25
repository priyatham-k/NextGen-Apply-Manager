/**
 * Complete Automation Test Script
 * Tests the full automation flow end-to-end
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const API_URL = 'http://localhost:3000/api/v1';
let authToken = null;
let testUserId = null;

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    log('✅ MongoDB connected', 'green');
  } catch (error) {
    log(`❌ MongoDB connection failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function checkPrerequisites() {
  log('\n📋 Checking Prerequisites...', 'cyan');

  // Check for jobs with URLs
  const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false }));
  const jobs = await Job.find({ url: { $exists: true, $ne: null } }).limit(1);

  if (jobs.length === 0) {
    log('⚠️  No jobs with URLs found. Creating a test job...', 'yellow');

    // Create a test job with a Greenhouse URL (safe for testing)
    const testJob = await Job.create({
      title: 'Test Software Engineer Position',
      company: 'Test Company',
      location: 'Remote',
      remote: true,
      description: 'This is a test job for automation testing',
      requirements: ['JavaScript', 'Node.js', 'React'],
      jobType: 'full_time',
      experienceLevel: 'mid',
      url: 'https://boards.greenhouse.io/embed/job_app?token=test', // Test Greenhouse URL
      source: 'manual',
      sourceId: 'test-job-1',
      status: 'new',
      postedDate: new Date()
    });

    log(`✅ Created test job: ${testJob._id}`, 'green');
    return testJob._id.toString();
  } else {
    log(`✅ Found existing job: ${jobs[0].title}`, 'green');
    log(`   Company: ${jobs[0].company}`, 'blue');
    log(`   URL: ${jobs[0].url}`, 'blue');
    return jobs[0]._id.toString();
  }
}

async function registerOrLoginUser() {
  log('\n👤 Setting up test user...', 'cyan');

  const testEmail = 'test@automation.com';
  const testPassword = 'Test123!@#';

  try {
    // Try to register
    const registerRes = await axios.post(`${API_URL}/auth/register`, {
      email: testEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'User'
    });

    authToken = registerRes.data.token;
    testUserId = registerRes.data.user.id;
    log('✅ New user registered', 'green');
  } catch (error) {
    if (error.response?.status === 400) {
      // User exists, try login
      try {
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
          email: testEmail,
          password: testPassword
        });

        authToken = loginRes.data.token;
        testUserId = loginRes.data.user.id;
        log('✅ Logged in with existing user', 'green');
      } catch (loginError) {
        log(`❌ Login failed: ${loginError.message}`, 'red');
        throw loginError;
      }
    } else {
      throw error;
    }
  }

  log(`   User ID: ${testUserId}`, 'blue');
  log(`   Token: ${authToken.substring(0, 20)}...`, 'blue');
}

async function createOrUpdateProfile() {
  log('\n📝 Setting up user profile...', 'cyan');

  try {
    const profileData = {
      personalInfo: {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@automation.com',
        phone: '+1234567890',
        address: {
          city: 'San Francisco',
          state: 'CA',
          country: 'USA',
          zip: '94102'
        },
        linkedin: 'https://linkedin.com/in/testuser',
        github: 'https://github.com/testuser'
      },
      professionalSummary: {
        summary: 'Experienced software engineer with 5 years of experience',
        yearsOfExperience: 5,
        coreCompetencies: ['JavaScript', 'Node.js', 'React', 'MongoDB'],
        specialization: 'Full Stack Development'
      },
      workExperience: [
        {
          company: 'Tech Company',
          position: 'Senior Software Engineer',
          location: 'San Francisco, CA',
          startDate: new Date('2020-01-01'),
          current: true,
          description: 'Building scalable web applications',
          achievements: ['Led team of 5 developers', 'Improved performance by 40%'],
          technologies: ['React', 'Node.js', 'MongoDB']
        }
      ],
      education: [
        {
          institution: 'University of Technology',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          location: 'San Francisco, CA',
          startDate: new Date('2015-09-01'),
          endDate: new Date('2019-05-01'),
          gpa: 3.8
        }
      ],
      skills: [
        { name: 'JavaScript', category: 'frontend', level: 'expert' },
        { name: 'Node.js', category: 'backend', level: 'advanced' },
        { name: 'React', category: 'frontend', level: 'advanced' },
        { name: 'MongoDB', category: 'database', level: 'intermediate' }
      ],
      preferences: {
        jobTypes: ['full_time'],
        experienceLevels: ['mid', 'senior'],
        locations: ['San Francisco, CA', 'Remote'],
        remoteOnly: false,
        salaryCurrency: 'USD',
        keywords: ['JavaScript', 'React', 'Node.js'],
        autoApplyThreshold: 70,
        maxApplicationsPerDay: 10
      }
    };

    const response = await axios.post(`${API_URL}/profile`, profileData, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Profile created/updated', 'green');
    return response.data;
  } catch (error) {
    log(`❌ Profile creation failed: ${error.response?.data?.message || error.message}`, 'red');
    throw error;
  }
}

async function triggerAutomation(jobId) {
  log('\n🤖 Triggering automation...', 'cyan');

  try {
    const response = await axios.post(
      `${API_URL}/automation/apply`,
      { jobId },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const { applicationId } = response.data;
    log(`✅ Automation queued! Application ID: ${applicationId}`, 'green');
    log('   Status: 202 Accepted', 'blue');

    return applicationId;
  } catch (error) {
    log(`❌ Automation trigger failed: ${error.response?.data?.message || error.message}`, 'red');
    throw error;
  }
}

async function checkAutomationStatus(applicationId) {
  log('\n🔍 Checking automation status...', 'cyan');

  try {
    const response = await axios.get(
      `${API_URL}/automation/status/${applicationId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    log(`Status: ${response.data.status}`, 'blue');
    log(`Submission Type: ${response.data.submissionType}`, 'blue');
    log(`ATS Type: ${response.data.atsType || 'Not detected yet'}`, 'blue');

    if (response.data.errorLog) {
      log(`Error: ${response.data.errorLog}`, 'red');
    }

    if (response.data.screenshots && response.data.screenshots.length > 0) {
      log(`Screenshots: ${response.data.screenshots.length} captured`, 'green');
    }

    return response.data;
  } catch (error) {
    log(`❌ Status check failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

async function monitorProgress(applicationId) {
  log('\n📊 Monitoring automation progress...', 'cyan');
  log('   (Check the backend server logs for real-time progress)', 'yellow');
  log('   Press Ctrl+C to stop monitoring\n', 'yellow');

  let attempts = 0;
  const maxAttempts = 30; // 5 minutes max

  const interval = setInterval(async () => {
    attempts++;

    if (attempts > maxAttempts) {
      clearInterval(interval);
      log('\n⏱️  Monitoring timeout (5 minutes). Check application status manually.', 'yellow');
      await cleanup();
      return;
    }

    try {
      const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }));
      const app = await Application.findById(applicationId);

      if (app) {
        process.stdout.write(`\r   Status: ${app.status} | ATS: ${app.atsType || 'detecting...'} | Time: ${attempts * 10}s   `);

        if (app.status === 'SUBMITTED') {
          clearInterval(interval);
          log('\n\n🎉 SUCCESS! Application submitted automatically!', 'green');
          if (app.screenshots && app.screenshots.length > 0) {
            log(`📸 Screenshots saved: ${app.screenshots.length}`, 'green');
          }
          await cleanup();
        } else if (app.status === 'FAILED') {
          clearInterval(interval);
          log('\n\n❌ FAILED! Automation encountered an error:', 'red');
          log(`   ${app.errorLog}`, 'red');
          await cleanup();
        }
      }
    } catch (error) {
      // Ignore errors during monitoring
    }
  }, 10000); // Check every 10 seconds
}

async function cleanup() {
  log('\n🧹 Cleaning up...', 'cyan');
  await mongoose.disconnect();
  log('✅ Test complete!', 'green');
  process.exit(0);
}

// Main test flow
async function runTest() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║         JOB AUTOMATION - END-TO-END TEST                  ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  try {
    await connectDB();
    const jobId = await checkPrerequisites();
    await registerOrLoginUser();
    await createOrUpdateProfile();
    const applicationId = await triggerAutomation(jobId);

    log('\n⏱️  Waiting 5 seconds for automation to start...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 5000));

    await checkAutomationStatus(applicationId);
    await monitorProgress(applicationId);

  } catch (error) {
    log(`\n💥 Test failed: ${error.message}`, 'red');
    await cleanup();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  log('\n\n⚠️  Test interrupted by user', 'yellow');
  await cleanup();
});

runTest();
