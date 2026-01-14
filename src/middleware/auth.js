/**
 * Authentication Middleware
 * Verifies Firebase ID tokens and attaches user to request
 */

const { verifyIdToken } = require('../config/firebase');
const User = require('../models/User');

/**
 * Middleware to verify Firebase authentication
 * Expects Authorization header: Bearer <firebaseIdToken>
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT',
      });
    }

    try {
      // Verify Firebase token
      const decodedToken = await verifyIdToken(token);
      
      // Find user in database
      let user = await User.findOne({ firebaseUid: decodedToken.uid });

      // If user doesn't exist, create a basic profile
      if (!user) {
        user = await User.create({
          firebaseUid: decodedToken.uid,
          phone: decodedToken.phone_number || '',
        });
      }

      // Update last active timestamp
      user.lastActiveAt = new Date();
      await user.save();

      // Attach user and decoded token to request
      req.user = user;
      req.firebaseUser = decodedToken;
      
      next();
    } catch (tokenError) {
      console.error('Token verification error:', tokenError.message);
      
      // Handle specific Firebase errors
      if (tokenError.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please login again.',
          code: 'TOKEN_EXPIRED',
        });
      }

      if (tokenError.code === 'auth/id-token-revoked') {
        return res.status(401).json({
          success: false,
          message: 'Token has been revoked. Please login again.',
          code: 'TOKEN_REVOKED',
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
        code: 'INVALID_TOKEN',
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.',
      code: 'AUTH_ERROR',
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't block if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    try {
      const decodedToken = await verifyIdToken(token);
      const user = await User.findOne({ firebaseUid: decodedToken.uid });

      if (user) {
        req.user = user;
        req.firebaseUser = decodedToken;
      }
    } catch (tokenError) {
      // Silently continue without user
      console.warn('Optional auth token invalid:', tokenError.message);
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Middleware to check if user profile is complete
 */
const requireCompleteProfile = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!req.user.isProfileComplete) {
    return res.status(403).json({
      success: false,
      message: 'Please complete your profile first.',
      code: 'PROFILE_INCOMPLETE',
    });
  }

  next();
};

/**
 * Middleware to check user's current mode
 * @param {string} requiredMode - 'employer' or 'worker'
 */
const requireMode = (requiredMode) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      });
    }

    if (req.user.currentMode !== requiredMode) {
      return res.status(403).json({
        success: false,
        message: `This action requires ${requiredMode} mode.`,
        code: 'WRONG_MODE',
        currentMode: req.user.currentMode,
        requiredMode,
      });
    }

    next();
  };
};

/**
 * Middleware to check if user account is active
 */
const requireActiveAccount = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
      code: 'AUTH_REQUIRED',
    });
  }

  if (req.user.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: 'Your account has been suspended. Please contact support.',
      code: 'ACCOUNT_SUSPENDED',
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireCompleteProfile,
  requireMode,
  requireActiveAccount,
};
