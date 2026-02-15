import { Request, Response } from 'express';
import { Job, JobStatus } from '../models/Job.model';
import { fetchJobs } from '../services/jobFetcher.service';
import { logger } from '../config/logger';

// GET /api/v1/jobs
export const getJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    // Text search
    const search = req.query.search as string;
    if (search) {
      filter.$text = { $search: search };
    }

    // Job type filter
    const jobTypes = req.query.jobTypes as string;
    if (jobTypes) {
      filter.jobType = { $in: jobTypes.split(',') };
    }

    // Experience level filter
    const experienceLevels = req.query.experienceLevels as string;
    if (experienceLevels) {
      filter.experienceLevel = { $in: experienceLevels.split(',') };
    }

    // Remote filter
    if (req.query.remote !== undefined) {
      filter.remote = req.query.remote === 'true';
    }

    // Status filter
    const status = req.query.status as string;
    if (status) {
      filter.status = { $in: status.split(',') };
    }

    // Minimum match score
    const minMatchScore = parseInt(req.query.minMatchScore as string);
    if (!isNaN(minMatchScore)) {
      filter.matchScore = { $gte: minMatchScore };
    }

    // Sort
    const sortBy = (req.query.sortBy as string) || 'postedDate';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = {};

    if (search) {
      sort.score = { $meta: 'textScore' } as any;
    }
    sort[sortBy] = sortOrder;

    const [data, total] = await Promise.all([
      search
        ? Job.find(filter, { score: { $meta: 'textScore' } })
            .sort(sort)
            .skip(skip)
            .limit(limit)
        : Job.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit),
      Job.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    // Return PaginatedResponse directly (not wrapped in ApiResponse)
    res.status(200).json({
      data,
      total,
      page,
      limit,
      totalPages
    });
  } catch (error: any) {
    logger.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching jobs',
      error: error.message
    });
  }
};

// GET /api/v1/jobs/:id
export const getJobById = async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Job not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: job,
      message: 'Job retrieved successfully'
    });
  } catch (error: any) {
    logger.error('Get job by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching job',
      error: error.message
    });
  }
};

// PATCH /api/v1/jobs/:id/status
export const updateJobStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body;

    if (!status || !Object.values(JobStatus).includes(status)) {
      res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Object.values(JobStatus).join(', ')}`
      });
      return;
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Job not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: job,
      message: 'Job status updated successfully'
    });
  } catch (error: any) {
    logger.error('Update job status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating job status',
      error: error.message
    });
  }
};

// POST /api/v1/jobs/fetch
export const triggerJobFetch = async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Manual job fetch triggered');
    const result = await fetchJobs();

    res.status(200).json({
      success: true,
      data: {
        jobsFetched: result.newJobs + result.updatedJobs,
        newJobs: result.newJobs,
        updatedJobs: result.updatedJobs,
        errors: result.errors
      },
      message: `Fetched ${result.newJobs} new jobs, updated ${result.updatedJobs} jobs`
    });
  } catch (error: any) {
    logger.error('Trigger job fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during job fetch',
      error: error.message
    });
  }
};

// GET /api/v1/jobs/stats
export const getJobStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [statusCounts, typeCounts, totalJobs] = await Promise.all([
      Job.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Job.aggregate([
        { $group: { _id: '$jobType', count: { $sum: 1 } } }
      ]),
      Job.countDocuments()
    ]);

    const byStatus: Record<string, number> = {};
    for (const s of statusCounts) {
      byStatus[s._id] = s.count;
    }

    const byType: Record<string, number> = {};
    for (const t of typeCounts) {
      byType[t._id] = t.count;
    }

    res.status(200).json({
      success: true,
      data: {
        totalJobs,
        byStatus,
        byType
      },
      message: 'Job stats retrieved successfully'
    });
  } catch (error: any) {
    logger.error('Get job stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching job stats',
      error: error.message
    });
  }
};
