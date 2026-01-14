/**
 * Notification Model
 * Stores notification history for users
 */

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  // Reference to the user receiving the notification
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Notification type for filtering and handling
  type: {
    type: String,
    enum: [
      'job_request',      // New job application received
      'job_accepted',     // Your application was accepted
      'job_rejected',     // Your application was rejected
      'new_message',      // New chat message
      'job_completed',    // Job marked as completed
      'job_cancelled',    // Job was cancelled
      'rating_received',  // User received a rating
      'skill_request',    // Someone requested your skill
      'system',           // System notification
    ],
    required: true,
    index: true,
  },

  // Notification title
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },

  // Notification body/message
  body: {
    type: String,
    required: true,
    maxlength: 500,
  },

  // Additional data payload
  data: {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobApplication' },
    acceptedJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcceptedJob' },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    chatRoomId: { type: String },
    extra: { type: mongoose.Schema.Types.Mixed },
  },

  // Read status
  isRead: {
    type: Boolean,
    default: false,
    index: true,
  },

  // When the notification was read
  readAt: {
    type: Date,
    default: null,
  },

  // Push notification sent status
  pushSent: {
    type: Boolean,
    default: false,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound index for common queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// TTL index to auto-delete old notifications after 30 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static method to get user's notifications
NotificationSchema.statics.getUserNotifications = async function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get unread count
NotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

// Static method to mark all as read
NotificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

// Method to mark as read
NotificationSchema.methods.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

// Transform output
NotificationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Notification', NotificationSchema);
