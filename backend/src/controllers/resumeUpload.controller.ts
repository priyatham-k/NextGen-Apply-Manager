import { Request, Response } from 'express';
import fs from 'fs';
import { UploadedResume } from '../models/UploadedResume.model';
import { logger } from '../config/logger';

/**
 * Upload a resume PDF for use in job applications
 * POST /api/v1/resumes/upload
 */
export const uploadResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No PDF file uploaded' });
      return;
    }

    const stats = fs.statSync(req.file.path);
    const { setPrimary } = req.body;

    // If setting as primary, unset other primary resumes
    if (setPrimary === 'true' || setPrimary === true) {
      await UploadedResume.updateMany(
        { userId, isPrimary: true },
        { $set: { isPrimary: false } }
      );
    }

    // Create the resume record
    const uploadedResume = await UploadedResume.create({
      userId,
      filename: req.file.originalname,
      storedFilename: req.file.filename,
      filePath: req.file.path,
      fileSize: stats.size,
      mimeType: req.file.mimetype,
      isPrimary: setPrimary === 'true' || setPrimary === true
    });

    logger.info(`Resume uploaded for user ${userId}: ${uploadedResume._id}`);

    res.status(201).json({
      success: true,
      data: uploadedResume,
      message: 'Resume uploaded successfully'
    });
  } catch (error: any) {
    logger.error('Resume upload error:', error);

    // Clean up file on error
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }

    res.status(500).json({
      success: false,
      message: 'Server error during resume upload',
      error: error.message
    });
  }
};

/**
 * Get all uploaded resumes for the current user
 * GET /api/v1/resumes/uploads
 */
export const getUserResumes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const resumes = await UploadedResume.find({ userId })
      .sort({ uploadedAt: -1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      data: resumes,
      count: resumes.length
    });
  } catch (error: any) {
    logger.error('Get user resumes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving resumes',
      error: error.message
    });
  }
};

/**
 * Delete an uploaded resume
 * DELETE /api/v1/resumes/uploads/:id
 */
export const deleteUploadedResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const resume = await UploadedResume.findOne({ _id: id, userId });

    if (!resume) {
      res.status(404).json({ success: false, message: 'Resume not found' });
      return;
    }

    // Delete the file from disk
    try {
      if (fs.existsSync(resume.filePath)) {
        fs.unlinkSync(resume.filePath);
        logger.info(`Deleted resume file: ${resume.filePath}`);
      }
    } catch (err: any) {
      logger.error(`Failed to delete file: ${err.message}`);
    }

    // Delete the database record
    await UploadedResume.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: 'Resume deleted successfully'
    });
  } catch (error: any) {
    logger.error('Delete resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting resume',
      error: error.message
    });
  }
};

/**
 * Set a resume as primary
 * PATCH /api/v1/resumes/uploads/:id/set-primary
 */
export const setPrimaryResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Unset all primary resumes
    await UploadedResume.updateMany(
      { userId, isPrimary: true },
      { $set: { isPrimary: false } }
    );

    // Set this one as primary
    const resume = await UploadedResume.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isPrimary: true } },
      { new: true }
    );

    if (!resume) {
      res.status(404).json({ success: false, message: 'Resume not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: resume,
      message: 'Primary resume updated'
    });
  } catch (error: any) {
    logger.error('Set primary resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error setting primary resume',
      error: error.message
    });
  }
};
