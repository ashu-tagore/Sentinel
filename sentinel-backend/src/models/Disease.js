// models/Disease.js
const mongoose = require("mongoose");

/**
 * Disease Schema
 * Defines the data structure for plant diseases
 */
const diseaseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Disease name is required"],
      unique: true,
      enum: [
        "Early Blight",
        "Healthy",
        "Late Blight",
        "Leaf Miner",
        "Leaf Mold",
        "Mosaic Virus",
        "Septoria",
        "Spider Mites",
        "Yellow Leaf Curl Virus",
      ],
      trim: true,
      index: true, // Add index for frequent queries
    },
    scientificName: {
      type: String,
      required: [true, "Scientific name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      minLength: [10, "Description must be at least 10 characters"],
      maxLength: [1000, "Description cannot exceed 1000 characters"],
    },
    symptoms: [
      {
        type: String,
        required: [true, "At least one symptom is required"],
        trim: true,
        minLength: [3, "Symptom must be at least 3 characters"],
      },
    ],
    treatments: [
      {
        type: String,
        required: [true, "At least one treatment is required"],
        trim: true,
        minLength: [3, "Treatment must be at least 3 characters"],
      },
    ],
    preventions: [
      {
        type: String,
        required: [true, "At least one prevention measure is required"],
        trim: true,
      },
    ],
    severity: {
      type: String,
      enum: {
        values: ["Low", "Medium", "High"],
        message: "{VALUE} is not a valid severity level",
      },
      required: true,
      index: true, // Add index for filtering by severity
    },
    imageUrl: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^\/assets\/diseases\/.*\.(jpg|jpeg|png)$/.test(v);
        },
        message: "Invalid image URL format",
      },
    },
    detectionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastDetectedAt: {
      type: Date,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    active: {
      type: Boolean,
      default: true,
      index: true, // Add index for active/inactive filtering
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for formatted dates
diseaseSchema.virtual("formattedCreatedAt").get(function () {
  return this.createdAt ? this.createdAt.toLocaleDateString() : "N/A";
});

diseaseSchema.virtual("formattedUpdatedAt").get(function () {
  return this.updatedAt ? this.updatedAt.toLocaleDateString() : "N/A";
});

diseaseSchema.virtual("formattedLastDetectedAt").get(function () {
  return this.lastDetectedAt
    ? this.lastDetectedAt.toLocaleDateString()
    : "Never";
});

// Virtual for severity class (for UI styling)
diseaseSchema.virtual("severityClass").get(function () {
  const classes = {
    Low: "low-severity",
    Medium: "medium-severity",
    High: "high-severity",
  };
  return classes[this.severity] || "unknown-severity";
});

// Compound index for efficient queries
diseaseSchema.index({ name: 1, severity: 1 });
diseaseSchema.index({ active: 1, severity: 1 });
diseaseSchema.index({ detectionCount: -1 }); // For sorting by popularity

// Pre-save middleware to ensure array fields have unique values
diseaseSchema.pre("save", function (next) {
  // Helper function to remove duplicates
  const uniqueArray = (arr) => [...new Set(arr.map((item) => item.trim()))];

  if (this.symptoms) this.symptoms = uniqueArray(this.symptoms);
  if (this.treatments) this.treatments = uniqueArray(this.treatments);
  if (this.preventions) this.preventions = uniqueArray(this.preventions);

  // Update lastAccessedAt on save
  this.lastAccessedAt = new Date();

  next();
});

// Pre-validate hook to check array lengths
diseaseSchema.pre("validate", function (next) {
  if (this.symptoms && this.symptoms.length === 0) {
    this.invalidate("symptoms", "At least one symptom is required");
  }

  if (this.treatments && this.treatments.length === 0) {
    this.invalidate("treatments", "At least one treatment is required");
  }

  if (this.preventions && this.preventions.length === 0) {
    this.invalidate(
      "preventions",
      "At least one prevention measure is required"
    );
  }

  next();
});

// Static method to find the most common diseases
diseaseSchema.statics.findMostCommon = function (limit = 5) {
  return this.find({ active: true }).sort({ detectionCount: -1 }).limit(limit);
};

// Static method to find diseases by severity
diseaseSchema.statics.findBySeverity = function (severity) {
  return this.find({
    severity,
    active: true,
  }).sort({ name: 1 });
};

// Method to increment the detection count
diseaseSchema.methods.incrementDetectionCount = function () {
  this.detectionCount += 1;
  this.lastDetectedAt = new Date();
  return this.save();
};

// Create and export the model
const Disease = mongoose.model("Disease", diseaseSchema);

module.exports = Disease;
