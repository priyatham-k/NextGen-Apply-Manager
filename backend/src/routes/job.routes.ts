import { Router } from 'express';
import { validateObjectIdParam } from '../utils/httpErrors';
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
router.param('id', validateObjectIdParam);

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
