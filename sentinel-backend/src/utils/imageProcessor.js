// utils/imageProcessor.js
const tf = require("@tensorflow/tfjs-node");
const fs = require("fs").promises;
const sharp = require("sharp");

/**
 * Image processing utility functions for plant disease detection models
 */
const imageProcessor = {
  /**
   * Preprocess an image file for model input
   *
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<tf.Tensor>} - Preprocessed tensor ready for model input
   */
  preprocessImage: async (imagePath) => {
    try {
      // Read image file from the given path
      const imageBuffer = await fs.readFile(imagePath);

      // Decode image and convert to tensor
      const image = await tf.node.decodeImage(imageBuffer, 3); // Ensure 3 channels (RGB)

      // Normalize pixel values to [0,1]
      const normalized = tf.tidy(() => {
        return image.div(tf.scalar(255.0));
      });

      // Add batch dimension
      const batched = normalized.expandDims(0);

      // Clean up the original image tensor to avoid memory leaks
      image.dispose();

      return batched;
    } catch (error) {
      throw new Error(`Image preprocessing failed: ${error.message}`);
    }
  },

  /**
   * Process a raw image buffer for model input (used for direct buffer processing)
   *
   * @param {Buffer} imageBuffer - Raw image buffer
   * @param {Object} options - Processing options
   * @param {number} options.width - Target width (default: 640)
   * @param {number} options.height - Target height (default: 640)
   * @returns {Promise<tf.Tensor>} - Preprocessed tensor ready for model input
   */
  processImageBuffer: async (imageBuffer, options = {}) => {
    const { width = 640, height = 640 } = options;

    try {
      // Resize the image using sharp
      const resizedBuffer = await sharp(imageBuffer)
        .resize(width, height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0 },
        })
        .toBuffer();

      // Decode image and convert to tensor
      const image = await tf.node.decodeImage(resizedBuffer, 3);

      // Normalize pixel values to [0,1]
      const normalized = tf.tidy(() => {
        return image.div(tf.scalar(255.0));
      });

      // Add batch dimension
      const batched = normalized.expandDims(0);

      // Clean up the original image tensor to avoid memory leaks
      image.dispose();

      return batched;
    } catch (error) {
      throw new Error(`Buffer processing failed: ${error.message}`);
    }
  },

  /**
   * Process a base64 encoded image from a camera stream
   *
   * @param {Buffer|string} data - Either a buffer or base64 encoded string
   * @returns {Promise<tf.Tensor>} - Preprocessed tensor ready for model input
   */
  processStreamFrame: async (data) => {
    try {
      let buffer;

      // Handle both buffer and base64 string inputs
      if (Buffer.isBuffer(data)) {
        buffer = data;
      } else if (typeof data === "string") {
        // If it's a base64 string with data URI prefix, extract the data part
        const base64Data = data.includes(",") ? data.split(",")[1] : data;
        buffer = Buffer.from(base64Data, "base64");
      } else {
        throw new Error("Invalid input: expected Buffer or base64 string");
      }

      // Use the buffer processing function with default options
      return imageProcessor.processImageBuffer(buffer);
    } catch (error) {
      throw new Error(`Stream processing failed: ${error.message}`);
    }
  },

  /**
   * Check if image meets minimum quality requirements
   *
   * @param {string} imagePath - Path to the image file
   * @param {Object} options - Quality check options
   * @param {number} options.minSize - Minimum file size in bytes (default: 10KB)
   * @param {number} options.minWidth - Minimum width in pixels (default: 224)
   * @param {number} options.minHeight - Minimum height in pixels (default: 224)
   * @returns {Promise<boolean>} - True if image meets quality requirements
   */
  checkImageQuality: async (imagePath, options = {}) => {
    const {
      minSize = 10 * 1024, // 10KB
      minWidth = 224,
      minHeight = 224,
    } = options;

    try {
      // Get file statistics
      const stats = await fs.stat(imagePath);

      // Check if image meets minimum size requirement
      if (stats.size < minSize) {
        throw new Error(
          `Image file too small (${stats.size} bytes). Minimum size: ${minSize} bytes`
        );
      }

      // Get image dimensions using sharp
      const metadata = await sharp(imagePath).metadata();

      if (metadata.width < minWidth || metadata.height < minHeight) {
        throw new Error(
          `Image dimensions too small (${metadata.width}x${metadata.height}). Minimum: ${minWidth}x${minHeight}`
        );
      }

      return true;
    } catch (error) {
      if (error.message.includes("Image")) {
        throw error; // Rethrow our custom errors
      } else {
        throw new Error(`Image quality check failed: ${error.message}`);
      }
    }
  },

  /**
   * Save a processed tensor as an image file (useful for debugging)
   *
   * @param {tf.Tensor} tensor - The tensor to save
   * @param {string} outputPath - Path where the image should be saved
   * @returns {Promise<string>} - Path to the saved image
   */
  saveTensorAsImage: async (tensor, outputPath) => {
    try {
      // Remove batch dimension if present
      const squeezed = tensor.shape[0] === 1 ? tensor.squeeze() : tensor;

      // Convert normalized [0,1] values back to [0,255]
      const scaled = tf.tidy(() => {
        return squeezed.mul(tf.scalar(255)).cast("int32");
      });

      // Convert to uint8 array and write to file
      const [height, width] = scaled.shape;
      const rgbaData = tf.tidy(() => {
        // If grayscale, convert to RGB
        if (scaled.shape.length === 2 || scaled.shape[2] === 1) {
          const grayscale =
            scaled.shape.length === 2 ? scaled : scaled.squeeze(2);
          // Stack the grayscale channel 3 times to get RGB
          return tf
            .stack([grayscale, grayscale, grayscale], 2)
            .reshape([height, width, 3]);
        }
        return scaled;
      });

      const imageData = await rgbaData.array();

      // Create sharp image from pixel data
      const channels = rgbaData.shape[2];
      const pixelArray = new Uint8Array(width * height * channels);

      // Flatten 3D array to 1D Uint8Array
      let idx = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let c = 0; c < channels; c++) {
            pixelArray[idx++] = imageData[y][x][c];
          }
        }
      }

      // Save using sharp
      await sharp(pixelArray, {
        raw: {
          width,
          height,
          channels,
        },
      }).toFile(outputPath);

      // Clean up tensors
      squeezed.dispose();
      scaled.dispose();
      rgbaData.dispose();

      return outputPath;
    } catch (error) {
      throw new Error(`Failed to save tensor as image: ${error.message}`);
    }
  },
};

module.exports = imageProcessor;
