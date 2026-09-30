import { Router } from 'express';
import { validateObjectIdParam } from '../utils/httpErrors';
import { extensionAuth } from '../services/extensionAuth.service';
import * as controller from '../controllers/applyQueue.controller';

/** Chrome extension routes (extension token, not the login JWT) */
const router = Router();
router.param('itemId', validateObjectIdParam);

// Pairing is the only unauthenticated route: the one-time code is the credential
router.post('/pair', controller.pairExtensionHandler);

router.use(extensionAuth);
router.get('/me', controller.getExtensionProfile);
router.get('/resume', controller.getExtensionResume);
router.get('/queue', controller.getExtensionQueue);
router.get('/queue/next', controller.getExtensionNextItem);
router.get('/queue/:itemId', controller.getExtensionItem);
router.post('/queue/:itemId/event', controller.postExtensionEvent);
router.post('/answers', controller.answerExtensionQuestions);

export default router;
