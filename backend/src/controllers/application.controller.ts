import { Request, Response } from 'express';
import { Application, ApplicationStatus } from '../models/Application.model';
import { NotificationType } from '../models/Notification.model';
import { createNotification } from '../services/notification.service';
import { logger } from '../config/logger';

// GET /api/v1/applications
export const getApplications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { userId };

    const status = req.query.status as string;
    if (status) {
      filter.status = { $in: status.split(',') };
    }

    const submissionType = req.query.submissionType as string;
    if (submissionType) {
      filter.submissionType = { $in: submissionType.split(',') };
    }

    const sortBy = (req.query.sortBy as string) || 'appliedDate';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder };

    const [data, total] = await Promise.all([
      Application.find(filter)
        .populate('jobId')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    // Map jobId populate to "job" field to match frontend expectation
    const mapped = data.map(app => {
      const obj: Record<string, any> = app.toJSON();
      obj.job = obj.jobId;
      delete obj.jobId;
      return obj;
    });

    res.status(200).json({
      data: mapped,
      total,
      page,
      limit,
      totalPages
    });
  } catch (error: any) {
    logger.error('Get applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching applications',
      error: error.message
    });
  }
};

// GET /api/v1/applications/stats
export const getApplicationStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const statusCounts = await Application.aggregate([
      { $match: { userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const byStatus: Record<string, number> = {};
    let totalApplications = 0;
    for (const s of statusCounts) {
      byStatus[s._id] = s.count;
      totalApplications += s.count;
    }

    res.status(200).json({
      success: true,
      data: {
        totalApplications,
        byStatus
      },
      message: 'Application stats retrieved successfully'
    });
  } catch (error: any) {
    logger.error('Get application stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching application stats',
      error: error.message
    });
  }
};

// GET /api/v1/applications/:id
export const getApplicationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      userId: req.user?.userId
    }).populate('jobId');

    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      });
      return;
    }

    const obj: Record<string, any> = application.toJSON();
    obj.job = obj.jobId;
    delete obj.jobId;

    res.status(200).json({
      success: true,
      data: obj,
      message: 'Application retrieved successfully'
    });
  } catch (error: any) {
    logger.error('Get application by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching application',
      error: error.message
    });
  }
};

// POST /api/v1/applications
export const createApplication = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId, resumeId, coverLetterId } = req.body;

    if (!jobId || !resumeId) {
      res.status(400).json({
        success: false,
        message: 'jobId and resumeId are required'
      });
      return;
    }

    const userId = req.user?.userId;

    const application = await Application.create({
      userId,
      jobId,
      resumeId,
      coverLetterId,
      status: ApplicationStatus.PENDING
    });

    // Send notification (non-blocking)
    if (userId) {
      createNotification(
        userId,
        NotificationType.APPLICATION_SUBMITTED,
        'Application Submitted',
        'Your application has been submitted successfully',
        { applicationId: application._id.toString() }
      ).catch(err => logger.error('Notification error:', err));
    }

    res.status(201).json({
      success: true,
      data: application,
      message: 'Application created successfully'
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'You have already applied to this job'
      });
      return;
    }
    logger.error('Create application error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating application',
      error: error.message
    });
  }
};

// PATCH /api/v1/applications/:id/status
export const updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, notes } = req.body;

    if (!status || !Object.values(ApplicationStatus).includes(status)) {
      res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Object.values(ApplicationStatus).join(', ')}`
      });
      return;
    }

    const update: Record<string, any> = { status };
    if (notes !== undefined) update.notes = notes;

    const userId = req.user?.userId;

    const application = await Application.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: update },
      { new: true }
    );

    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      });
      return;
    }

    // Send notification (non-blocking)
    if (userId) {
      const statusLabel = status.replace(/_/g, ' ');
      createNotification(
        userId,
        NotificationType.APPLICATION_STATUS_CHANGED,
        'Application Status Updated',
        `Your application status changed to ${statusLabel}`,
        { applicationId: application._id.toString() }
      ).catch(err => logger.error('Notification error:', err));
    }

    res.status(200).json({
      success: true,
      data: application,
      message: 'Application status updated successfully'
    });
  } catch (error: any) {
    logger.error('Update application status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating application status',
      error: error.message
    });
  }
};

// DELETE /api/v1/applications/:id
export const deleteApplication = async (req: Request, res: Response): Promise<void> => {
  try {
    const application = await Application.findOneAndDelete({
      _id: req.params.id,
      userId: req.user?.userId
    });

    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Application deleted successfully'
    });
  } catch (error: any) {
    logger.error('Delete application error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting application',
      error: error.message
    });
  }
};
