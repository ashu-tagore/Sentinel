// app.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet"); // For security headers
const morgan = require("morgan"); // For logging
const compression = require("compression"); // For response compression

// Import routes and utilities
const databaseRoutes = require("./routes/databaseRoutes");
const connectDB = require("./config/database");
const { initializeAllModels } = require("./utils/modelInitialization");

// Load environment variables
require("dotenv").config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Ensure required directories exist
 * Creates them if they don't
 */
function ensureDirectories() {
  const dirs = [
    { path: "./uploads", purpose: "image uploads" },
    { path: "./models/yolov5", purpose: "YOLOv5 model files" },
    { path: "./models/yolov7", purpose: "YOLOv7 model files" }
  ];
  
  let allCreated = true;
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir.path)) {
      try {
        fs.mkdirSync(dir.path, { recursive: true });
        console.log(`Created ${dir.purpose} directory at ${dir.path}`);
      } catch (err) {
        console.error(`Failed to create ${dir.purpose} directory at ${dir.path}:`, err);
        allCreated = false;
      }
    }
  });
  
  if (!allCreated) {
    console.warn("Warning: Some directories could not be created. Check permissions.");
  }
  
  return allCreated;
}

/**
 * Configure CORS with environment-aware settings
 */
function configureCors() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map(origin => origin.trim());
  
  return cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    credentials: true,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  });
}

/**
 * Configure security headers
 */
function configureSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    referrerPolicy: { policy: "no-referrer" },
    xssFilter: true,
  });
}

/**
 * Configure logging based on environment
 */
function configureLogging() {
  // Use different log formats for different environments
  if (process.env.NODE_ENV === 'production') {
    // Concise format for production
    return morgan('combined', {
      skip: (req, res) => res.statusCode < 400 // Only log errors
    });
  } else {
    // Detailed format for development
    return morgan('dev');
  }
}

/**
 * Configure rate limiting to prevent abuse
 */
function configureRateLimiting() {
  const rateLimit = require("express-rate-limit");
  
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      message: "Too many requests, please try again later."
    }
  });
}

/**
 * Start the server and initialize all components
 */
async function startServer() {
  try {
    // Ensure required directories exist
    ensureDirectories();
    
    // Apply middleware
    app.use(configureSecurityHeaders());
    app.use(configureCors());
    app.use(configureLogging());
    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    app.use(compression());
    
    // Static directories
    app.use("/uploads", express.static(path.join(__dirname, "uploads")));
    app.use("/assets", express.static(path.join(__dirname, "assets")));
    
    // Apply rate limiting to all routes
    app.use(configureRateLimiting());
    
    // Basic route for root path
    app.get("/", (req, res) => {
      res.json({
        name: "Sentinel Plant Disease Detection API",
        version: "1.0.0",
        status: "operational",
        timestamp: new Date().toISOString(),
        endpoints: {
          detection: "/api/detection/*",
          database: "/api/database/*",
        },
      });
    });
    
    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "up",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });
    
    // Apply routes
    // app.use("/api/detection", detectionRoutes);
    app.use("/api/database", databaseRoutes);
    
    // Handle pre-flight requests
    app.options("*", cors());
    
    // Global error handler (keep at the end of middleware chain)
    app.use((err, req, res, next) => {
      console.error("Global error handler caught:", err);
      
      // Clean up any uploaded files if there's an error
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, (unlinkError) => {
          if (unlinkError) console.error("Error deleting file:", unlinkError);
        });
      }
      
      // Format error response
      const statusCode = err.statusCode || 500;
      const errorResponse = {
        success: false,
        message: err.message || "Internal server error",
        timestamp: new Date().toISOString(),
      };
      
      // Add stack trace in development
      if (process.env.NODE_ENV === "development") {
        errorResponse.stack = err.stack;
      }
      
      res.status(statusCode).json(errorResponse);
    });
    
    // Connect to database (if configured)
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        console.log("Database connection initialized");
      } catch (error) {
        console.warn("Database connection failed:", error.message);
        console.warn("The application will run without database features");
      }
    } else {
      console.warn("MONGODB_URI not set - running without database features");
    }
    
    // Initialize ML models in the background (don't block server startup)
    // initializeAllModels()
    //   .then(() => console.log("Model initialization completed"))
    //   .catch(err => {
    //     console.warn("Model initialization warning:", err.message);
    //     console.warn("The server started, but model functionality may not work until model files are properly configured.");
    //   });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`
=========================================
🌱 Sentinel API Server
=========================================
✅ Server running on port: ${PORT}
📂 Upload directory: ${path.resolve("./uploads")}
🧠 YOLOv5 model directory: ${path.resolve("./models/yolov5")}
🧠 YOLOv7 model directory: ${path.resolve("./models/yolov7")}
🔗 API URL: http://localhost:${PORT}
📝 API Documentation: http://localhost:${PORT}/docs (if enabled)
🔧 Environment: ${process.env.NODE_ENV || "development"}
=========================================
      `);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  // Clean up uploads directory if needed
  // Close database connection
  // Release other resources
  process.exit(0);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise rejection:", err);
  // Don't crash the application, but log the error
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // For uncaught exceptions, we might want to exit after cleanup
  // process.exit(1);
});

// Start the server
startServer();