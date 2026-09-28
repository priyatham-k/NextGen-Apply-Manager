import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import {
  createResume,
  getResumes,
  getResume,
  updateResume,
  deleteResume
} from '../controllers/resume.controller';
import * as resumeUploadController from '../controllers/resumeUpload.controller';
import { documentUpload } from '../config/multer.config';

const router = Router();

router.use(authMiddleware);

// Uploaded resume file routes (must be before /:id to avoid "uploads" being treated as an ID)
router.post('/upload', documentUpload.single('resume'), resumeUploadController.uploadResume);
router.get('/uploads', resumeUploadController.getUserResumes);
router.delete('/uploads/:id', resumeUploadController.deleteUploadedResume);
router.patch('/uploads/:id/set-primary', resumeUploadController.setPrimaryResume);

// Resume builder routes
router.get('/', getResumes);
router.post('/', createResume);
router.get('/:id', getResume);
router.put('/:id', updateResume);
router.delete('/:id', deleteResume);

export default router;
