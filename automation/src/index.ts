import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from './logger';
import { generateResumeFromJobDescription } from './services/ai.service';

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.AUTOMATION_PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4200', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Automation service is running', timestamp: new Date().toISOString() });
});

// Resume generation endpoint
app.post('/api/v1/resume-generator/generate', async (req, res) => {
  try {
    const { jobDescription, userProfile } = req.body;

    if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length < 50) {
      res.status(400).json({ success: false, message: 'Job description is required and must be at least 50 characters long' });
      return;
    }

    if (jobDescription.length > 15000) {
      res.status(400).json({ success: false, message: 'Job description must not exceed 15,000 characters' });
      return;
    }

    logger.info(`Resume generation requested${userProfile ? ` for ${userProfile.firstName} ${userProfile.lastName}` : ''}`);

    const resumeData = await generateResumeFromJobDescription(jobDescription.trim(), userProfile);

    res.status(200).json({ success: true, data: resumeData, message: 'Resume generated successfully' });
  } catch (error: any) {
    logger.error('Resume generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate resume. Please try again.' });
  }
});

app.listen(PORT, () => {
  logger.info(`Automation service running on port ${PORT}`);
  logger.info(`Resume Generator: POST http://localhost:${PORT}/api/v1/resume-generator/generate`);
});

export default app;
