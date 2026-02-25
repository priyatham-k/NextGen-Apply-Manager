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

// Resume builder routes
router.get('/', getResumes);
router.post('/', createResume);
router.get('/:id', getResume);
router.put('/:id', updateResume);
router.delete('/:id', deleteResume);

// Uploaded resume file routes
router.post('/upload', documentUpload.single('resume'), resumeUploadController.uploadResume);
router.get('/uploads', resumeUploadController.getUserResumes);
router.delete('/uploads/:id', resumeUploadController.deleteUploadedResume);
router.patch('/uploads/:id/set-primary', resumeUploadController.setPrimaryResume);

export default router;
