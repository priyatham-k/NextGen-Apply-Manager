import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface DocSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  steps: { title: string; detail: string }[];
  tips?: string[];
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.scss']
})
export class DocsComponent {
  activeSection = signal<string>('getting-started');

  sections: DocSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: 'bi-rocket-takeoff',
      description: 'Set up your profile and start your job search in minutes.',
      steps: [
        {
          title: 'Create Your Account',
          detail: 'Sign up with your email and password. Your data is securely stored and only accessible to you.'
        },
        {
          title: 'Complete Your Profile',
          detail: 'Navigate to Profile and fill in your personal details, work experience, education, and skills. This data powers your resume builder and job matching.'
        },
        {
          title: 'Upload Your Resume',
          detail: 'Go to Profile and upload a PDF resume. Our AI parser (powered by Groq LLaMA) will automatically extract and populate your profile fields — saving you time.'
        },
        {
          title: 'Explore the Dashboard',
          detail: 'Your Dashboard gives you a bird\'s-eye view of your job search: applications submitted, interviews scheduled, and recent activity.'
        }
      ],
      tips: [
        'Keep your profile up to date — it directly impacts your ATS score and job matching accuracy.',
        'Upload a clean, single-column PDF resume for the best parsing results.'
      ]
    },
    {
      id: 'job-search',
      title: 'Finding Jobs',
      icon: 'bi-search',
      description: 'Browse, search, and discover job opportunities tailored to your skills.',
      steps: [
        {
          title: 'Browse Job Listings',
          detail: 'The Jobs page shows available positions pulled from multiple sources. Use the search bar to filter by title, company, or keywords.'
        },
        {
          title: 'Filter & Sort',
          detail: 'Narrow down results by job type (Full-time, Part-time, Contract, Remote), experience level, and location. Sort by date posted or relevance.'
        },
        {
          title: 'View Job Details',
          detail: 'Click any job card to see the full description, requirements, salary range, and company information. From here you can apply or save for later.'
        },
        {
          title: 'Top Matching Jobs',
          detail: 'Visit Top Matching Jobs to see positions ranked by how well they match your profile skills and experience. Higher match percentages mean better fit.'
        }
      ],
      tips: [
        'Check the Top Matching Jobs page regularly — it automatically ranks new jobs against your profile.',
        'Use specific skill keywords when searching to find the most relevant positions.'
      ]
    },
    {
      id: 'resume-builder',
      title: 'Resume Builder',
      icon: 'bi-file-earmark-text',
      description: 'Create professional, ATS-friendly resumes with multiple templates.',
      steps: [
        {
          title: 'Choose a Template',
          detail: 'Select from 4 professionally designed templates: Classic (traditional with blue accents), Modern (sidebar layout), Minimal (clean monochrome), and Professional (two-column header).'
        },
        {
          title: 'Fill in Your Details',
          detail: 'Enter your personal information, professional summary, work experience, education, and skills. Each section has validation to ensure completeness.'
        },
        {
          title: 'Live Preview',
          detail: 'Toggle the live preview to see exactly how your resume will look. The preview updates in real-time as you type — no need to save first.'
        },
        {
          title: 'Save Multiple Versions',
          detail: 'Save different resume versions for different job types. Give each a unique title (e.g., "Frontend Developer Resume", "Full Stack Resume"). All resumes are stored securely in your account.'
        },
        {
          title: 'Download as PDF',
          detail: 'Click the Download button to export your resume as a PDF. The output uses print-optimized styling for clean, professional results.'
        }
      ],
      tips: [
        'Create tailored resumes for each job type you\'re targeting — a generic resume scores lower on ATS systems.',
        'Include quantifiable achievements (e.g., "Increased sales by 30%") rather than vague descriptions.',
        'Keep your resume to 1-2 pages. Most ATS systems and recruiters prefer concise resumes.',
        'Use the Classic or Professional template for traditional industries; Modern or Minimal for tech/creative roles.'
      ]
    },
    {
      id: 'ats-score',
      title: 'ATS Resume Score',
      icon: 'bi-star',
      description: 'Get an AI-powered analysis of how well your resume will perform with Applicant Tracking Systems.',
      steps: [
        {
          title: 'Upload Your Resume',
          detail: 'Go to Resume Score and upload your resume as a PDF. Our system extracts the text for analysis.'
        },
        {
          title: 'Add a Job Description (Optional)',
          detail: 'For the most accurate results, paste the job description you\'re targeting. The AI will score your resume specifically against that job\'s requirements and keywords.'
        },
        {
          title: 'Get Your Score',
          detail: 'Click Analyze and our AI (Groq LLaMA 3.3) evaluates your resume across 6 categories, giving you a score from 0-100 with a letter grade.'
        },
        {
          title: 'Review the Breakdown',
          detail: 'Each category shows a detailed score, status indicator, and specific recommendations for improvement.'
        },
        {
          title: 'Improve & Rescan',
          detail: 'Update your resume based on the recommendations, then upload and analyze again. Aim for a score of 75+ for the best interview chances.'
        }
      ],
      tips: [
        'Always include the job description for a targeted score — a generic scan is less actionable.',
        'Focus on the lowest-scoring categories first for maximum improvement.',
        'Scores above 75 typically correlate with higher interview callback rates.',
        'Common ATS killers: graphics/images, headers/footers with key info, non-standard fonts, and multi-column layouts.'
      ]
    },
    {
      id: 'applications',
      title: 'Application Tracking',
      icon: 'bi-file-text',
      description: 'Track every application from submission through offer.',
      steps: [
        {
          title: 'Submit Applications',
          detail: 'Apply to jobs directly from the job details page. Select which resume to attach, add an optional cover letter, and submit.'
        },
        {
          title: 'Track Status',
          detail: 'The Applications page shows all your submissions with their current status: Submitted, Under Review, Interview Scheduled, Offered, or Rejected.'
        },
        {
          title: 'View Application Details',
          detail: 'Click any application to see the full timeline: when you applied, status changes, interview dates, and any notes you\'ve added.'
        },
        {
          title: 'Get Notifications',
          detail: 'Receive real-time notifications when your application status changes. Check the bell icon in the header or visit the Notifications page for your full history.'
        }
      ],
      tips: [
        'Apply to jobs within 48 hours of posting — early applications get 2-3x more visibility.',
        'Track your response rates to understand which resume versions perform best.',
        'Use the Analytics page to visualize your application trends over time.'
      ]
    },
    {
      id: 'my-resumes',
      title: 'My Resumes',
      icon: 'bi-file-earmark-person',
      description: 'Manage all your saved resumes in one place.',
      steps: [
        {
          title: 'View Saved Resumes',
          detail: 'The My Resumes page shows all resumes you\'ve created. Each card shows the title, template used, and last updated date.'
        },
        {
          title: 'Load & Edit',
          detail: 'Click any saved resume to load it into the editor. Make changes, preview, and save — your updates are automatically synced.'
        },
        {
          title: 'Create New Versions',
          detail: 'Click "New Resume" to start fresh. Give it a descriptive title that reflects the role you\'re targeting.'
        },
        {
          title: 'Delete Old Resumes',
          detail: 'Remove outdated resumes to keep your workspace clean. Deleted resumes cannot be recovered.'
        }
      ],
      tips: [
        'Maintain 2-3 tailored resume versions for different job categories.',
        'Name your resumes descriptively: "John_Smith_Frontend_Dev" is better than "Resume_v2".',
        'Review and update your resumes monthly, even when not actively job hunting.'
      ]
    },
    {
      id: 'analytics',
      title: 'Analytics & Insights',
      icon: 'bi-bar-chart',
      description: 'Understand your job search performance with data-driven insights.',
      steps: [
        {
          title: 'Dashboard Overview',
          detail: 'Your Dashboard shows key metrics at a glance: total applications, interviews, offers, and your application success rate.'
        },
        {
          title: 'Application Trends',
          detail: 'The Analytics page visualizes your application activity over time — see peaks, patterns, and progress.'
        },
        {
          title: 'Status Breakdown',
          detail: 'View a pie chart of your application statuses to understand your funnel: how many applications convert to interviews, and interviews to offers.'
        }
      ],
      tips: [
        'A healthy interview rate is 10-15% of applications. If yours is lower, focus on improving your ATS score.',
        'Track weekly application volume — consistency matters more than spikes.',
        'Use status breakdowns to identify where you lose momentum (e.g., many "Under Review" but few interviews).'
      ]
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: 'bi-bell',
      description: 'Stay updated on your applications and job matches in real-time.',
      steps: [
        {
          title: 'Real-Time Alerts',
          detail: 'The bell icon in the header shows your unread notification count. Click it for a quick dropdown view of recent alerts.'
        },
        {
          title: 'Full Notifications Page',
          detail: 'Visit the Notifications page from the sidebar for a complete, filterable list of all notifications.'
        },
        {
          title: 'Filter by Type',
          detail: 'Use the filter tabs to view specific notification types: Applications, Status Updates, Job Matches, or System messages.'
        },
        {
          title: 'Take Action',
          detail: 'Click any notification to navigate directly to the related application or job listing.'
        }
      ]
    },
    {
      id: 'settings',
      title: 'Settings & Preferences',
      icon: 'bi-gear',
      description: 'Customize your experience and manage your account.',
      steps: [
        {
          title: 'Job Preferences',
          detail: 'Set your preferred job types, locations, salary range, and experience level. These preferences influence your job matching results.'
        },
        {
          title: 'Notification Preferences',
          detail: 'Choose which notification types you want to receive: application updates, new job matches, system announcements.'
        },
        {
          title: 'Account Settings',
          detail: 'Update your email, change your password, or manage your account from the Settings page.'
        }
      ]
    }
  ];

  scoring = [
    { range: '90-100', grade: 'A+', color: '#22c55e', label: 'Excellent', description: 'Your resume is highly optimized and ready to submit.' },
    { range: '80-89', grade: 'A', color: '#22c55e', label: 'Very Good', description: 'Strong resume with minor improvement opportunities.' },
    { range: '70-79', grade: 'B', color: '#f59e0b', label: 'Good', description: 'Solid foundation but could benefit from targeted improvements.' },
    { range: '60-69', grade: 'C', color: '#f97316', label: 'Fair', description: 'Needs attention — review the category breakdown for specific fixes.' },
    { range: 'Below 60', grade: 'D/F', color: '#ef4444', label: 'Needs Work', description: 'Significant improvements needed. Focus on the lowest-scoring categories.' }
  ];

  atsCategories = [
    { name: 'Formatting & Layout', icon: 'bi-layout-text-sidebar-reverse', description: 'Clean structure, consistent spacing, standard fonts, proper margins' },
    { name: 'Content Quality', icon: 'bi-file-earmark-text', description: 'Achievement-focused bullets, quantifiable results, clear language' },
    { name: 'Keyword Optimization', icon: 'bi-key', description: 'Industry-relevant keywords matching the job description' },
    { name: 'ATS Compatibility', icon: 'bi-robot', description: 'Parseable format, no images/graphics, standard section headings' },
    { name: 'Structure & Organization', icon: 'bi-list-check', description: 'Logical section order, appropriate resume length, clear hierarchy' },
    { name: 'Impact & Achievements', icon: 'bi-graph-up-arrow', description: 'Measurable results, action verbs, relevant accomplishments' }
  ];

  shortcuts = [
    { keys: 'Dashboard', path: '/dashboard', description: 'Overview of your job search activity' },
    { keys: 'Jobs', path: '/jobs', description: 'Browse and search job listings' },
    { keys: 'Applications', path: '/applications', description: 'Track your submitted applications' },
    { keys: 'Resume Builder', path: '/resume-builder', description: 'Create and edit resumes' },
    { keys: 'Resume Score', path: '/resume-score', description: 'AI-powered ATS analysis' },
    { keys: 'Top Matches', path: '/top-matches', description: 'Jobs ranked by your profile fit' },
    { keys: 'My Resumes', path: '/my-resumes', description: 'Manage saved resumes' },
    { keys: 'Analytics', path: '/analytics', description: 'Application stats and trends' },
    { keys: 'Notifications', path: '/notifications', description: 'All alerts and updates' },
    { keys: 'Profile', path: '/profile', description: 'Your personal info and resume upload' },
    { keys: 'Settings', path: '/settings', description: 'Preferences and account management' }
  ];

  setActiveSection(id: string): void {
    this.activeSection.set(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
