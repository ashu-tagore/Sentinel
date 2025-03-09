// routes/detectionRoutes.js

// Import required modules
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const detectionController = require("../controllers/detectionController");

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "plant-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// Configure upload settings with validation
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Allow only specific image formats
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files (jpeg, jpg, png) are allowed!"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

// Validation middleware
const validateImageUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No image file provided",
      error: "Please upload a valid image file",
    });
  }
  next();
};

// Validate stream input
const validateStreamInput = (req, res, next) => {
  if (!req.body || !req.body.imageData) {
    return res.status(400).json({
      success: false,
      message: "No image data provided",
      error: "Request body must include imageData",
    });
  }

  // Basic validation for base64 image data
  const imageData = req.body.imageData;
  if (typeof imageData !== "string" || !imageData.startsWith("data:image")) {
    return res.status(400).json({
      success: false,
      message: "Invalid image data format",
      error: "Image data should be a base64 string with data URI format",
    });
  }

  next();
};

// Validate disease ID parameter
const validateDiseaseId = (req, res, next) => {
  const id = req.params.id;
  if (!id || id.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Invalid disease ID",
      error: "Disease ID cannot be empty",
    });
  }

  // Optional: Add more validation logic for disease ID format
  // For example, if IDs follow a specific pattern

  next();
};

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large",
        error: "Maximum file size is 5MB",
      });
    }
    return res.status(400).json({
      success: false,
      message: "File upload error",
      error: err.message,
    });
  } else if (err) {
    return res.status(500).json({
      success: false,
      message: "Server error during file upload",
      error: err.message,
    });
  }
  next();
};

// Generic route error handler
const handleRouteError = (err, req, res, next) => {
  console.error("Route error:", err);

  // Delete uploaded file if there was an error
  if (req.file) {
    fs.unlink(req.file.path, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file after error:", unlinkErr);
      }
    });
  }

  return res.status(500).json({
    success: false,
    message: "An error occurred while processing your request",
    error: err.message,
  });
};

// Route for health check - no authentication required
router.get("/health", detectionController.healthCheck);

// Route for analyzing uploaded images
router.post(
  "/analyze",
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        return handleMulterError(err, req, res, next);
      }
      next();
    });
  },
  validateImageUpload,
  (req, res, next) => {
    try {
      detectionController.analyzeImage(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// Route for processing real-time camera stream
router.post(
  "/stream",
  express.json({ limit: "10mb" }),
  validateStreamInput,
  (req, res, next) => {
    try {
      detectionController.analyzeStream(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// Route for getting disease information
router.get("/disease/:id", validateDiseaseId, (req, res, next) => {
  try {
    detectionController.getDiseaseInfo(req, res);
  } catch (err) {
    next(err);
  }
});

// Route for getting analysis history (optional)
router.get("/history", async (req, res, next) => {
  try {
    // If not implemented yet, return a meaningful response
    res.status(200).json({
      success: true,
      message: "History retrieval feature coming soon",
      data: [],
    });
  } catch (error) {
    next(error);
  }
});

// Apply the error handler at the end
router.use(handleRouteError);

module.exports = router;
