import { Router } from 'express';
import { register, login, getProfile, refreshToken } from '../controllers/auth.controller';
import { getFullProfile, updateFullProfile, updateProfile, uploadProfilePicture, deleteProfilePicture } from '../controllers/profile.controller';
import authMiddleware from '../middleware/auth.middleware';
import { upload } from '../config/multer.config';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.post('/refresh', authMiddleware, refreshToken);

// Full profile (comprehensive)
router.get('/profile/full', authMiddleware, getFullProfile);
router.patch('/profile/full', authMiddleware, updateFullProfile);

// Profile management routes (legacy basic update)
router.patch('/profile', authMiddleware, updateProfile);
router.post('/profile/picture', authMiddleware, upload.single('picture'), uploadProfilePicture);
router.delete('/profile/picture', authMiddleware, deleteProfilePicture);

export default router;
