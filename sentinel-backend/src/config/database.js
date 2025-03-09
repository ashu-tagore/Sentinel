// config/database.js
const mongoose = require("mongoose");

/**
 * MongoDB connection configuration
 * This can be overridden by environment variables
 */
const DEFAULT_CONFIG = {
  maxPoolSize: 10, // Maximum concurrent connections
  minPoolSize: 2, // Minimum connections to maintain
  connectTimeoutMS: 10000, // How long to wait for initial connection
  socketTimeoutMS: 45000, // How long to wait for operations
  serverSelectionTimeoutMS: 5000, // How long to wait for server selection
  heartbeatFrequencyMS: 10000, // Background monitoring frequency
  retryAttempts: 5, // How many times to retry initial connection
  retryDelay: 5000, // Delay between retry attempts (ms)
  loggerLevel: "error", // Logger level (error/warn/info/debug)
  family: 4, // Use IPv4
};

/**
 * Logger function for database connection events
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Error} [error] - Optional error object
 */
function dbLogger(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [MONGODB] [${level.toUpperCase()}]`;

  if (level === "error" && error) {
    console.error(`${prefix} ${message}`, error);
  } else if (level === "warn") {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Connect to MongoDB
 * Handles connection setup, event listeners, and error recovery
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
const connectDB = async () => {
  // Get configuration from environment variables or use defaults
  const config = {
    maxPoolSize:
      parseInt(process.env.MONGODB_MAX_POOL_SIZE) || DEFAULT_CONFIG.maxPoolSize,
    minPoolSize:
      parseInt(process.env.MONGODB_MIN_POOL_SIZE) || DEFAULT_CONFIG.minPoolSize,
    connectTimeoutMS:
      parseInt(process.env.MONGODB_CONNECT_TIMEOUT) ||
      DEFAULT_CONFIG.connectTimeoutMS,
    socketTimeoutMS:
      parseInt(process.env.MONGODB_SOCKET_TIMEOUT) ||
      DEFAULT_CONFIG.socketTimeoutMS,
    serverSelectionTimeoutMS:
      parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT) ||
      DEFAULT_CONFIG.serverSelectionTimeoutMS,
    heartbeatFrequencyMS:
      parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY) ||
      DEFAULT_CONFIG.heartbeatFrequencyMS,
    retryAttempts:
      parseInt(process.env.MONGODB_RETRY_ATTEMPTS) ||
      DEFAULT_CONFIG.retryAttempts,
    retryDelay:
      parseInt(process.env.MONGODB_RETRY_DELAY) || DEFAULT_CONFIG.retryDelay,
    family: DEFAULT_CONFIG.family,
  };

  // Track connection attempts
  let attempts = 0;
  const maxAttempts = config.retryAttempts;

  // Use recursive function for retry logic
  const attemptConnection = async () => {
    attempts++;

    try {
      dbLogger("info", `Connection attempt ${attempts}/${maxAttempts}...`);

      // Connect to MongoDB
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        ...config,
      });

      dbLogger(
        "info",
        `MongoDB Connected to ${conn.connection.host} (${conn.connection.name})`
      );
      return conn;
    } catch (error) {
      dbLogger("error", `Connection attempt ${attempts} failed`, error);

      // Handle retry logic
      if (attempts < maxAttempts) {
        dbLogger("info", `Retrying in ${config.retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
        return attemptConnection();
      } else {
        dbLogger(
          "error",
          `Failed to connect after ${maxAttempts} attempts`,
          error
        );
        throw error;
      }
    }
  };

  try {
    const conn = await attemptConnection();

    // Set up connection event handlers
    setupConnectionHandlers(conn.connection);

    return conn;
  } catch (error) {
    console.error("\nMONGODB CONNECTION ERROR:", error.message);
    console.error(
      "Please check your MongoDB connection string and ensure your database is running."
    );
    console.error(
      "Set the MONGODB_URI environment variable with a valid connection string.\n"
    );

    // In production, we might want to exit, but in development we might want to continue
    if (process.env.NODE_ENV === "production") {
      console.error(
        "Application shutting down due to database connection failure."
      );
      process.exit(1);
    } else {
      console.warn(
        "Application continuing without database connection. Some features will not work."
      );
      return null;
    }
  }
};

/**
 * Set up event handlers for the MongoDB connection
 * @param {mongoose.Connection} connection - Mongoose connection
 */
function setupConnectionHandlers(connection) {
  // Handle connection events
  connection.on("connected", () => {
    dbLogger("info", "Connection established to MongoDB");
  });

  connection.on("error", (err) => {
    dbLogger("error", "MongoDB connection error", err);
  });

  connection.on("disconnected", () => {
    dbLogger("warn", "MongoDB disconnected");
  });

  connection.on("reconnected", () => {
    dbLogger("info", "MongoDB reconnected");
  });

  // Handle process termination
  const gracefulExit = async () => {
    try {
      await connection.close();
      dbLogger("info", "MongoDB connection closed through app termination");
      process.exit(0);
    } catch (err) {
      dbLogger("error", "Error during MongoDB disconnect", err);
      process.exit(1);
    }
  };

  // Listen for app termination signals
  process.on("SIGINT", gracefulExit);
  process.on("SIGTERM", gracefulExit);
  process.once("SIGUSR2", gracefulExit); // For nodemon restarts

  // Handle other events
  process.on("uncaughtException", (err) => {
    dbLogger("error", "Uncaught exception, checking MongoDB connection", err);
    // Instead of crashing, we check if the exception was DB related
    if (connection.readyState !== 1) {
      dbLogger("warn", "MongoDB connection lost, attempting to reconnect...");
      // Mongoose will try to reconnect automatically due to useUnifiedTopology
    }
    // For non-DB related exceptions, follow your app's error handling policy
  });
}

module.exports = connectDB;
