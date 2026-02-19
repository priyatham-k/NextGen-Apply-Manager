import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { getSettings, updateSettings, changePassword } from '../controllers/settings.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getSettings);
router.put('/', updateSettings);
router.put('/change-password', changePassword);

export default router;
