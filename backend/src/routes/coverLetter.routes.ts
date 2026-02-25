import express from 'express';
import {
  generateNewCoverLetter,
  getCoverLetters,
  getCoverLetterById,
  deleteCoverLetter,
  extractDetails
} from '../controllers/coverLetter.controller';
import authMiddleware from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// POST /api/v1/cover-letters/extract-details - Extract company/position from JD
router.post('/extract-details', extractDetails);

// POST /api/v1/cover-letters/generate - Generate new cover letter
router.post('/generate', generateNewCoverLetter);

// GET /api/v1/cover-letters - Get all user's cover letters
router.get('/', getCoverLetters);

// GET /api/v1/cover-letters/:id - Get specific cover letter
router.get('/:id', getCoverLetterById);

// DELETE /api/v1/cover-letters/:id - Delete cover letter
router.delete('/:id', deleteCoverLetter);

export default router;
