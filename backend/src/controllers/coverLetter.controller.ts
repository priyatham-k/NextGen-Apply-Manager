import { Request, Response } from 'express';
import { CoverLetter } from '../models/CoverLetter.model';
import { generateCoverLetter, extractJobDetails } from '../services/coverLetterGenerator.service';
import { logger } from '../config/logger';

/**
 * POST /api/v1/cover-letters/generate
 * Generate a new cover letter using AI
 */
export const generateNewCoverLetter = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { company, position, jobDescription, title } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    // Validation
    if (!company || !position || !jobDescription) {
      res.status(400).json({
        success: false,
        error: 'Company, position, and job description are required'
      });
      return;
    }

    logger.info(`Generating cover letter for user ${userId} - ${position} at ${company}`);

    // Generate cover letter content using AI
    const content = await generateCoverLetter(userId, company, position, jobDescription);

    // Save to database
    const coverLetter = new CoverLetter({
      userId,
      title: title || `${position} at ${company}`,
      company,
      position,
      jobDescription,
      content
    });

    await coverLetter.save();

    res.status(201).json({
      success: true,
      data: coverLetter,
      message: 'Cover letter generated successfully'
    });
  } catch (error: any) {
    logger.error(`Error generating cover letter: ${error.message}`);

    if (error.message.includes('profile not found')) {
      res.status(404).json({
        success: false,
        error: 'Profile not found. Please complete your profile first.',
        profileRequired: true
      });
      return;
    }

    if (error.message.includes('GROQ_API_KEY')) {
      res.status(500).json({
        success: false,
        error: 'AI service configuration error'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate cover letter'
    });
  }
};

/**
 * GET /api/v1/cover-letters
 * Get all cover letters for authenticated user
 */
export const getCoverLetters = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    const coverLetters = await CoverLetter.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        coverLetters,
        total: coverLetters.length
      }
    });
  } catch (error: any) {
    logger.error(`Error fetching cover letters: ${error.message}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch cover letters'
    });
  }
};

/**
 * GET /api/v1/cover-letters/:id
 * Get a specific cover letter
 */
export const getCoverLetterById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    const coverLetter = await CoverLetter.findOne({ _id: id, userId }).lean();

    if (!coverLetter) {
      res.status(404).json({
        success: false,
        error: 'Cover letter not found'
      });
      return;
    }

    res.json({
      success: true,
      data: coverLetter
    });
  } catch (error: any) {
    logger.error(`Error fetching cover letter: ${error.message}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch cover letter'
    });
  }
};

/**
 * DELETE /api/v1/cover-letters/:id
 * Delete a cover letter
 */
export const deleteCoverLetter = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    const result = await CoverLetter.findOneAndDelete({ _id: id, userId });

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Cover letter not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Cover letter deleted successfully'
    });
  } catch (error: any) {
    logger.error(`Error deleting cover letter: ${error.message}`);

    res.status(500).json({
      success: false,
      error: 'Failed to delete cover letter'
    });
  }
};

/**
 * POST /api/v1/cover-letters/extract-details
 * Extract company name and position from job description using AI
 */
export const extractDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobDescription } = req.body;

    if (!jobDescription) {
      res.status(400).json({
        success: false,
        error: 'Job description is required'
      });
      return;
    }

    logger.info('Extracting job details from description');

    const details = await extractJobDetails(jobDescription);

    res.json({
      success: true,
      data: details
    });
  } catch (error: any) {
    logger.error(`Error extracting job details: ${error.message}`);

    res.status(500).json({
      success: false,
      error: 'Failed to extract job details'
    });
  }
};
