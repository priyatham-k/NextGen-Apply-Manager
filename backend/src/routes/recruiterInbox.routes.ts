import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { validateObjectIdParam } from '../utils/httpErrors';
import * as controller from '../controllers/recruiterInbox.controller';

/** Recruiter emails from Gmail: review drafted replies and send them with the resume */
const router = Router();
router.param('emailId', validateObjectIdParam);
router.use(authMiddleware);

router.get('/', controller.getRecruiterInbox);
router.post('/check', controller.checkRecruiterInbox);
router.patch('/:emailId', controller.updateDraft);
router.post('/:emailId/regenerate', controller.regenerate);
router.post('/:emailId/send', controller.send);
router.post('/:emailId/dismiss', controller.setDismissed(true));
router.post('/:emailId/restore', controller.setDismissed(false));

export default router;
