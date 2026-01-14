/**
 * Firebase Admin SDK Configuration
 * Handles Firebase Auth, Firestore, and FCM
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK
 * Supports both service account file and environment variables
 */
const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    let credential;

    // Option 1: Use service account JSON file
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    if (serviceAccountPath) {
      const absolutePath = path.resolve(serviceAccountPath);
      
      if (fs.existsSync(absolutePath)) {
        const serviceAccount = require(absolutePath);
        credential = admin.credential.cert(serviceAccount);
        console.log('🔥 Using Firebase service account file');
      }
    }

    // Option 2: Use environment variables
    if (!credential && process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      console.log('🔥 Using Firebase environment variables');
    }

    // Option 3: Use application default credentials (for Cloud environments)
    if (!credential) {
      credential = admin.credential.applicationDefault();
      console.log('🔥 Using Firebase application default credentials');
    }

    firebaseApp = admin.initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID || 'job-assigning-app',
    });

    console.log('🔥 Firebase Admin SDK initialized successfully');
    return firebaseApp;

  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    console.warn('⚠️ Firebase features will be limited. Please configure Firebase credentials.');
    return null;
  }
};

/**
 * Get Firebase Auth instance
 * @returns {admin.auth.Auth}
 */
const getAuth = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.auth();
};

/**
 * Get Firestore instance
 * @returns {admin.firestore.Firestore}
 */
const getFirestore = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.firestore();
};

/**
 * Get Firebase Cloud Messaging instance
 * @returns {admin.messaging.Messaging}
 */
const getMessaging = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.messaging();
};

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    throw error;
  }
};

/**
 * Send push notification via FCM
 * @param {string} fcmToken - Device FCM token
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<string>} - Message ID
 */
const sendPushNotification = async (fcmToken, notification, data = {}) => {
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'job_notifications',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await getMessaging().send(message);
    console.log('📤 Push notification sent:', response);
    return response;
  } catch (error) {
    console.error('❌ Push notification failed:', error.message);
    throw error;
  }
};

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<admin.messaging.BatchResponse>}
 */
const sendMulticastNotification = async (fcmTokens, notification, data = {}) => {
  try {
    const message = {
      tokens: fcmTokens,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`📤 Multicast sent: ${response.successCount}/${fcmTokens.length} successful`);
    return response;
  } catch (error) {
    console.error('❌ Multicast notification failed:', error.message);
    throw error;
  }
};

module.exports = {
  initializeFirebase,
  getAuth,
  getFirestore,
  getMessaging,
  verifyIdToken,
  sendPushNotification,
  sendMulticastNotification,
};
