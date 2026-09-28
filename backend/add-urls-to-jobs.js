/**
 * Add URLs to existing jobs for testing automation
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function addUrlsToJobs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false }));

    // Find jobs without URLs
    const jobsWithoutUrl = await Job.find({
      $or: [
        { url: { $exists: false } },
        { url: null },
        { url: '' }
      ]
    });

    console.log(`Found ${jobsWithoutUrl.length} jobs without URLs\n`);

    if (jobsWithoutUrl.length === 0) {
      console.log('All jobs already have URLs!');
      await mongoose.disconnect();
      return;
    }

    // Sample test URLs for different ATS platforms
    const testUrls = [
      'https://boards.greenhouse.io/embed/job_app?token=test123',
      'https://jobs.lever.co/company/test-position',
      'https://myworkdayjobs.com/test/job/test-position',
      'https://example-company.com/careers/apply/test-job',
      'https://boards.greenhouse.io/testcompany/jobs/123456'
    ];

    let updated = 0;
    for (let i = 0; i < jobsWithoutUrl.length; i++) {
      const job = jobsWithoutUrl[i];
      const testUrl = testUrls[i % testUrls.length];

      await Job.updateOne(
        { _id: job._id },
        { $set: { url: testUrl } }
      );

      console.log(`✅ Updated: ${job.title || 'Untitled'}`);
      console.log(`   Company: ${job.company || 'N/A'}`);
      console.log(`   New URL: ${testUrl}`);
      console.log(`   Job ID: ${job._id}\n`);

      updated++;
    }

    console.log(`\n🎉 Updated ${updated} jobs with test URLs`);
    console.log('\n⚠️  NOTE: These are TEST URLs. For production, use real job application URLs.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addUrlsToJobs();
