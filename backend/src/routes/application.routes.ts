import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import {
  getApplications,
  getApplicationById,
  createApplication,
  updateApplicationStatus,
  deleteApplication,
  getApplicationStats,
  getScreenshot
} from '../controllers/application.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Static routes BEFORE parameterized routes
router.get('/stats', getApplicationStats);

// CRUD routes
router.get('/', getApplications);
router.post('/', createApplication);
router.get('/:id', getApplicationById);
router.get('/:id/screenshots/:filename', getScreenshot);
router.patch('/:id/status', updateApplicationStatus);
router.delete('/:id', deleteApplication);

export default router;
