import { Request, Response } from 'express';
import fs from 'fs';
import { Profile } from '../models/Profile.model';
import { User } from '../models/User.model';
import { extractTextFromPDF, parseResumeWithAI } from '../services/resumeParser.service';
import { logger } from '../config/logger';

/**
 * Upload and parse a resume PDF, then auto-fill the user's profile
 * POST /api/v1/auth/profile/parse-resume
 */
export const parseResume = async (req: Request, res: Response): Promise<void> => {
  const filePath = req.file?.path;

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

    // 1. Extract text from PDF
    logger.info(`Extracting text from resume for user: ${userId}`);
    const resumeText = await extractTextFromPDF(req.file.path);

    if (!resumeText || resumeText.trim().length < 50) {
      res.status(400).json({
        success: false,
        message: 'Could not extract enough text from the PDF. Please ensure your resume is not image-based.'
      });
      return;
    }

    // 2. Parse with AI
    logger.info(`Sending resume to AI for parsing, user: ${userId}`);
    const parsedData = await parseResumeWithAI(resumeText);

    // 3. Ensure profile exists
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

    // 4. Sanitize AI output — filter out entries with empty required fields
    if (parsedData.workExperience) {
      parsedData.workExperience = parsedData.workExperience.filter((e: any) => e.company && e.position);
    }
    if (parsedData.education) {
      parsedData.education = parsedData.education.filter((e: any) => e.institution && e.degree);
    }
    if (parsedData.skills) {
      parsedData.skills = parsedData.skills.filter((s: any) => s.name);
    }
    if (parsedData.certifications) {
      parsedData.certifications = parsedData.certifications.filter((c: any) => c.name && c.issuer);
    }
    if (parsedData.projects) {
      parsedData.projects = parsedData.projects.filter((p: any) => p.name);
    }
    if (parsedData.additionalInfo) {
      const ai = parsedData.additionalInfo;
      if (ai.languages) {
        ai.languages = ai.languages.filter((l: any) => l.name && l.proficiency);
      }
      if (ai.awards) {
        ai.awards = ai.awards.filter((a: any) => a.title);
      }
      if (ai.publications) {
        ai.publications = ai.publications.filter((p: any) => p.title);
      }
      if (ai.volunteerExperience) {
        ai.volunteerExperience = ai.volunteerExperience.filter((v: any) => v.organization && v.role);
      }
    }

    // 5. Build $set from parsed data
    const $set: Record<string, any> = {};

    if (parsedData.personalInfo) $set.personalInfo = parsedData.personalInfo;
    if (parsedData.professionalSummary) $set.professionalSummary = parsedData.professionalSummary;
    if (parsedData.workExperience?.length) $set.workExperience = parsedData.workExperience;
    if (parsedData.education?.length) $set.education = parsedData.education;
    if (parsedData.skills?.length) $set.skills = parsedData.skills;
    if (parsedData.certifications?.length) $set.certifications = parsedData.certifications;
    if (parsedData.projects?.length) $set.projects = parsedData.projects;
    if (parsedData.additionalInfo) $set.additionalInfo = parsedData.additionalInfo;

    // 5. Update profile
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId },
      { $set },
      { new: true, runValidators: true }
    );

    // 6. Sync name/email to User model if personalInfo was extracted
    if (parsedData.personalInfo) {
      const pi = parsedData.personalInfo;
      const userUpdate: Record<string, any> = {};
      if (pi.firstName) userUpdate.firstName = pi.firstName;
      if (pi.lastName) userUpdate.lastName = pi.lastName;
      if (pi.middleName !== undefined) userUpdate.middleName = pi.middleName || '';
      if (Object.keys(userUpdate).length > 0) {
        await User.findByIdAndUpdate(userId, userUpdate);
      }
    }

    logger.info(`Resume parsed and profile updated for user: ${userId}, sections: ${Object.keys($set).join(', ')}`);

    res.status(200).json({
      success: true,
      data: updatedProfile,
      message: 'Resume parsed and profile updated successfully'
    });
  } catch (error: any) {
    logger.error('Resume parsing error:', error);

    if (error.message?.includes('GROQ_API_KEY')) {
      res.status(500).json({ success: false, message: error.message });
    } else if (error instanceof SyntaxError) {
      res.status(500).json({ success: false, message: 'Failed to parse AI response. Please try again.' });
    } else {
      res.status(500).json({ success: false, message: 'Server error during resume parsing', error: error.message });
    }
  } finally {
    // Clean up temp file
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
};
