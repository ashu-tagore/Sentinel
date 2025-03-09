// models/Detection.js
const mongoose = require("mongoose");

/**
 * Detection Schema
 * Defines the data structure for plant disease detection records
 */
const detectionSchema = new mongoose.Schema(
  {
    // Image information
    imageUrl: {
      type: String,
      required: [true, "Image URL is required"],
      validate: {
        validator: function (v) {
          return /^\/uploads\/.*\.(jpg|jpeg|png)$/.test(v);
        },
        message:
          "Invalid image URL format. Must begin with /uploads/ and end with .jpg, .jpeg, or .png",
      },
    },
    originalImage: {
      type: String,
      required: [true, "Original image path is required"],
    },
    processedImage: {
      type: String,
      required: [true, "Processed image path is required"],
    },

    // Detection results
    disease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disease",
      required: [true, "Disease reference is required"],
      index: true, // Add index for disease lookups
    },
    confidence: {
      type: Number,
      required: [true, "Confidence score is required"],
      min: [0, "Confidence cannot be less than 0"],
      max: [1, "Confidence cannot be greater than 1"],
      index: true, // Add index for filtering by confidence
    },
    modelUsed: {
      type: String,
      enum: ["YOLOv5", "YOLOv7", "Ensemble"],
      default: "Ensemble",
    },
    secondaryPredictions: [
      {
        disease: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Disease",
        },
        confidence: {
          type: Number,
          min: 0,
          max: 1,
        },
        modelUsed: {
          type: String,
          enum: ["YOLOv5", "YOLOv7"],
        },
      },
    ],

    // Client information
    deviceInfo: {
      userAgent: String,
      platform: String,
      browser: String,
      isMobile: {
        type: Boolean,
        default: false,
      },
    },
    location: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },

    // Processing information
    processingTime: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true, // Add index for status filtering
    },
    errorMessage: {
      type: String,
      default: null,
    },

    // User reference (if authenticated)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true, // Add index for user lookups
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals for formatted dates
detectionSchema.virtual("formattedCreatedAt").get(function () {
  return this.createdAt ? this.createdAt.toLocaleString() : "N/A";
});

detectionSchema.virtual("formattedUpdatedAt").get(function () {
  return this.updatedAt ? this.updatedAt.toLocaleString() : "N/A";
});

// Virtual for formatted confidence
detectionSchema.virtual("confidencePercentage").get(function () {
  return (this.confidence * 100).toFixed(1) + "%";
});

// Virtual for confidence class (for UI styling)
detectionSchema.virtual("confidenceClass").get(function () {
  if (this.confidence >= 0.8) return "high-confidence";
  if (this.confidence >= 0.5) return "medium-confidence";
  return "low-confidence";
});

// Compound indexes for efficient querying
detectionSchema.index({ disease: 1, createdAt: -1 });
detectionSchema.index({ confidence: -1, createdAt: -1 });
detectionSchema.index({ status: 1, createdAt: -1 });
detectionSchema.index({ user: 1, createdAt: -1 });
detectionSchema.index({ "location.latitude": 1, "location.longitude": 1 });

// Pre-save middleware to validate coordinates
detectionSchema.pre("save", function (next) {
  // Validate that both lat and long are provided together
  if (
    (this.location.latitude !== undefined &&
      this.location.longitude === undefined) ||
    (this.location.latitude === undefined &&
      this.location.longitude !== undefined)
  ) {
    return next(
      new Error("Both latitude and longitude must be provided together")
    );
  }

  next();
});

// Static method to find recent detections
detectionSchema.statics.findRecent = function (limit = 10) {
  return this.find({ status: "completed" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("disease", "name severity");
};

// Static method to find by disease
detectionSchema.statics.findByDisease = function (diseaseId, limit = 20) {
  return this.find({
    disease: diseaseId,
    status: "completed",
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method for geographic search within a radius
detectionSchema.statics.findNearby = function (lat, lng, radiusKm = 10) {
  // For geographic search, we need to convert to radians and use the Haversine formula
  // This is a simplified version and assumes flat Earth over short distances

  // Convert radius to degrees (approximate)
  const radiusDegrees = radiusKm / 111.12; // 1 degree ≈ 111.12km at the equator

  return this.find({
    "location.latitude": { $exists: true, $ne: null },
    "location.longitude": { $exists: true, $ne: null },
    "location.latitude": {
      $gte: lat - radiusDegrees,
      $lte: lat + radiusDegrees,
    },
    "location.longitude": {
      $gte: lng - radiusDegrees,
      $lte: lng + radiusDegrees,
    },
    status: "completed",
  }).then((results) => {
    // Further filter with actual distance calculation
    return results.filter((detection) => {
      // Calculate more precise distance using Haversine formula
      const dLat = ((detection.location.latitude - lat) * Math.PI) / 180;
      const dLon = ((detection.location.longitude - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((detection.location.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371 * c; // Earth radius is 6371 km

      return distance <= radiusKm;
    });
  });
};

// Static method to get detection statistics
detectionSchema.statics.getStatistics = async function () {
  return this.aggregate([
    { $match: { status: "completed" } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        avgConfidence: { $avg: "$confidence" },
        avgProcessingTime: { $avg: "$processingTime" },
        minProcessingTime: { $min: "$processingTime" },
        maxProcessingTime: { $max: "$processingTime" },
      },
    },
    {
      $project: {
        _id: 0,
        total: 1,
        avgConfidence: { $round: ["$avgConfidence", 2] },
        avgProcessingTime: { $round: ["$avgProcessingTime", 2] },
        minProcessingTime: 1,
        maxProcessingTime: 1,
      },
    },
  ]);
};

// Method to update status and handle related actions
detectionSchema.methods.updateStatus = async function (
  newStatus,
  errorMsg = null
) {
  this.status = newStatus;

  if (newStatus === "failed" && errorMsg) {
    this.errorMessage = errorMsg;
  }

  if (newStatus === "completed") {
    // Increment the disease detection count
    // This requires importing the Disease model which would create a circular dependency
    // Instead, we'll use the mongoose connection to directly update the disease
    if (this.disease) {
      try {
        await mongoose.model("Disease").findByIdAndUpdate(this.disease, {
          $inc: { detectionCount: 1 },
          $set: { lastDetectedAt: new Date() },
        });
      } catch (err) {
        console.error("Error updating disease detection count:", err);
        // Continue anyway - this is a non-critical operation
      }
    }
  }

  return this.save();
};

// Create and export the model
const Detection = mongoose.model("Detection", detectionSchema);

module.exports = Detection;
