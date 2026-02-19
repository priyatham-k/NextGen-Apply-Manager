import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import {
  createResume,
  getResumes,
  getResume,
  updateResume,
  deleteResume
} from '../controllers/resume.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getResumes);
router.post('/', createResume);
router.get('/:id', getResume);
router.put('/:id', updateResume);
router.delete('/:id', deleteResume);

export default router;
