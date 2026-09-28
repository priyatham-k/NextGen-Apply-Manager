import express from 'express';
import authMiddleware from '../middleware/auth.middleware';
import * as automationController from '../controllers/automation.controller';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Apply to a single job
router.post('/apply', automationController.applyToJob);

// Apply to multiple jobs in bulk
router.post('/apply-bulk', automationController.applyToBulk);

// Get automation status for an application
router.get('/status/:applicationId', automationController.getAutomationStatus);

// Retry a failed automation
router.post('/retry/:applicationId', automationController.retryAutomation);

// Cancel a pending automation
router.delete('/cancel/:applicationId', automationController.cancelAutomation);

// Get queue statistics (for monitoring)
router.get('/queue/stats', automationController.getQueueStats);

export default router;
