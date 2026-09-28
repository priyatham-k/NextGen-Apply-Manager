import { Notification, NotificationType } from '../models/Notification.model';
import { getIO } from '../config/socket';
import { logger } from '../config/logger';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: { applicationId?: string; jobId?: string }
) {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      data
    });

    // Emit real-time event to user's room
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit('notification', notification);
    } catch {
      // Socket.IO may not be initialized in tests
    }

    return notification;
  } catch (error) {
    logger.error('Failed to create notification:', error);
    throw error;
  }
}

export async function getUserNotifications(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ userId })
  ]);

  return {
    notifications,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, read: false });
}

export async function markAsRead(notificationId: string, userId: string) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true } },
    { new: true }
  );
}

export async function markAllAsRead(userId: string) {
  return Notification.updateMany(
    { userId, read: false },
    { $set: { read: true } }
  );
}

export async function deleteNotification(notificationId: string, userId: string) {
  return Notification.findOneAndDelete({ _id: notificationId, userId });
}
