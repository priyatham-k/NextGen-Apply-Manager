import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { generateResume } from '../controllers/resumeGenerator.controller';

const router = Router();

router.use(authMiddleware);

router.post('/generate', generateResume);

export default router;
