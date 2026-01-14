/**
 * Auth Controller
 * Handles authentication related operations
 */

const User = require('../models/User');
const { verifyIdToken, getAuth } = require('../config/firebase');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * @desc    Verify Firebase token and login/register user
 * @route   POST /api/v1/auth/verify-token
 * @access  Public
 */
const verifyToken = asyncHandler(async (req, res) => {
  const { idToken, fcmToken } = req.body;

  if (!idToken) {
    throw new ApiError(400, 'Firebase ID token is required', 'TOKEN_REQUIRED');
  }

  // Verify the Firebase ID token
  const decodedToken = await verifyIdToken(idToken);
  
  const { uid, phone_number } = decodedToken;

  // Find or create user
  let user = await User.findOne({ firebaseUid: uid });
  let isNewUser = false;

  if (!user) {
    // Create new user
    user = await User.create({
      firebaseUid: uid,
      phone: phone_number || '',
      fcmToken: fcmToken || null,
    });
    isNewUser = true;
  } else {
    // Update FCM token if provided
    if (fcmToken) {
      user.fcmToken = fcmToken;
    }
    user.lastActiveAt = new Date();
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: isNewUser ? 'User registered successfully' : 'Login successful',
    data: {
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        isProfileComplete: user.isProfileComplete,
        currentMode: user.currentMode,
        skills: user.skills,
        availability: user.availability,
        rating: user.rating,
      },
      isNewUser,
    },
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-aadhaarImage -fcmToken');

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: { user },
  });
});

/**
 * @desc    Update FCM token
 * @route   PUT /api/v1/auth/fcm-token
 * @access  Private
 */
const updateFCMToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    throw new ApiError(400, 'FCM token is required', 'FCM_TOKEN_REQUIRED');
  }

  req.user.fcmToken = fcmToken;
  await req.user.save();

  res.status(200).json({
    success: true,
    message: 'FCM token updated successfully',
  });
});

/**
 * @desc    Logout (invalidate FCM token)
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  // Clear FCM token to stop push notifications
  req.user.fcmToken = null;
  await req.user.save();

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @desc    Delete user account
 * @route   DELETE /api/v1/auth/account
 * @access  Private
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const user = req.user;

  // Mark account as deleted (soft delete)
  user.status = 'deleted';
  user.phone = `deleted_${user._id}_${user.phone}`;
  user.fcmToken = null;
  await user.save();

  // Optionally, delete from Firebase Auth
  try {
    await getAuth().deleteUser(user.firebaseUid);
  } catch (error) {
    console.warn('Failed to delete Firebase user:', error.message);
  }

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully',
  });
});

module.exports = {
  verifyToken,
  getMe,
  updateFCMToken,
  logout,
  deleteAccount,
};
