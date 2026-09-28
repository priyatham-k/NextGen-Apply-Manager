// Quick test to check automation prerequisites
const mongoose = require('mongoose');
require('dotenv').config();

async function checkSetup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/job-automation');
    console.log('✅ MongoDB connected');
    
    const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false }));
    const jobs = await Job.find({ url: { $exists: true, $ne: null } }).limit(3);
    
    console.log('\n📋 Jobs with URLs (ready for automation):');
    if (jobs.length === 0) {
      console.log('❌ No jobs found with URLs. You need to add job URLs first.');
    } else {
      jobs.forEach((job, i) => {
        console.log(`\n${i + 1}. ${job.title || 'Untitled'}`);
        console.log(`   Company: ${job.company || 'N/A'}`);
        console.log(`   URL: ${job.url}`);
        console.log(`   ID: ${job._id}`);
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkSetup();
