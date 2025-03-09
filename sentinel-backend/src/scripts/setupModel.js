// scripts/setupModel.js
const fs = require("fs").promises;
const path = require("path");

// Define model configuration
const MODEL_CONFIG = {
  yolov5: {
    dirName: "yolov5",
    modelFileName: "yolov5_model.json",
    sourceUrl:
      "https://github.com/sentinel-plant-disease-detection/models/releases",
  },
  yolov7: {
    dirName: "yolov7",
    modelFileName: "yolov7_model.json",
    sourceUrl:
      "https://github.com/sentinel-plant-disease-detection/models/releases",
  },
};

/**
 * Logs a message
 * @param {string} type - Message type (info, success, warning, error)
 * @param {string} message - The message to log
 */
function logMessage(type, message) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}]`;

  switch (type) {
    case "success":
      console.log(`${prefix} ✅ ${message}`);
      break;
    case "info":
      console.log(`${prefix} ℹ️ ${message}`);
      break;
    case "warning":
      console.log(`${prefix} ⚠️ ${message}`);
      break;
    case "error":
      console.error(`${prefix} ❌ ${message}`);
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

/**
 * Creates a directory if it doesn't exist
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<boolean>} - Whether the directory exists or was created
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    logMessage("success", `Directory created/confirmed at: ${dirPath}`);
    return true;
  } catch (err) {
    logMessage(
      "error",
      `Failed to create directory at ${dirPath}: ${err.message}`
    );
    return false;
  }
}

/**
 * Sets up model directories
 */
async function setupModelDirectories() {
  logMessage("info", "Setting up model directories...");

  const rootDir = path.resolve(__dirname, "..");

  // Track overall success
  let success = true;

  // Process each model
  for (const [modelName, config] of Object.entries(MODEL_CONFIG)) {
    logMessage("info", `Setting up ${modelName.toUpperCase()} model...`);

    // Ensure model directory exists
    const modelDir = path.join(rootDir, "models", config.dirName);
    const dirExists = await ensureDirectoryExists(modelDir);

    if (!dirExists) {
      success = false;
      continue;
    }

    // Check if model file exists
    const modelFilePath = path.join(modelDir, config.modelFileName);
    try {
      await fs.access(modelFilePath);
      logMessage("success", `Found model file: ${modelFilePath}`);
    } catch (err) {
      logMessage("warning", `Model file not found: ${modelFilePath}`);
      success = false;
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("MODEL SETUP SUMMARY");
  console.log("=".repeat(50));

  if (success) {
    logMessage("success", "All models are set up correctly!");
  } else {
    logMessage("warning", "Some models are missing or have issues.");

    // Print detailed instructions
    console.log("\nSETUP INSTRUCTIONS");
    console.log("-".repeat(50));

    for (const [modelName, config] of Object.entries(MODEL_CONFIG)) {
      const modelDir = path.join(rootDir, "models", config.dirName);

      console.log(`\n${modelName.toUpperCase()} Model:`);
      console.log(`Directory: ${modelDir}`);
      console.log(`Required files:`);
      console.log(`  - ${config.modelFileName} (main model file)`);
      console.log(
        `  - *.bin files (weight files referenced in the model.json)`
      );

      console.log(`\nYou can download these files from:`);
      console.log(`  ${config.sourceUrl}`);

      console.log(
        `\nAfter downloading, place the files in the directory shown above.`
      );
      console.log(`Then run this setup script again to verify.`);
    }
  }

  console.log("\n" + "=".repeat(50));
}

// Run the setup function
setupModelDirectories().catch((err) => {
  logMessage("error", `Setup failed: ${err.message}`);
  process.exit(1);
});
