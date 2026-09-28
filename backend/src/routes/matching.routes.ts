import express from 'express';
import { getTopMatches, getMatchDetails, refreshMatches } from '../controllers/matching.controller';
import authMiddleware from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/v1/matching/top-matches - Get top matching jobs
router.get('/top-matches', getTopMatches);

// GET /api/v1/matching/jobs/:jobId/details - Get match details for specific job
router.get('/jobs/:jobId/details', getMatchDetails);

// POST /api/v1/matching/refresh - Refresh match calculations
router.post('/refresh', refreshMatches);

export default router;
