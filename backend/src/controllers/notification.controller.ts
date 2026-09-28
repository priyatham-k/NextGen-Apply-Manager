import { Request, Response } from 'express';
import { logger } from '../config/logger';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
} from '../services/notification.service';

// GET /api/v1/notifications
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

    const result = await getUserNotifications(userId, page, limit);

    res.status(200).json({
      success: true,
      data: result.notifications,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error: any) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
};

// GET /api/v1/notifications/unread-count
export const getNotificationUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const count = await getUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error: any) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching unread count' });
  }
};

// PATCH /api/v1/notifications/:id/read
export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const notification = await markAsRead(req.params.id, userId);
    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error: any) {
    logger.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Server error marking notification as read' });
  }
};

// PATCH /api/v1/notifications/read-all
export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    await markAllAsRead(userId);

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Server error marking all as read' });
  }
};

// DELETE /api/v1/notifications/:id
export const removeNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const notification = await deleteNotification(req.params.id, userId);
    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error: any) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting notification' });
  }
};
