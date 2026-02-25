import { IProfile } from '../models/Profile.model';
import { logger } from '../config/logger';

export interface ProfileCompletionResult {
  isComplete: boolean;
  completionScore: number;
  missingFields: string[];
  criticalMissing: string[];
}

export class ProfileCompletionService {
  /**
   * Check if profile is ready for automation
   * Requires minimum 70% completion
   */
  checkAutomationReadiness(profile: IProfile): ProfileCompletionResult {
    const missingFields: string[] = [];
    const criticalMissing: string[] = [];

    // ─── Critical Required Fields (Must have for automation) ────

    // Personal Information
    if (!profile.personalInfo?.firstName) {
      criticalMissing.push('First Name');
    }
    if (!profile.personalInfo?.lastName) {
      criticalMissing.push('Last Name');
    }
    if (!profile.personalInfo?.email) {
      criticalMissing.push('Email');
    }
    if (!profile.personalInfo?.phone) {
      criticalMissing.push('Phone Number');
    }

    // Address (required for most applications)
    if (!profile.personalInfo?.address?.city) {
      criticalMissing.push('City');
    }
    if (!profile.personalInfo?.address?.state) {
      criticalMissing.push('State');
    }
    if (!profile.personalInfo?.address?.country) {
      criticalMissing.push('Country');
    }

    // Professional Summary
    if (!profile.professionalSummary?.summary) {
      criticalMissing.push('Professional Summary');
    }

    // Work Experience (at least one)
    if (!profile.workExperience || profile.workExperience.length === 0) {
      criticalMissing.push('Work Experience (at least one)');
    }

    // Education (at least one)
    if (!profile.education || profile.education.length === 0) {
      criticalMissing.push('Education (at least one)');
    }

    // Skills (at least 3)
    if (!profile.skills || profile.skills.length < 3) {
      criticalMissing.push('Skills (at least 3)');
    }

    // ─── USA Screening Questions (Critical for automation) ──────

    if (!profile.screeningQuestions?.workAuthorization) {
      criticalMissing.push('Work Authorization Status');
    }

    if (profile.screeningQuestions?.requiresSponsorship === undefined) {
      criticalMissing.push('Visa Sponsorship Requirement');
    }

    if (profile.screeningQuestions?.willingToRelocate === undefined) {
      criticalMissing.push('Relocation Willingness');
    }

    // ─── Important But Not Critical ─────────────────────────────

    if (!profile.personalInfo?.linkedin) {
      missingFields.push('LinkedIn Profile');
    }

    if (!profile.screeningQuestions?.desiredSalary?.min) {
      missingFields.push('Desired Salary');
    }

    if (!profile.screeningQuestions?.earliestStartDate) {
      missingFields.push('Earliest Start Date');
    }

    if (!profile.screeningQuestions?.remoteWorkPreference) {
      missingFields.push('Remote Work Preference');
    }

    // Calculate completion score
    const completionScore = profile.profileCompletionScore || 0;

    // Profile is ready if:
    // 1. No critical fields missing
    // 2. Completion score >= 70%
    const isComplete = criticalMissing.length === 0 && completionScore >= 70;

    logger.info(`Profile completion check: ${completionScore}% complete, ${criticalMissing.length} critical missing`);

    return {
      isComplete,
      completionScore,
      missingFields: [...criticalMissing, ...missingFields],
      criticalMissing
    };
  }

  /**
   * Get user-friendly completion message
   */
  getCompletionMessage(result: ProfileCompletionResult): string {
    if (result.isComplete) {
      return '✅ Your profile is complete and ready for automation!';
    }

    if (result.criticalMissing.length > 0) {
      return `⚠️ Please complete your profile before using Auto Apply. Missing critical fields: ${result.criticalMissing.join(', ')}`;
    }

    return `Your profile is ${result.completionScore}% complete. Complete to 70% or above to use Auto Apply.`;
  }

  /**
   * Get notification for incomplete profile
   */
  getIncompleteProfileNotification(result: ProfileCompletionResult): {
    title: string;
    message: string;
    priority: 'high' | 'medium' | 'low';
  } {
    if (result.completionScore < 50) {
      return {
        title: '⚠️ Complete Your Profile',
        message: `Your profile is only ${result.completionScore}% complete. Add work experience, education, and screening answers to unlock Auto Apply.`,
        priority: 'high'
      };
    }

    if (result.criticalMissing.length > 0) {
      return {
        title: '📝 Almost There!',
        message: `Complete these fields to enable Auto Apply: ${result.criticalMissing.slice(0, 3).join(', ')}${result.criticalMissing.length > 3 ? ` and ${result.criticalMissing.length - 3} more` : ''}`,
        priority: 'medium'
      };
    }

    return {
      title: '✨ Improve Your Profile',
      message: `Your profile is ${result.completionScore}% complete. Add missing details for better automation results.`,
      priority: 'low'
    };
  }
}

export const profileCompletionService = new ProfileCompletionService();
