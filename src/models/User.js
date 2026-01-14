/**
 * User Model
 * Stores user profile information, skills, and authentication data
 */

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // Firebase UID - unique identifier from Firebase Auth
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // Phone number used for OTP authentication
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },

  // User's display name
  name: {
    type: String,
    trim: true,
    maxlength: 100,
  },

  // User's age
  age: {
    type: Number,
    min: 13,
    max: 120,
  },

  // Profile image URL (can be base64 or cloud storage URL)
  profileImage: {
    type: String,
    default: null,
  },

  // Array of skills the user has
  skills: [{
    type: String,
    trim: true,
  }],

  // Aadhaar card verification status
  aadhaarVerified: {
    type: Boolean,
    default: false,
  },

  // Aadhaar image URL (stored securely)
  aadhaarImage: {
    type: String,
    default: null,
  },

  // Current mode: 'employer' or 'worker'
  currentMode: {
    type: String,
    enum: ['employer', 'worker'],
    default: 'worker',
  },

  // Availability status for workers
  availability: {
    isAvailable: {
      type: Boolean,
      default: true,
    },
    // Available time slots
    schedule: {
      type: String,
      default: 'Anytime',
    },
  },

  // User's current location (for nearby matching)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
    },
    text: {
      type: String,
      default: '',
    },
  },

  // User rating (average rating from completed jobs)
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    count: {
      type: Number,
      default: 0,
    },
  },

  // FCM token for push notifications
  fcmToken: {
    type: String,
    default: null,
  },

  // Profile completion status
  isProfileComplete: {
    type: Boolean,
    default: false,
  },

  // Account status
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },

  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
});

// Create 2dsphere index for geospatial queries
UserSchema.index({ location: '2dsphere' });

// Create compound index for skill-based searches
UserSchema.index({ skills: 1, 'availability.isAvailable': 1 });

// Update timestamps before saving
UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Check if profile is complete
  this.isProfileComplete = !!(this.name && this.skills && this.skills.length > 0);
  
  next();
});

// Virtual for full name display
UserSchema.virtual('displayName').get(function() {
  return this.name || `User ${this.phone.slice(-4)}`;
});

// Method to update rating
UserSchema.methods.updateRating = async function(newRating) {
  const totalRatings = this.rating.count * this.rating.average;
  this.rating.count += 1;
  this.rating.average = (totalRatings + newRating) / this.rating.count;
  await this.save();
};

// Method to toggle availability
UserSchema.methods.toggleAvailability = async function() {
  this.availability.isAvailable = !this.availability.isAvailable;
  await this.save();
  return this.availability.isAvailable;
};

// Static method to find nearby workers
UserSchema.statics.findNearbyWorkers = async function(coordinates, maxDistance = 5000, skills = []) {
  const query = {
    currentMode: 'worker',
    'availability.isAvailable': true,
    status: 'active',
  };

  // Add geospatial query if coordinates provided
  if (coordinates && coordinates.length === 2) {
    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates,
        },
        $maxDistance: maxDistance, // meters
      },
    };
  }

  // Filter by skills if provided
  if (skills && skills.length > 0) {
    query.skills = { $in: skills };
  }

  return this.find(query)
    .select('-aadhaarImage -fcmToken')
    .limit(50);
};

// Transform output
UserSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.aadhaarImage; // Never expose aadhaar image
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
