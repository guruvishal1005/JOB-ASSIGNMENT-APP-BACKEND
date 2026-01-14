/**
 * Notification Controller
 * Handles notification management
 */

const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * @desc    Get user's notifications
 * @route   GET /api/v1/notifications
 * @access  Private
 */
const getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, unreadOnly } = req.query;

  const query = { userId: req.user._id };

  if (unreadOnly === 'true') {
    query.isRead = false;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Notification.countDocuments(query);
  const unreadCount = await Notification.getUnreadCount(req.user._id);

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    unreadCount,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: { notifications },
  });
});

/**
 * @desc    Get unread notification count
 * @route   GET /api/v1/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.getUnreadCount(req.user._id);

  res.status(200).json({
    success: true,
    data: { unreadCount },
  });
});

/**
 * @desc    Mark notification as read
 * @route   PUT /api/v1/notifications/:notificationId/read
 * @access  Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, 'Notification not found', 'NOT_FOUND');
  }

  if (notification.userId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized', 'NOT_AUTHORIZED');
  }

  await notification.markAsRead();

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
  });
});

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/v1/notifications/read-all
 * @access  Private
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.markAllAsRead(req.user._id);

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
  });
});

/**
 * @desc    Delete notification
 * @route   DELETE /api/v1/notifications/:notificationId
 * @access  Private
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, 'Notification not found', 'NOT_FOUND');
  }

  if (notification.userId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized', 'NOT_AUTHORIZED');
  }

  await Notification.findByIdAndDelete(notificationId);

  res.status(200).json({
    success: true,
    message: 'Notification deleted',
  });
});

/**
 * @desc    Delete all notifications
 * @route   DELETE /api/v1/notifications
 * @access  Private
 */
const deleteAllNotifications = asyncHandler(async (req, res) => {
  await Notification.deleteMany({ userId: req.user._id });

  res.status(200).json({
    success: true,
    message: 'All notifications deleted',
  });
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};
