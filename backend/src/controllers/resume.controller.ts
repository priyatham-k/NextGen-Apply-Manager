import { Request, Response } from 'express';
import { logger } from '../config/logger';
import {
  createResume as createResumeService,
  getUserResumes,
  getResumeById,
  updateResume as updateResumeService,
  deleteResume as deleteResumeService
} from '../services/resume.service';

export const createResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!req.body.title) {
      res.status(400).json({ success: false, message: 'Resume title is required' });
      return;
    }

    const resume = await createResumeService(userId, req.body);
    res.status(201).json({ success: true, data: resume });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    logger.error('Create resume error:', error);
    res.status(500).json({ success: false, message: 'Server error creating resume' });
  }
};

export const getResumes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const resumes = await getUserResumes(userId);
    res.status(200).json({ success: true, data: resumes });
  } catch (error: any) {
    logger.error('Get resumes error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching resumes' });
  }
};

export const getResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const resume = await getResumeById(req.params.id, userId);
    if (!resume) {
      res.status(404).json({ success: false, message: 'Resume not found' });
      return;
    }

    res.status(200).json({ success: true, data: resume });
  } catch (error: any) {
    logger.error('Get resume error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching resume' });
  }
};

export const updateResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const resume = await updateResumeService(req.params.id, userId, req.body);
    if (!resume) {
      res.status(404).json({ success: false, message: 'Resume not found' });
      return;
    }

    res.status(200).json({ success: true, data: resume });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    logger.error('Update resume error:', error);
    res.status(500).json({ success: false, message: 'Server error updating resume' });
  }
};

export const deleteResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const resume = await deleteResumeService(req.params.id, userId);
    if (!resume) {
      res.status(404).json({ success: false, message: 'Resume not found' });
      return;
    }

    res.status(200).json({ success: true, message: 'Resume deleted' });
  } catch (error: any) {
    logger.error('Delete resume error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting resume' });
  }
};
