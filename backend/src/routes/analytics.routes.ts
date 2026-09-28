import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { getDashboardAnalytics, getAIInsights } from '../controllers/analytics.controller';

const router = Router();

router.use(authMiddleware);

router.get('/dashboard', getDashboardAnalytics);
router.get('/insights', getAIInsights);

export default router;
