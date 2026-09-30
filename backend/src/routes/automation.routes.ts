import express from 'express';
import { validateObjectIdParam } from '../utils/httpErrors';
import authMiddleware from '../middleware/auth.middleware';
import * as automationController from '../controllers/automation.controller';

const router = express.Router();
router.param('applicationId', validateObjectIdParam);

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

// Submit a filled form after reviewing it
router.post('/submit/:applicationId', automationController.submitReviewedApplication);

// The user finished a held form themselves / bring its tab to the front
router.post('/confirm-submitted/:applicationId', automationController.confirmSubmittedByUser);
router.post('/focus/:applicationId', automationController.focusHeldTab);

// Close a filled form without submitting
router.post('/discard/:applicationId', automationController.discardReviewedApplication);

// Cancel a pending automation
router.delete('/cancel/:applicationId', automationController.cancelAutomation);

// Daily autopilot: run now / status
router.post('/autopilot/run', automationController.runAutopilotNow);
router.get('/autopilot/status', automationController.getAutopilotStatusHandler);

// Get queue statistics (for monitoring)
router.get('/queue/stats', automationController.getQueueStats);

export default router;
