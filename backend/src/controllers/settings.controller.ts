import { Request, Response } from 'express';
import { User } from '../models/User.model';
import { UserSettings } from '../models/Settings.model';
import { logger } from '../config/logger';

/**
 * Get user settings (auto-creates defaults if none exist)
 * GET /api/v1/settings
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    let settings = await UserSettings.findOne({ userId });

    if (!settings) {
      settings = await UserSettings.create({ userId });
      logger.info(`Default settings created for user: ${userId}`);
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    logger.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Update user settings (partial merge)
 * PUT /api/v1/settings
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const updateData = req.body;
    const $set: Record<string, any> = {};

    // Deep-merge each section
    if (updateData.notifications) {
      for (const [key, value] of Object.entries(updateData.notifications)) {
        $set[`notifications.${key}`] = value;
      }
    }

    if (updateData.jobPreferences) {
      for (const [key, value] of Object.entries(updateData.jobPreferences)) {
        $set[`jobPreferences.${key}`] = value;
      }
    }

    if (updateData.privacy) {
      for (const [key, value] of Object.entries(updateData.privacy)) {
        $set[`privacy.${key}`] = value;
      }
    }

    if (Object.keys($set).length === 0) {
      res.status(400).json({ success: false, message: 'No valid settings provided' });
      return;
    }

    // Upsert: create with defaults if doesn't exist, then apply changes
    const settings = await UserSettings.findOneAndUpdate(
      { userId },
      { $set },
      { new: true, upsert: true, runValidators: true }
    );

    logger.info(`Settings updated for user: ${userId}, fields: ${Object.keys($set).join(', ')}`);

    res.status(200).json({
      success: true,
      data: settings,
      message: 'Settings updated successfully'
    });
  } catch (error: any) {
    logger.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Change password
 * PUT /api/v1/settings/change-password
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      return;
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }

    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error: any) {
    logger.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
