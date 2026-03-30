import { Router } from 'express';
import {
  getFullProfile,
  updateFullProfile,
  updateProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  checkProfileCompletion
} from '../controllers/profile.controller';
import authMiddleware from '../middleware/auth.middleware';
import { upload } from '../config/multer.config';

const router = Router();

// All profile routes require authentication
router.use(authMiddleware);

// Full profile (comprehensive)
router.get('/full', getFullProfile);
router.patch('/full', updateFullProfile);

// Profile completion check
router.get('/completion', checkProfileCompletion);

// Basic profile update
router.patch('/', updateProfile);

// Profile picture
router.post('/picture', upload.single('picture'), uploadProfilePicture);
router.delete('/picture', deleteProfilePicture);

export default router;
