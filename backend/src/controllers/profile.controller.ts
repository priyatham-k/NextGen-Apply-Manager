import { Request, Response } from 'express';
import { User } from '../models/User.model';
import { logger } from '../config/logger';
import fs from 'fs';
import path from 'path';

/**
 * Update user profile (firstName, lastName, email)
 * PATCH /api/v1/auth/profile
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { firstName, lastName, email } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Validation
    if (!firstName || !lastName || !email) {
      res.status(400).json({
        success: false,
        message: 'firstName, lastName, and email are required'
      });
      return;
    }

    // Check if email is being changed
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // If email is changing, check for conflicts
    if (email.toLowerCase() !== currentUser.email.toLowerCase()) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });

      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'Email already in use by another account'
        });
        return;
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim()
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    logger.info(`Profile updated for user: ${userId}`);

    res.status(200).json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully'
    });
  } catch (error: any) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Upload profile picture
 * POST /api/v1/auth/profile/picture
 */
export const uploadProfilePicture = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const file = req.file;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    // Read file and convert to base64
    const fileBuffer = fs.readFileSync(file.path);
    const base64 = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;

    // Update user profilePicture field
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: base64 },
      { new: true }
    );

    if (!updatedUser) {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Delete temporary file from disk (optional: keep for backup)
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      logger.warn(`Failed to delete temp file: ${file.path}`, err);
    }

    logger.info(`Profile picture uploaded for user: ${userId}`);

    res.status(200).json({
      success: true,
      data: updatedUser,
      message: 'Profile picture uploaded successfully'
    });
  } catch (error: any) {
    logger.error('Upload profile picture error:', error);

    // Clean up file if it exists
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        logger.warn(`Failed to delete temp file after error: ${req.file.path}`, err);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete profile picture
 * DELETE /api/v1/auth/profile/picture
 */
export const deleteProfilePicture = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Remove profilePicture field from user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $unset: { profilePicture: '' } },
      { new: true }
    );

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    logger.info(`Profile picture deleted for user: ${userId}`);

    res.status(200).json({
      success: true,
      data: updatedUser,
      message: 'Profile picture deleted successfully'
    });
  } catch (error: any) {
    logger.error('Delete profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
