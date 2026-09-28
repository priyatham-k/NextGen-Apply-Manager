import { Resume, IResume } from '../models/Resume.model';
import { logger } from '../config/logger';

export async function createResume(userId: string, data: Partial<IResume>) {
  try {
    const resume = await Resume.create({ userId, ...data });
    return resume;
  } catch (error: any) {
    if (error.code === 11000) {
      const err = new Error('A resume with this title already exists');
      (err as any).code = 11000;
      throw err;
    }
    logger.error('Failed to create resume:', error);
    throw error;
  }
}

export async function getUserResumes(userId: string) {
  return Resume.find({ userId }).sort({ updatedAt: -1 });
}

export async function getResumeById(resumeId: string, userId: string) {
  return Resume.findOne({ _id: resumeId, userId });
}

export async function updateResume(resumeId: string, userId: string, data: Partial<IResume>) {
  try {
    // Check for duplicate title if title is being changed
    if (data.title) {
      const existing = await Resume.findOne({
        userId,
        title: data.title,
        _id: { $ne: resumeId }
      });
      if (existing) {
        const err = new Error('A resume with this title already exists');
        (err as any).code = 11000;
        throw err;
      }
    }

    return Resume.findOneAndUpdate(
      { _id: resumeId, userId },
      { $set: data },
      { new: true }
    );
  } catch (error: any) {
    if (error.code === 11000) throw error;
    logger.error('Failed to update resume:', error);
    throw error;
  }
}

export async function deleteResume(resumeId: string, userId: string) {
  return Resume.findOneAndDelete({ _id: resumeId, userId });
}
