import { Request, Response } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { Application, ApplicationStatus } from '../models/Application.model';
import { Job } from '../models/Job.model';
import { logger } from '../config/logger';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SUCCESS_STATUSES = [ApplicationStatus.OFFER_RECEIVED, ApplicationStatus.ACCEPTED];
const FAIL_STATUSES = [ApplicationStatus.REJECTED, ApplicationStatus.FAILED];
const PENDING_STATUSES = [ApplicationStatus.PENDING, ApplicationStatus.SUBMITTED, ApplicationStatus.IN_REVIEW];

// GET /api/v1/analytics/dashboard
export const getDashboardAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const [
      statusCounts,
      timelineDocs,
      topCompanies,
      periodCounts,
      totalJobs,
      avgMatchResult
    ] = await Promise.all([
      // 1. Status breakdown
      Application.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      // 2. Timeline (last 30 days)
      Application.aggregate([
        {
          $match: {
            userId: userObjectId,
            appliedDate: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedDate' } },
            applications: { $sum: 1 },
            successful: {
              $sum: { $cond: [{ $in: ['$status', SUCCESS_STATUSES] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $in: ['$status', FAIL_STATUSES] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // 3. Top companies (lookup job to get company name)
      Application.aggregate([
        { $match: { userId: userObjectId } },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobId',
            foreignField: '_id',
            as: 'job'
          }
        },
        { $unwind: '$job' },
        {
          $group: {
            _id: '$job.company',
            count: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $in: ['$status', SUCCESS_STATUSES] }, 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // 4. Period counts (today, this week, this month)
      Application.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            today: {
              $sum: { $cond: [{ $gte: ['$appliedDate', todayStart] }, 1, 0] }
            },
            thisWeek: {
              $sum: { $cond: [{ $gte: ['$appliedDate', weekStart] }, 1, 0] }
            },
            thisMonth: {
              $sum: { $cond: [{ $gte: ['$appliedDate', monthStart] }, 1, 0] }
            }
          }
        }
      ]),

      // 5. Total jobs
      Job.countDocuments(),

      // 6. Average match score for user's applied jobs
      Application.aggregate([
        { $match: { userId: userObjectId } },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobId',
            foreignField: '_id',
            as: 'job'
          }
        },
        { $unwind: '$job' },
        {
          $group: {
            _id: null,
            avg: { $avg: '$job.matchScore' }
          }
        }
      ])
    ]);

    // Build status map
    const byStatus: Record<string, number> = {};
    let totalApplications = 0;
    let successfulApplications = 0;
    let failedApplications = 0;
    let pendingApplications = 0;

    for (const s of statusCounts) {
      byStatus[s._id] = s.count;
      totalApplications += s.count;
      if (SUCCESS_STATUSES.includes(s._id)) successfulApplications += s.count;
      if (FAIL_STATUSES.includes(s._id)) failedApplications += s.count;
      if (PENDING_STATUSES.includes(s._id)) pendingApplications += s.count;
    }

    const applicationsByStatus = statusCounts.map((s: { _id: string; count: number }) => ({
      status: s._id,
      count: s.count
    }));

    // Build timeline with all 30 days filled
    const timelineMap = new Map<string, { applications: number; successful: number; failed: number }>();
    for (const doc of timelineDocs) {
      timelineMap.set(doc._id, {
        applications: doc.applications,
        successful: doc.successful,
        failed: doc.failed
      });
    }
    const applicationTimeline = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      applicationTimeline.push({
        date: key,
        ...(timelineMap.get(key) || { applications: 0, successful: 0, failed: 0 })
      });
    }

    const topCompaniesData = topCompanies.map((c: { _id: string; count: number; successCount: number }) => ({
      company: c._id,
      count: c.count,
      successRate: c.count > 0 ? Math.round((c.successCount / c.count) * 100) : 0
    }));

    const period = periodCounts[0] || { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };

    res.status(200).json({
      success: true,
      data: {
        totalApplications,
        successfulApplications,
        failedApplications,
        pendingApplications,
        totalJobs,
        averageMatchScore: Math.round(avgMatchResult[0]?.avg || 0),
        applicationsToday: period.today,
        applicationsThisWeek: period.thisWeek,
        applicationsThisMonth: period.thisMonth,
        applicationsByStatus,
        applicationTimeline,
        topCompanies: topCompaniesData
      }
    });
  } catch (error: any) {
    logger.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching analytics',
      error: error.message
    });
  }
};

// GET /api/v1/analytics/insights
export const getAIInsights = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ success: false, message: 'GROQ_API_KEY is not configured' });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Gather aggregated data for AI analysis
    const [statusCounts, periodCounts, topCompanies, avgMatch] = await Promise.all([
      Application.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            today: { $sum: { $cond: [{ $gte: ['$appliedDate', todayStart] }, 1, 0] } },
            thisWeek: { $sum: { $cond: [{ $gte: ['$appliedDate', weekStart] }, 1, 0] } },
            thisMonth: { $sum: { $cond: [{ $gte: ['$appliedDate', monthStart] }, 1, 0] } }
          }
        }
      ]),
      Application.aggregate([
        { $match: { userId: userObjectId } },
        { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'job' } },
        { $unwind: '$job' },
        {
          $group: {
            _id: '$job.company',
            count: { $sum: 1 },
            successCount: { $sum: { $cond: [{ $in: ['$status', SUCCESS_STATUSES] }, 1, 0] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Application.aggregate([
        { $match: { userId: userObjectId } },
        { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'job' } },
        { $unwind: '$job' },
        { $group: { _id: null, avg: { $avg: '$job.matchScore' } } }
      ])
    ]);

    // Build summary for AI
    const period = periodCounts[0] || { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };
    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const s of statusCounts) {
      statusMap[s._id] = s.count;
      total += s.count;
    }

    if (total === 0) {
      res.status(200).json({
        success: true,
        data: { insights: [], generatedAt: new Date().toISOString() }
      });
      return;
    }

    const successful = (statusMap['offer_received'] || 0) + (statusMap['accepted'] || 0);
    const interviews = statusMap['interview_scheduled'] || 0;
    const rejected = (statusMap['rejected'] || 0) + (statusMap['failed'] || 0);
    const pending = (statusMap['pending'] || 0) + (statusMap['submitted'] || 0) + (statusMap['in_review'] || 0);
    const interviewRate = total > 0 ? ((interviews / total) * 100).toFixed(1) : '0';
    const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : '0';
    const avgMatchScore = Math.round(avgMatch[0]?.avg || 0);

    const companySummary = topCompanies
      .map((c: { _id: string; count: number; successCount: number }) =>
        `${c._id}: ${c.count} apps, ${c.count > 0 ? Math.round((c.successCount / c.count) * 100) : 0}% success`
      ).join('; ');

    const dataSummary = `Job Search Analytics Summary:
- Total Applications: ${total}
- Applications Today: ${period.today}, This Week: ${period.thisWeek}, This Month: ${period.thisMonth}
- Status Breakdown: ${Object.entries(statusMap).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Interview Rate: ${interviewRate}%
- Success Rate (offers/accepted): ${successRate}%
- Rejected/Failed: ${rejected}
- Pending/In Review: ${pending}
- Average Job Match Score: ${avgMatchScore}%
- Top Companies Applied To: ${companySummary || 'None yet'}`;

    const systemPrompt = `You are a career advisor and job search analytics expert. Analyze the user's job application data and provide personalized, actionable insights.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "insights": [
    {
      "type": "positive" | "warning" | "tip",
      "title": "<short title, max 6 words>",
      "message": "<1-2 sentence actionable insight based on their actual numbers>"
    }
  ]
}

Rules:
- Provide exactly 4-6 insights
- Use "positive" for things going well, "warning" for areas needing attention, "tip" for actionable advice
- Reference their actual numbers (e.g., "Your 12 applications this week...")
- Be specific and data-driven, not generic
- If interview rate is below 10%, flag it as a warning
- If success rate is 0%, encourage and give concrete next steps
- If they apply to few companies repeatedly, suggest diversifying
- Keep each message under 150 characters
- Return ONLY the JSON object`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dataSummary }
        ],
        temperature: 0.3,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from Groq API');
    }

    // Clean markdown fences if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    logger.info(`AI insights generated for user ${userId}`);

    res.status(200).json({
      success: true,
      data: {
        insights: parsed.insights || [],
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    logger.error('Get AI insights error:', error);
    if (error instanceof SyntaxError) {
      res.status(500).json({ success: false, message: 'Failed to parse AI response. Please try again.' });
    } else {
      res.status(500).json({ success: false, message: 'Server error generating insights', error: error.message });
    }
  }
};
