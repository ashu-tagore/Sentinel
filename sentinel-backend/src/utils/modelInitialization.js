// utils/modelInitialization.js
const tf = require("@tensorflow/tfjs-node");
const path = require("path");
const fs = require("fs").promises;

// Global variables to hold the model instances - using a Map for better organization
const modelCache = new Map();

/**
 * Configuration object for model settings
 */
const MODEL_CONFIG = {
  yolov5: {
    modelPath: "../models/yolov5/yolov5_model.json",
    warmupShape: [1, 640, 640, 3],
    timeout: 60000, // 60 second timeout for loading
    retryAttempts: 3,
    retryDelay: 5000,
  },
  yolov7: {
    modelPath: "../models/yolov7/yolov7_model.json",
    warmupShape: [1, 640, 640, 3],
    timeout: 60000, // 60 second timeout for loading
    retryAttempts: 3,
    retryDelay: 5000,
  },
};

/**
 * Logger function for consistent logging format
 * @param {string} level - Log level (info, warn, error)
 * @param {string} modelName - Name of the model
 * @param {string} message - Log message
 * @param {Error} [error] - Optional error object
 */
function logMessage(level, modelName, message, error = null) {
  const timestamp = new Date().toISOString();
  const logPrefix = `[${timestamp}] [${level.toUpperCase()}] [${modelName}]`;

  if (level === "error" && error) {
    console.error(`${logPrefix} ${message}`, error);
    // You could also log to a file or monitoring service here
  } else if (level === "warn") {
    console.warn(`${logPrefix} ${message}`);
  } else {
    console.log(`${logPrefix} ${message}`);
  }
}

/**
 * Check if model files exist before attempting to load
 * @param {string} modelName - Name of the model (yolov5 or yolov7)
 * @returns {Promise<string>} - Full path to the model file
 * @throws {Error} - If model files don't exist
 */
async function checkModelFiles(modelName) {
  if (!MODEL_CONFIG[modelName]) {
    throw new Error(`Unknown model: ${modelName}`);
  }

  const modelPath = path.join(__dirname, MODEL_CONFIG[modelName].modelPath);

  try {
    await fs.access(modelPath);
    logMessage("info", modelName, `Model file found at: ${modelPath}`);
    return modelPath;
  } catch (error) {
    const errorMsg = `Model file not found at: ${modelPath}`;
    logMessage("error", modelName, errorMsg, error);

    // Provide helpful instructions for resolving the issue
    const modelDir = path.dirname(modelPath);
    const helpMsg = `
Please ensure you have placed your ${modelName.toUpperCase()} model files in the correct location:
- ${path.basename(modelPath)} file should be at: ${modelPath}
- The corresponding weight files (.bin) should be in: ${modelDir}

You can run 'node scripts/setupModel.js' to create the directory structure.
`;
    console.error(helpMsg);
    throw new Error(
      `${modelName.toUpperCase()} model file not found. See console for details.`
    );
  }
}

/**
 * Perform a warmup inference to initialize the model
 * @param {string} modelName - Name of the model
 * @param {tf.GraphModel} model - Loaded TensorFlow.js model
 * @returns {Promise<void>}
 */
async function warmupModel(modelName, model) {
  logMessage("info", modelName, "Running model warmup...");

  try {
    const shape = MODEL_CONFIG[modelName].warmupShape;
    const dummyInput = tf.zeros(shape);

    // Time the warmup process
    const startTime = Date.now();
    const warmupResult = await model.predict(dummyInput);
    const duration = Date.now() - startTime;

    // Clean up tensors
    warmupResult.dispose();
    dummyInput.dispose();

    logMessage("info", modelName, `Model warmup completed in ${duration}ms`);
  } catch (error) {
    logMessage("warn", modelName, "Model warmup failed, but continuing", error);
    // We don't throw here because warmup failure shouldn't prevent model usage
  }
}

/**
 * Load a model with timeout and retry logic
 * @param {string} modelName - Name of the model to load
 * @returns {Promise<tf.GraphModel>} - The loaded model
 */
async function loadModelWithRetry(modelName) {
  const config = MODEL_CONFIG[modelName];
  let lastError = null;
  let modelPath = null;

  try {
    modelPath = await checkModelFiles(modelName);
  } catch (error) {
    // If files don't exist, don't retry
    throw error;
  }

  // Convert file path to file:// URL format for tfjs-node
  const modelUrl = `file://${modelPath}`;

  // Try loading with configured number of retries
  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      logMessage(
        "info",
        modelName,
        `Loading model (attempt ${attempt}/${config.retryAttempts})...`
      );

      // Create a promise that will reject after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Model loading timed out after ${config.timeout}ms`)
          );
        }, config.timeout);
      });

      // Race the model loading against the timeout
      const model = await Promise.race([
        tf.loadGraphModel(modelUrl),
        timeoutPromise,
      ]);

      logMessage("info", modelName, "Model loaded successfully!");

      // Warmup the model
      await warmupModel(modelName, model);

      // Cache the model
      modelCache.set(modelName, model);

      return model;
    } catch (error) {
      lastError = error;
      logMessage(
        "error",
        modelName,
        `Attempt ${attempt} failed to load model`,
        error
      );

      // If we haven't reached max retries, wait before trying again
      if (attempt < config.retryAttempts) {
        logMessage(
          "info",
          modelName,
          `Waiting ${config.retryDelay}ms before retry...`
        );
        await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
      }
    }
  }

  // If we get here, all retries failed
  const errorMsg = `Failed to load ${modelName.toUpperCase()} model after ${
    config.retryAttempts
  } attempts`;
  logMessage("error", modelName, errorMsg, lastError);
  throw new Error(`${errorMsg}: ${lastError.message}`);
}

/**
 * Get a model, loading it if necessary
 * @param {string} modelName - Name of the model to get
 * @returns {Promise<tf.GraphModel>} - The requested model
 */
async function getModel(modelName) {
  // Validate model name
  if (!MODEL_CONFIG[modelName]) {
    throw new Error(`Unknown model: ${modelName}`);
  }

  // Return cached model if available
  if (modelCache.has(modelName)) {
    return modelCache.get(modelName);
  }

  // Otherwise load the model
  return loadModelWithRetry(modelName);
}

/**
 * Initialize all configured models
 * @returns {Promise<Map<string, tf.GraphModel>>} - Map of loaded models
 */
async function initializeAllModels() {
  logMessage("info", "ALL", "Initializing all models...");

  const modelPromises = Object.keys(MODEL_CONFIG).map((modelName) =>
    getModel(modelName).catch((error) => {
      logMessage(
        "warn",
        modelName,
        `Initialization failed but continuing with other models`,
        error
      );
      return null; // Return null for failed models so Promise.all doesn't reject
    })
  );

  // Wait for all models to load (or fail)
  await Promise.all(modelPromises);

  const loadedCount = modelCache.size;
  const totalCount = Object.keys(MODEL_CONFIG).length;

  if (loadedCount === 0) {
    logMessage("error", "ALL", "Failed to load any models");
  } else if (loadedCount < totalCount) {
    logMessage("warn", "ALL", `Loaded ${loadedCount}/${totalCount} models`);
  } else {
    logMessage("info", "ALL", `Successfully loaded all ${loadedCount} models`);
  }

  return modelCache;
}

/**
 * Clean up model resources
 * @param {string} [modelName] - Specific model to cleanup, or all if not specified
 */
function cleanupModels(modelName = null) {
  if (modelName) {
    if (modelCache.has(modelName)) {
      modelCache.get(modelName).dispose();
      modelCache.delete(modelName);
      logMessage("info", modelName, "Model resources cleaned up");
    }
  } else {
    // Clean up all models
    for (const [name, model] of modelCache.entries()) {
      model.dispose();
      logMessage("info", name, "Model resources cleaned up");
    }
    modelCache.clear();
    logMessage("info", "ALL", "All model resources cleaned up");
  }
}

// Export a clean API
module.exports = {
  // Main functions
  getModel,
  initializeAllModels,
  cleanupModels,

  // Shortcuts for specific models
  getYOLOv5Model: () => getModel("yolov5"),
  getYOLOv7Model: () => getModel("yolov7"),

  // Configuration access (read-only)
  getModelConfig: (modelName) => {
    const config = MODEL_CONFIG[modelName];
    return config ? { ...config } : null;
  },

  // Constants
  MODELS: {
    YOLOV5: "yolov5",
    YOLOV7: "yolov7",
  },
};
