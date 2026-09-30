import { Router } from 'express';
import { validateObjectIdParam } from '../utils/httpErrors';
import authMiddleware from '../middleware/auth.middleware';
import {
  getNotifications,
  getNotificationUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification
} from '../controllers/notification.controller';

const router = Router();
router.param('id', validateObjectIdParam);

// All routes require authentication
router.use(authMiddleware);

router.get('/', getNotifications);
router.get('/unread-count', getNotificationUnreadCount);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);
router.delete('/:id', removeNotification);

export default router;
