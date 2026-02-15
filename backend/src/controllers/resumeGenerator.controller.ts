import { Request, Response } from 'express';
import axios from 'axios';
import { User } from '../models/User.model';
import { Profile } from '../models/Profile.model';
import { logger } from '../config/logger';

const AUTOMATION_URL = process.env.AUTOMATION_URL || 'http://localhost:3001';

export const generateResume = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    logger.info(`Resume generation requested by user ${userId}, proxying to automation service`);

    // Fetch user and full profile to send real data to automation
    const [user, profile] = await Promise.all([
      User.findById(userId),
      Profile.findOne({ userId })
    ]);

    const userProfile: Record<string, any> = {};

    if (user) {
      userProfile.firstName = user.firstName;
      userProfile.middleName = user.middleName || '';
      userProfile.lastName = user.lastName;
      userProfile.email = user.email;
    }

    if (profile) {
      const p = profile.toObject();

      // Personal info (phone, location, links)
      if (p.personalInfo) {
        userProfile.phone = p.personalInfo.phone || '';
        userProfile.location = [p.personalInfo.address?.city, p.personalInfo.address?.country].filter(Boolean).join(', ');
        userProfile.linkedin = p.personalInfo.linkedin || '';
        userProfile.github = p.personalInfo.github || '';
        userProfile.portfolio = p.personalInfo.portfolio || '';
        userProfile.website = p.personalInfo.website || '';
      }

      // Professional summary
      if (p.professionalSummary) {
        userProfile.summary = p.professionalSummary.summary || '';
        userProfile.yearsOfExperience = p.professionalSummary.yearsOfExperience || 0;
        userProfile.specialization = p.professionalSummary.specialization || '';
      }

      // Skills
      if (p.skills && p.skills.length > 0) {
        userProfile.skills = p.skills.map((s: any) => ({
          name: s.name,
          category: s.category,
          level: s.level,
          yearsOfExperience: s.yearsOfExperience
        }));
      }

      // Work experiences
      if (p.workExperience && p.workExperience.length > 0) {
        userProfile.experiences = p.workExperience.map((e: any) => ({
          company: e.company,
          position: e.position,
          location: e.location || '',
          startDate: e.startDate,
          endDate: e.endDate,
          current: e.current || false,
          description: e.description || '',
          achievements: e.achievements || [],
          technologies: e.technologies || []
        }));
      }

      // Projects
      if (p.projects && p.projects.length > 0) {
        userProfile.projects = p.projects.map((proj: any) => ({
          name: proj.name,
          description: proj.description || '',
          role: proj.role || '',
          technologies: proj.technologies || [],
          startDate: proj.startDate,
          endDate: proj.endDate,
          current: proj.current || false,
          githubUrl: proj.githubUrl || '',
          demoUrl: proj.demoUrl || ''
        }));
      }

      // Education
      if (p.education && p.education.length > 0) {
        userProfile.education = p.education.map((ed: any) => ({
          institution: ed.institution,
          degree: ed.degree,
          fieldOfStudy: ed.field || '',
          location: ed.location || '',
          startDate: ed.startDate,
          endDate: ed.endDate,
          gpa: ed.gpa || '',
          achievements: ed.achievements || []
        }));
      }

      // Certifications
      if (p.certifications && p.certifications.length > 0) {
        userProfile.certifications = p.certifications.map((c: any) => ({
          name: c.name,
          issuer: c.issuer,
          issueDate: c.issueDate,
          expiryDate: c.expiryDate,
          credentialId: c.credentialId || '',
          credentialUrl: c.credentialUrl || ''
        }));
      }
    }

    const response = await axios.post(
      `${AUTOMATION_URL}/api/v1/resume-generator/generate`,
      {
        jobDescription: req.body.jobDescription,
        userProfile
      },
      { timeout: 30000 }
    );

    res.status(response.status).json(response.data);
  } catch (error: any) {
    logger.error('Resume generation proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        success: false,
        message: 'Automation service is not running. Start it with: cd automation && npm run dev'
      });
      return;
    }

    if (error.response) {
      res.status(error.response.status).json(error.response.data);
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to generate resume. Please try again.'
    });
  }
};
