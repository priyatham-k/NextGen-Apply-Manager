import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import {
  getJobs,
  getJobById,
  updateJobStatus,
  triggerJobFetch,
  getJobStats,
  searchInternetJobs
} from '../controllers/job.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Static routes BEFORE parameterized routes
router.get('/stats', getJobStats);
router.post('/fetch', triggerJobFetch);
router.post('/search-internet', searchInternetJobs);

// Parameterized routes
router.get('/', getJobs);
router.get('/:id', getJobById);
router.patch('/:id/status', updateJobStatus);

export default router;
