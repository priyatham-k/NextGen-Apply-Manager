/**
 * Direct automation test (bypasses Bull queue)
 * Run this to test automation without Redis
 */

import { automationEngine } from './src/services/automation/automationEngine.service';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testDirectAutomation() {
  try {
    console.log('🚀 Starting direct automation test...\n');

    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/job-automation';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    // Test job data (replace with real values)
    const testJobData = {
      applicationId: 'test-' + Date.now(),
      userId: 'test-user-123', // Replace with real user ID
      jobId: 'test-job-123', // Replace with real job ID
      jobUrl: 'https://boards.greenhouse.io/embed/job_app?token=SAMPLE', // Replace with real job URL
      resumeId: 'resume-123', // Optional
      coverLetterId: undefined
    };

    console.log('📋 Test job data:', testJobData);
    console.log('\n⚠️  IMPORTANT: Update the job data above with real values before running!\n');

    // Uncomment to run automation:
    // await automationEngine.executeAutomation(testJobData);

    console.log('✅ Test setup complete. Uncomment the executeAutomation line to run.');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDirectAutomation();
