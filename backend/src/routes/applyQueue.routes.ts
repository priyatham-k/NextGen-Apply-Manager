import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { validateObjectIdParam } from '../utils/httpErrors';
import * as controller from '../controllers/applyQueue.controller';

/** Web app routes for the extension apply flow (login JWT) */
const router = Router();
router.param('itemId', validateObjectIdParam);
router.param('connectionId', validateObjectIdParam);
router.use(authMiddleware);

router.get('/', controller.getApplyQueue);
router.post('/build', controller.buildApplyQueue);
router.post('/launch', controller.launchBrowser);
router.post('/extension/pairing-code', controller.getPairingCode);
router.delete('/extension/:connectionId', controller.revokeExtension);
router.post('/:itemId/skip', controller.markQueueItem('skipped'));
router.post('/:itemId/requeue', controller.requeueItem);
router.post('/:itemId/submitted', controller.markQueueItem('submitted'));

export default router;
