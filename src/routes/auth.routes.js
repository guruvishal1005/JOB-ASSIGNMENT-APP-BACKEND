/**
 * Auth Routes
 * Handles authentication endpoints
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validateFirebaseToken, validateFCMToken } = require('../middleware/validation');

/**
 * @route   POST /api/v1/auth/verify-token
 * @desc    Verify Firebase token and login/register user
 * @access  Public
 */
router.post('/verify-token', authController.verifyToken);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route   PUT /api/v1/auth/fcm-token
 * @desc    Update FCM token for push notifications
 * @access  Private
 */
router.put('/fcm-token', authenticate, validateFCMToken, authController.updateFCMToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (invalidate FCM token)
 * @access  Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   DELETE /api/v1/auth/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/account', authenticate, authController.deleteAccount);

module.exports = router;
