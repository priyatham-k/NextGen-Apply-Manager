import { Request, Response } from 'express';
import fs from 'fs';
import { extractTextFromPDF } from '../services/resumeParser.service';
import { analyzeResumeATS } from '../services/atsScore.service';
import { logger } from '../config/logger';

/**
 * Analyze a resume PDF for ATS compatibility
 * POST /api/v1/auth/ats-score/analyze
 */
export const analyzeATS = async (req: Request, res: Response): Promise<void> => {
  const filePath = req.file?.path;

  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No PDF file uploaded' });
      return;
    }

    // 1. Extract text from PDF
    logger.info(`ATS analysis: extracting text for user ${userId}`);
    const resumeText = await extractTextFromPDF(req.file.path);

    if (!resumeText || resumeText.trim().length < 50) {
      res.status(400).json({
        success: false,
        message: 'Could not extract enough text from the PDF. Please ensure your resume is not image-based.'
      });
      return;
    }

    // 2. Get optional job description from form data
    const jobDescription = req.body.jobDescription || '';

    // 3. Analyze with AI
    logger.info(`ATS analysis: sending to AI for user ${userId}`);
    const result = await analyzeResumeATS(resumeText, jobDescription || undefined);

    logger.info(`ATS analysis complete for user ${userId}, score: ${result.overallScore}`);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('ATS analysis error:', error);

    if (error.message?.includes('GROQ_API_KEY')) {
      res.status(500).json({ success: false, message: error.message });
    } else if (error instanceof SyntaxError) {
      res.status(500).json({ success: false, message: 'Failed to parse AI response. Please try again.' });
    } else {
      res.status(500).json({ success: false, message: 'Server error during ATS analysis', error: error.message });
    }
  } finally {
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
};
