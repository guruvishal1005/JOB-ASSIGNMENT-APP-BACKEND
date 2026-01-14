/**
 * Application Controller
 * Handles job applications, acceptance, and rejection
 */

const Job = require('../models/Job');
const JobApplication = require('../models/JobApplication');
const AcceptedJob = require('../models/AcceptedJob');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { sendPushNotification } = require('../config/firebase');

/**
 * @desc    Apply for a job
 * @route   POST /api/v1/applications/apply
 * @access  Private (Worker)
 */
const applyForJob = asyncHandler(async (req, res) => {
  const { jobId, message } = req.body;

  // Check if job exists and is open
  const job = await Job.findById(jobId).populate('createdBy', 'name fcmToken');

  if (!job) {
    throw new ApiError(404, 'Job not found', 'JOB_NOT_FOUND');
  }

  if (job.status !== 'Open') {
    throw new ApiError(400, 'This job is no longer accepting applications', 'JOB_CLOSED');
  }

  // Can't apply to own job
  if (job.createdBy._id.toString() === req.user._id.toString()) {
    throw new ApiError(400, 'Cannot apply to your own job', 'OWN_JOB');
  }

  // Check if already applied
  const existingApplication = await JobApplication.findOne({
    jobId,
    applicantId: req.user._id,
  });

  if (existingApplication) {
    throw new ApiError(400, 'You have already applied for this job', 'ALREADY_APPLIED');
  }

  // Create application
  const application = await JobApplication.create({
    jobId,
    applicantId: req.user._id,
    message: message || '',
  });

  // Update job applicant count
  await Job.findByIdAndUpdate(jobId, { $inc: { applicantCount: 1 } });

  // Create notification for employer
  await Notification.create({
    userId: job.createdBy._id,
    type: 'job_request',
    title: 'New Job Application',
    body: `${req.user.name || 'Someone'} applied for "${job.title}"`,
    data: {
      jobId: job._id,
      applicationId: application._id,
      fromUserId: req.user._id,
    },
  });

  // Send push notification to employer
  if (job.createdBy.fcmToken) {
    try {
      await sendPushNotification(
        job.createdBy.fcmToken,
        {
          title: 'New Job Application',
          body: `${req.user.name || 'Someone'} applied for "${job.title}"`,
        },
        {
          type: 'job_request',
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
        }
      );
    } catch (pushError) {
      console.warn('Push notification failed:', pushError.message);
    }
  }

  // Populate application data
  await application.populate('applicantId', 'name phone skills rating profileImage');

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully',
    data: { application },
  });
});

/**
 * @desc    Get my applications (as worker)
 * @route   GET /api/v1/applications/my-applications
 * @access  Private
 */
const getMyApplications = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = { applicantId: req.user._id };

  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const applications = await JobApplication.find(query)
    .populate({
      path: 'jobId',
      populate: {
        path: 'createdBy',
        select: 'name phone rating',
      },
    })
    .sort({ appliedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await JobApplication.countDocuments(query);

  res.status(200).json({
    success: true,
    count: applications.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: { applications },
  });
});

/**
 * @desc    Accept or reject an application (as employer)
 * @route   PUT /api/v1/applications/:applicationId
 * @access  Private (Employer)
 */
const handleApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { action } = req.body; // 'accept' or 'reject'

  if (!['accept', 'reject'].includes(action)) {
    throw new ApiError(400, 'Action must be accept or reject', 'INVALID_ACTION');
  }

  const application = await JobApplication.findById(applicationId)
    .populate('jobId')
    .populate('applicantId', 'name phone skills rating fcmToken');

  if (!application) {
    throw new ApiError(404, 'Application not found', 'APPLICATION_NOT_FOUND');
  }

  const job = application.jobId;

  // Verify ownership
  if (job.createdBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized to handle this application', 'NOT_AUTHORIZED');
  }

  // Check if already processed
  if (application.status !== 'Applied') {
    throw new ApiError(400, `Application has already been ${application.status.toLowerCase()}`, 'ALREADY_PROCESSED');
  }

  if (action === 'accept') {
    // Check if job already has an accepted worker
    const existingAccepted = await AcceptedJob.findOne({ jobId: job._id });
    if (existingAccepted) {
      throw new ApiError(400, 'This job already has an accepted worker', 'WORKER_EXISTS');
    }

    // Accept application
    application.status = 'Accepted';
    await application.save();

    // Create accepted job record
    const acceptedJob = await AcceptedJob.create({
      jobId: job._id,
      workerId: application.applicantId._id,
      employerId: req.user._id,
    });

    // Close the job
    job.status = 'InProgress';
    await job.save();

    // Reject all other pending applications
    await JobApplication.updateMany(
      { jobId: job._id, status: 'Applied', _id: { $ne: applicationId } },
      { $set: { status: 'Rejected' } }
    );

    // Create notification for accepted worker
    await Notification.create({
      userId: application.applicantId._id,
      type: 'job_accepted',
      title: 'Application Accepted!',
      body: `Your application for "${job.title}" has been accepted`,
      data: {
        jobId: job._id,
        applicationId: application._id,
        acceptedJobId: acceptedJob._id,
        chatRoomId: acceptedJob.chatRoomId,
      },
    });

    // Send push notification
    if (application.applicantId.fcmToken) {
      try {
        await sendPushNotification(
          application.applicantId.fcmToken,
          {
            title: 'Application Accepted!',
            body: `Your application for "${job.title}" has been accepted`,
          },
          {
            type: 'job_accepted',
            jobId: job._id.toString(),
            chatRoomId: acceptedJob.chatRoomId,
          }
        );
      } catch (pushError) {
        console.warn('Push notification failed:', pushError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Application accepted successfully',
      data: {
        application,
        acceptedJob,
        chatRoomId: acceptedJob.chatRoomId,
      },
    });
  } else {
    // Reject application
    application.status = 'Rejected';
    await application.save();

    // Create notification for rejected worker
    await Notification.create({
      userId: application.applicantId._id,
      type: 'job_rejected',
      title: 'Application Update',
      body: `Your application for "${job.title}" was not selected`,
      data: {
        jobId: job._id,
        applicationId: application._id,
      },
    });

    // Send push notification
    if (application.applicantId.fcmToken) {
      try {
        await sendPushNotification(
          application.applicantId.fcmToken,
          {
            title: 'Application Update',
            body: `Your application for "${job.title}" was not selected`,
          },
          {
            type: 'job_rejected',
            jobId: job._id.toString(),
          }
        );
      } catch (pushError) {
        console.warn('Push notification failed:', pushError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Application rejected',
      data: { application },
    });
  }
});

/**
 * @desc    Withdraw application
 * @route   DELETE /api/v1/applications/:applicationId
 * @access  Private
 */
const withdrawApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await JobApplication.findById(applicationId);

  if (!application) {
    throw new ApiError(404, 'Application not found', 'APPLICATION_NOT_FOUND');
  }

  // Verify ownership
  if (application.applicantId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized to withdraw this application', 'NOT_AUTHORIZED');
  }

  // Can only withdraw pending applications
  if (application.status !== 'Applied') {
    throw new ApiError(400, 'Can only withdraw pending applications', 'CANNOT_WITHDRAW');
  }

  application.status = 'Withdrawn';
  await application.save();

  // Decrement applicant count
  await Job.findByIdAndUpdate(application.jobId, { $inc: { applicantCount: -1 } });

  res.status(200).json({
    success: true,
    message: 'Application withdrawn successfully',
  });
});

/**
 * @desc    Get accepted jobs (as worker)
 * @route   GET /api/v1/applications/accepted-jobs
 * @access  Private
 */
const getAcceptedJobs = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const query = { workerId: req.user._id };

  if (status) {
    query.status = status;
  }

  const acceptedJobs = await AcceptedJob.find(query)
    .populate({
      path: 'jobId',
      populate: {
        path: 'createdBy',
        select: 'name phone rating',
      },
    })
    .populate('employerId', 'name phone rating')
    .sort({ acceptedAt: -1 });

  res.status(200).json({
    success: true,
    count: acceptedJobs.length,
    data: { acceptedJobs },
  });
});

/**
 * @desc    Get incoming job requests (as worker - jobs where employer sent request)
 * @route   GET /api/v1/applications/incoming-requests
 * @access  Private
 */
const getIncomingRequests = asyncHandler(async (req, res) => {
  // Get applications where user is the applicant and status is Applied
  const applications = await JobApplication.find({
    applicantId: req.user._id,
    status: 'Applied',
  })
    .populate({
      path: 'jobId',
      populate: {
        path: 'createdBy',
        select: 'name phone rating profileImage',
      },
    })
    .sort({ appliedAt: -1 });

  res.status(200).json({
    success: true,
    count: applications.length,
    data: { applications },
  });
});

/**
 * @desc    Complete a job
 * @route   PUT /api/v1/applications/accepted/:acceptedJobId/complete
 * @access  Private (Employer)
 */
const completeJob = asyncHandler(async (req, res) => {
  const { acceptedJobId } = req.params;

  const acceptedJob = await AcceptedJob.findById(acceptedJobId)
    .populate('jobId')
    .populate('workerId', 'name fcmToken');

  if (!acceptedJob) {
    throw new ApiError(404, 'Accepted job not found', 'NOT_FOUND');
  }

  // Verify employer ownership
  if (acceptedJob.employerId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized', 'NOT_AUTHORIZED');
  }

  if (acceptedJob.status !== 'Active') {
    throw new ApiError(400, 'Job is not active', 'JOB_NOT_ACTIVE');
  }

  // Mark as completed
  acceptedJob.status = 'Completed';
  await acceptedJob.save();

  // Update job status
  await Job.findByIdAndUpdate(acceptedJob.jobId._id, { status: 'Completed' });

  // Notify worker
  await Notification.create({
    userId: acceptedJob.workerId._id,
    type: 'job_completed',
    title: 'Job Completed',
    body: `The job "${acceptedJob.jobId.title}" has been marked as completed`,
    data: {
      jobId: acceptedJob.jobId._id,
      acceptedJobId: acceptedJob._id,
    },
  });

  if (acceptedJob.workerId.fcmToken) {
    try {
      await sendPushNotification(
        acceptedJob.workerId.fcmToken,
        {
          title: 'Job Completed',
          body: `The job "${acceptedJob.jobId.title}" has been marked as completed`,
        },
        {
          type: 'job_completed',
          jobId: acceptedJob.jobId._id.toString(),
        }
      );
    } catch (error) {
      console.warn('Push notification failed:', error.message);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Job marked as completed',
    data: { acceptedJob },
  });
});

/**
 * @desc    Rate a completed job
 * @route   POST /api/v1/applications/accepted/:acceptedJobId/rate
 * @access  Private
 */
const rateJob = asyncHandler(async (req, res) => {
  const { acceptedJobId } = req.params;
  const { rating, review } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(400, 'Rating must be between 1 and 5', 'INVALID_RATING');
  }

  const acceptedJob = await AcceptedJob.findById(acceptedJobId)
    .populate('workerId')
    .populate('employerId');

  if (!acceptedJob) {
    throw new ApiError(404, 'Accepted job not found', 'NOT_FOUND');
  }

  if (acceptedJob.status !== 'Completed') {
    throw new ApiError(400, 'Can only rate completed jobs', 'JOB_NOT_COMPLETED');
  }

  const isEmployer = acceptedJob.employerId._id.toString() === req.user._id.toString();
  const isWorker = acceptedJob.workerId._id.toString() === req.user._id.toString();

  if (!isEmployer && !isWorker) {
    throw new ApiError(403, 'Not authorized to rate this job', 'NOT_AUTHORIZED');
  }

  if (isEmployer) {
    // Employer rating worker
    if (acceptedJob.employerRating?.rating) {
      throw new ApiError(400, 'You have already rated this job', 'ALREADY_RATED');
    }

    acceptedJob.employerRating = {
      rating,
      review: review || '',
      ratedAt: new Date(),
    };

    // Update worker's average rating
    await acceptedJob.workerId.updateRating(rating);
  } else {
    // Worker rating employer
    if (acceptedJob.workerRating?.rating) {
      throw new ApiError(400, 'You have already rated this job', 'ALREADY_RATED');
    }

    acceptedJob.workerRating = {
      rating,
      review: review || '',
      ratedAt: new Date(),
    };

    // Update employer's average rating
    await acceptedJob.employerId.updateRating(rating);
  }

  await acceptedJob.save();

  res.status(200).json({
    success: true,
    message: 'Rating submitted successfully',
    data: { acceptedJob },
  });
});

module.exports = {
  applyForJob,
  getMyApplications,
  handleApplication,
  withdrawApplication,
  getAcceptedJobs,
  getIncomingRequests,
  completeJob,
  rateJob,
};
