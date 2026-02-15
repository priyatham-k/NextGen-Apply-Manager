import { Request, Response } from 'express';
import { User } from '../models/User.model';
import { Profile } from '../models/Profile.model';
import { logger } from '../config/logger';
import fs from 'fs';
import path from 'path';

/**
 * Get full profile (auto-creates if missing)
 * GET /api/v1/auth/profile/full
 */
export const getFullProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    let profile = await Profile.findOne({ userId });

    if (!profile) {
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      profile = await Profile.create({
        userId,
        personalInfo: {
          firstName: user.firstName,
          middleName: user.middleName || '',
          lastName: user.lastName,
          email: user.email
        },
        workExperience: [],
        projects: [],
        education: [],
        skills: [],
        certifications: [],
        additionalInfo: {
          awards: [],
          publications: [],
          languages: [],
          volunteerExperience: []
        }
      });

      logger.info(`Default profile created for user: ${userId}`);
    }

    res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    logger.error('Get full profile error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Update full profile (accepts partial data — any section)
 * PATCH /api/v1/auth/profile/full
 */
export const updateFullProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const updateData = req.body;

    // Ensure profile exists
    let profile = await Profile.findOne({ userId });
    if (!profile) {
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      profile = await Profile.create({
        userId,
        personalInfo: {
          firstName: user.firstName,
          middleName: user.middleName || '',
          lastName: user.lastName,
          email: user.email
        },
        workExperience: [],
        projects: [],
        education: [],
        skills: [],
        certifications: [],
        additionalInfo: {
          awards: [],
          publications: [],
          languages: [],
          volunteerExperience: []
        }
      });
    }

    // Build $set object from provided sections
    const $set: Record<string, any> = {};

    if (updateData.personalInfo) $set.personalInfo = updateData.personalInfo;
    if (updateData.professionalSummary) $set.professionalSummary = updateData.professionalSummary;
    if (updateData.workExperience) $set.workExperience = updateData.workExperience;
    if (updateData.projects) $set.projects = updateData.projects;
    if (updateData.education) $set.education = updateData.education;
    if (updateData.skills) $set.skills = updateData.skills;
    if (updateData.certifications) $set.certifications = updateData.certifications;
    if (updateData.additionalInfo) $set.additionalInfo = updateData.additionalInfo;

    const updatedProfile = await Profile.findOneAndUpdate(
      { userId },
      { $set },
      { new: true, runValidators: true }
    );

    // Sync name/email back to User model when personalInfo changes
    if (updateData.personalInfo) {
      const pi = updateData.personalInfo;
      const userUpdate: Record<string, any> = {};
      if (pi.firstName) userUpdate.firstName = pi.firstName;
      if (pi.lastName) userUpdate.lastName = pi.lastName;
      if (pi.middleName !== undefined) userUpdate.middleName = pi.middleName || '';
      if (pi.email) userUpdate.email = pi.email.toLowerCase();

      if (Object.keys(userUpdate).length > 0) {
        await User.findByIdAndUpdate(userId, userUpdate);
      }
    }

    logger.info(`Profile updated for user: ${userId}, sections: ${Object.keys($set).join(', ')}`);

    res.status(200).json({
      success: true,
      data: updatedProfile,
      message: 'Profile updated successfully'
    });
  } catch (error: any) {
    logger.error('Update full profile error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Update user profile (firstName, lastName, email)
 * PATCH /api/v1/auth/profile
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { firstName, middleName, lastName, email } = req.body;

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
    const updateData: any = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim()
    };
    if (middleName !== undefined) {
      updateData.middleName = middleName ? middleName.trim() : '';
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
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
