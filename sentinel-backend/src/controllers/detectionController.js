// controllers/detectionController.js
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const tf = require("@tensorflow/tfjs-node");

// Import the enhanced model initialization module
const modelManager = require("../utils/modelInitialization");
const imageProcessor = require("../utils/imageProcessor");

// Map model outputs to disease names
const labelMap = {
  0: "Early Blight",
  1: "Healthy",
  2: "Late Blight",
  3: "Leaf Miner",
  4: "Leaf Mold",
  5: "Mosaic Virus",
  6: "Septoria",
  7: "Spider Mites",
  8: "Yellow Leaf Curl Virus",
};

// Get recommendations based on detected disease
const getRecommendations = (diseaseName) => {
  const recommendations = {
    "Early Blight": [
      "Remove infected leaves immediately",
      "Apply copper-based fungicides",
      "Maintain proper plant spacing for airflow",
      "Avoid overhead watering to prevent spore spread",
    ],
    "Late Blight": [
      "Remove and destroy all infected plant material",
      "Apply fungicides preventively in humid conditions",
      "Ensure good air circulation around plants",
      "Use resistant varieties in future plantings",
    ],
    "Leaf Miner": [
      "Remove and destroy affected leaves",
      "Use yellow sticky traps to monitor and catch adults",
      "Apply neem oil or insecticidal soap",
      "Introduce natural predators like parasitic wasps",
    ],
    "Leaf Mold": [
      "Improve air circulation around plants",
      "Reduce humidity in growing environment",
      "Apply fungicides at first sign of infection",
      "Avoid overhead watering to keep foliage dry",
    ],
    "Mosaic Virus": [
      "Remove and destroy infected plants completely",
      "Control aphids and other insects that spread the virus",
      "Wash hands and tools after handling infected plants",
      "Plant resistant varieties in future",
    ],
    Septoria: [
      "Remove infected leaves to prevent spread",
      "Apply fungicide at first sign of infection",
      "Maintain proper plant spacing",
      "Avoid overhead watering to keep foliage dry",
    ],
    "Spider Mites": [
      "Spray plants with strong stream of water to dislodge mites",
      "Apply insecticidal soap or neem oil to affected areas",
      "Increase humidity around plants",
      "Introduce predatory mites as biological control",
    ],
    "Yellow Leaf Curl Virus": [
      "Remove and destroy all infected plants",
      "Control whitefly populations with sticky traps",
      "Use reflective mulches to repel whiteflies",
      "Plant resistant varieties in future",
    ],
    Healthy: [
      "Continue regular maintenance",
      "Monitor plants regularly for early signs of disease",
      "Maintain proper watering and fertilization schedule",
      "Ensure good air circulation around plants",
    ],
  };

  return (
    recommendations[diseaseName] || [
      "Consult with a plant pathologist for specific recommendations",
      "Monitor the plant closely for changes in symptoms",
      "Ensure proper growing conditions (light, water, nutrients)",
    ]
  );
};

/**
 * Manages file cleanup to prevent storage leaks
 * @param {Array<string>} filePaths - Array of file paths to clean up
 */
async function cleanupFiles(filePaths) {
  try {
    const deletePromises = filePaths
      .filter((path) => path) // Filter out null/undefined paths
      .map((filePath) =>
        fs
          .unlink(filePath)
          .catch((err) =>
            console.error(`Error deleting file ${filePath}:`, err)
          )
      );

    await Promise.all(deletePromises);
  } catch (error) {
    console.error("Error during file cleanup:", error);
  }
}

/**
 * Creates a standardized API response
 * @param {boolean} success - Whether the operation was successful
 * @param {any} data - The data to include in the response (if successful)
 * @param {string} message - Message to include in the response
 * @param {Error} error - Error object (if operation failed)
 * @returns {Object} - Formatted response object
 */
function createResponse(success, data = null, message = "", error = null) {
  const response = {
    success,
    timestamp: new Date().toISOString(),
  };

  if (success && data) {
    response.data = data;
  }

  if (message) {
    response.message = message;
  }

  if (!success && error) {
    response.error = error.message;
    // In development, you might want to include the stack trace
    if (process.env.NODE_ENV === "development") {
      response.stack = error.stack;
    }
  }

  return response;
}

const detectionController = {
  /**
   * Analyze an uploaded plant image for disease detection
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  analyzeImage: async (req, res) => {
    const filesToCleanup = [];
    let processedFilePath = null;
    const startTime = Date.now();

    try {
      if (!req.file) {
        return res
          .status(400)
          .json(
            createResponse(
              false,
              null,
              "No image file uploaded",
              new Error("No image file uploaded")
            )
          );
      }

      // Ensure file path is correct
      const filePath = path.resolve(req.file.path);
      filesToCleanup.push(filePath);
      processedFilePath = filePath + "_processed.jpg";
      filesToCleanup.push(processedFilePath);

      // Verify file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        return res
          .status(404)
          .json(
            createResponse(
              false,
              null,
              `Upload file not found: ${filePath}`,
              error
            )
          );
      }

      // Check image quality before processing
      try {
        await imageProcessor.checkImageQuality(filePath);
      } catch (error) {
        return res
          .status(400)
          .json(
            createResponse(false, null, "Image quality check failed", error)
          );
      }

      // Process image to match model input requirements using sharp (640x640)
      await sharp(filePath)
        .resize(640, 640, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0 },
        })
        .toFile(processedFilePath);

      // Get model instances using the model manager
      const [yolov5, yolov7] = await Promise.all([
        modelManager.getYOLOv5Model(),
        modelManager.getYOLOv7Model(),
      ]);

      // Use imageProcessor to preprocess the image
      const imageBuffer = await fs.readFile(processedFilePath);
      const tensor = await imageProcessor.preprocessImage(processedFilePath);

      // Make predictions with timeout for both models
      const [yolov5Prediction, yolov7Prediction] = await Promise.all([
        yolov5.predict(tensor),
        yolov7.predict(tensor),
      ]);

      // Get prediction results for YOLOv5
      const yolov5Data = await yolov5Prediction.data();
      const yolov5ClassIndex = yolov5Data.indexOf(Math.max(...yolov5Data));
      const yolov5Confidence = yolov5Data[yolov5ClassIndex];
      const yolov5DiseaseName = labelMap[yolov5ClassIndex] || "Unknown";

      // Get prediction results for YOLOv7
      const yolov7Data = await yolov7Prediction.data();
      const yolov7ClassIndex = yolov7Data.indexOf(Math.max(...yolov7Data));
      const yolov7Confidence = yolov7Data[yolov7ClassIndex];
      const yolov7DiseaseName = labelMap[yolov7ClassIndex] || "Unknown";

      // Get recommendations for the detected diseases
      const yolov5Recommendations = getRecommendations(yolov5DiseaseName);
      const yolov7Recommendations = getRecommendations(yolov7DiseaseName);

      // Create results object with both model predictions
      const results = {
        yolov5Analysis: {
          disease: yolov5DiseaseName,
          confidence: yolov5Confidence,
          recommendations: yolov5Recommendations,
        },
        yolov7Analysis: {
          disease: yolov7DiseaseName,
          confidence: yolov7Confidence,
          recommendations: yolov7Recommendations,
        },
        // Use higher confidence model as the primary result
        analysis:
          yolov5Confidence > yolov7Confidence
            ? {
                disease: yolov5DiseaseName,
                confidence: yolov5Confidence,
                recommendations: yolov5Recommendations,
                model: "YOLOv5",
              }
            : {
                disease: yolov7DiseaseName,
                confidence: yolov7Confidence,
                recommendations: yolov7Recommendations,
                model: "YOLOv7",
              },
        processingTime: Date.now() - startTime,
      };

      // Cleanup resources
      // tf.dispose([tensor, yolov5Prediction, yolov7Prediction]);

      // Clean up processed files
      cleanupFiles(filesToCleanup);

      return res.status(200).json(
        createResponse(
          true,
          {
            ...results,
            filename: req.file.filename,
          },
          "Image analysis completed successfully"
        )
      );
    } catch (error) {
      console.error("Detection error:", error);

      // Cleanup on error
      cleanupFiles(filesToCleanup);

      return res
        .status(500)
        .json(createResponse(false, null, "Error processing image", error));
    }
  },

  /**
   * Process a base64 image stream from a camera feed
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  analyzeStream: async (req, res) => {
    const startTime = Date.now();

    try {
      const { imageData } = req.body;

      if (!imageData) {
        return res
          .status(400)
          .json(
            createResponse(
              false,
              null,
              "No image data provided",
              new Error("No image data provided")
            )
          );
      }

      // Get model instances using the model manager
      const [yolov5, yolov7] = await Promise.all([
        modelManager.getYOLOv5Model(),
        modelManager.getYOLOv7Model(),
      ]);

      // Process base64 image
      const base64Data = imageData.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");

      // Use imageProcessor to process the stream frame
      const tensor = await imageProcessor.processStreamFrame(buffer);

      // Make predictions with both models
      const [yolov5Prediction, yolov7Prediction] = await Promise.all([
        yolov5.predict(tensor),
        yolov7.predict(tensor),
      ]);

      // Process YOLOv5 results
      const yolov5Data = await yolov5Prediction.data();
      const yolov5ClassIndex = yolov5Data.indexOf(Math.max(...yolov5Data));
      const yolov5Confidence = yolov5Data[yolov5ClassIndex];
      const yolov5DiseaseName = labelMap[yolov5ClassIndex] || "Unknown";
      const yolov5Recommendations = getRecommendations(yolov5DiseaseName);

      // Process YOLOv7 results
      const yolov7Data = await yolov7Prediction.data();
      const yolov7ClassIndex = yolov7Data.indexOf(Math.max(...yolov7Data));
      const yolov7Confidence = yolov7Data[yolov7ClassIndex];
      const yolov7DiseaseName = labelMap[yolov7ClassIndex] || "Unknown";
      const yolov7Recommendations = getRecommendations(yolov7DiseaseName);

      // Cleanup resources
      // tf.dispose([tensor, yolov5Prediction, yolov7Prediction]);

      return res.status(200).json(
        createResponse(
          true,
          {
            yolov5Prediction: {
              disease: yolov5DiseaseName,
              confidence: yolov5Confidence,
              recommendations: yolov5Recommendations,
            },
            yolov7Prediction: {
              disease: yolov7DiseaseName,
              confidence: yolov7Confidence,
              recommendations: yolov7Recommendations,
            },
            // Use higher confidence model as the primary result
            analysis:
              yolov5Confidence > yolov7Confidence
                ? {
                    disease: yolov5DiseaseName,
                    confidence: yolov5Confidence,
                    recommendations: yolov5Recommendations,
                    model: "YOLOv5",
                  }
                : {
                    disease: yolov7DiseaseName,
                    confidence: yolov7Confidence,
                    recommendations: yolov7Recommendations,
                    model: "YOLOv7",
                  },
            processingTime: Date.now() - startTime,
          },
          "Stream analysis completed successfully"
        )
      );
    } catch (error) {
      console.error("Stream processing error:", error);

      return res
        .status(500)
        .json(createResponse(false, null, "Error in stream processing", error));
    }
  },

  /**
   * Get detailed information about a specific disease
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getDiseaseInfo: async (req, res) => {
    try {
      const diseaseId = req.params.id;

      // In a production app, you would fetch this from your database
      // using the Disease model. This is a simplified version.
      const diseases = {
        "early-blight": {
          id: "early-blight",
          name: "Early Blight",
          scientificName: "Alternaria solani",
          description:
            "A fungal disease that affects tomato leaves, stems, and fruits.",
          symptoms: [
            "Dark brown spots with concentric rings",
            "Yellowing around lesions",
            "Lower leaves affected first",
          ],
          treatments: [
            "Remove infected leaves",
            "Apply copper-based fungicides",
            "Maintain proper plant spacing",
          ],
          severity: "Medium",
        },
        // Other diseases would be added here
      };

      const diseaseInfo = diseases[diseaseId] || {
        id: diseaseId,
        name: "Unknown Disease",
        description: "Information not available for this disease.",
        treatment:
          "Consult with a plant pathologist for specific recommendations.",
        prevention: "Monitor plants regularly for signs of disease.",
      };

      return res
        .status(200)
        .json(
          createResponse(
            true,
            diseaseInfo,
            "Disease information retrieved successfully"
          )
        );
    } catch (error) {
      console.error("Disease info error:", error);

      return res
        .status(500)
        .json(
          createResponse(
            false,
            null,
            "Error retrieving disease information",
            error
          )
        );
    }
  },

  /**
   * Health check endpoint to confirm detection services are operational
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  healthCheck: async (req, res) => {
    try {
      // Check if models are loaded
      const modelsLoaded = {
        yolov5: modelManager.getModelConfig("yolov5") !== null,
        yolov7: modelManager.getModelConfig("yolov7") !== null,
      };

      return res.status(200).json(
        createResponse(
          true,
          {
            service: "detection",
            status: "operational",
            modelsLoaded,
            timestamp: new Date().toISOString(),
          },
          "Detection service is operational"
        )
      );
    } catch (error) {
      console.error("Health check error:", error);

      return res
        .status(503)
        .json(
          createResponse(
            false,
            null,
            "Detection service health check failed",
            error
          )
        );
    }
  },
};

module.exports = detectionController;
