import { Request, Response } from 'express';
import { calculateMatches, getMatchDetails as getMatchDetailsService, clearMatchCache } from '../services/jobMatching.service';
import { logger } from '../config/logger';

/**
 * GET /api/v1/matching/top-matches
 * Get top matching jobs for the authenticated user
 */
export const getTopMatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;

    if (limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100'
      });
      return;
    }

    logger.info(`Fetching top ${limit} matches for user ${userId}`);

    const matches = await calculateMatches(userId, limit);

    res.json({
      success: true,
      data: {
        matches,
        total: matches.length
      }
    });
  } catch (error: any) {
    logger.error(`Error fetching top matches: ${error.message}`);

    // Handle specific errors
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
      error: 'Failed to calculate job matches'
    });
  }
};

/**
 * GET /api/v1/matching/jobs/:jobId/details
 * Get detailed match information for a specific job
 */
export const getMatchDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { jobId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    if (!jobId) {
      res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
      return;
    }

    logger.info(`Fetching match details for job ${jobId} and user ${userId}`);

    const matchDetails = await getMatchDetailsService(userId, jobId);

    if (!matchDetails) {
      res.status(404).json({
        success: false,
        error: 'Match details not found for this job'
      });
      return;
    }

    res.json({
      success: true,
      data: matchDetails
    });
  } catch (error: any) {
    logger.error(`Error fetching match details: ${error.message}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch match details'
    });
  }
};

/**
 * POST /api/v1/matching/refresh
 * Refresh/recalculate matches for the authenticated user
 */
export const refreshMatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    logger.info(`Refreshing matches for user ${userId}`);

    // Clear cache to force recalculation
    clearMatchCache(userId);

    // Calculate fresh matches
    const matches = await calculateMatches(userId, 20);

    res.json({
      success: true,
      data: {
        matches,
        total: matches.length,
        refreshed: true
      },
      message: 'Matches refreshed successfully'
    });
  } catch (error: any) {
    logger.error(`Error refreshing matches: ${error.message}`);

    if (error.message.includes('profile not found')) {
      res.status(404).json({
        success: false,
        error: 'Profile not found. Please complete your profile first.',
        profileRequired: true
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to refresh matches'
    });
  }
};
