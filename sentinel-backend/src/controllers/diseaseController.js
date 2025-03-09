// controllers/diseaseController.js
const Disease = require("../models/Disease");

/**
 * Response formatter for consistent API responses
 * @param {boolean} success - Operation success status
 * @param {*} data - Response data (optional)
 * @param {string} message - Response message (optional)
 * @param {Error} error - Error object (optional)
 * @returns {Object} Formatted response object
 */
const formatResponse = (success, data = null, message = "", error = null) => {
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
    // Include more detailed error info in development
    if (process.env.NODE_ENV === "development") {
      response.stack = error.stack;
    }
  }

  return response;
};

/**
 * Disease controller - handles all disease-related operations
 */
const diseaseController = {
  /**
   * Get all diseases from the database
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getAllDiseases: async (req, res) => {
    try {
      // Apply optional filters from query parameters
      const filter = {};
      if (req.query.severity) {
        filter.severity = req.query.severity;
      }

      // Apply sorting (default to name ascending)
      const sort = {};
      if (req.query.sort) {
        const [field, order] = req.query.sort.split(":");
        sort[field] = order === "desc" ? -1 : 1;
      } else {
        sort.name = 1;
      }

      // Add pagination support
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Execute query with filters, sorting, and pagination
      const diseases = await Disease.find(filter)
        .select("-__v")
        .sort(sort)
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const total = await Disease.countDocuments(filter);

      res.status(200).json(
        formatResponse(
          true,
          {
            count: diseases.length,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: diseases,
          },
          "Diseases retrieved successfully"
        )
      );
    } catch (error) {
      console.error("Error in getAllDiseases:", error);
      res
        .status(500)
        .json(formatResponse(false, null, "Error fetching diseases", error));
    }
  },

  /**
   * Get a specific disease by name
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getDiseaseByName: async (req, res) => {
    try {
      const diseaseName = req.params.name;

      if (!diseaseName) {
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Disease name is required",
              new Error("Disease name parameter is missing")
            )
          );
      }

      // Use case-insensitive regex match for more flexible name lookup
      const disease = await Disease.findOne({
        name: { $regex: new RegExp(diseaseName, "i") },
      }).select("-__v");

      if (!disease) {
        return res
          .status(404)
          .json(
            formatResponse(
              false,
              null,
              "Disease not found",
              new Error(`No disease found with name "${diseaseName}"`)
            )
          );
      }

      // Update access timestamp (but don't wait for it to complete)
      Disease.updateOne(
        { _id: disease._id },
        { $set: { lastAccessedAt: new Date() } }
      ).catch((err) => console.error("Error updating access timestamp:", err));

      res
        .status(200)
        .json(formatResponse(true, disease, "Disease retrieved successfully"));
    } catch (error) {
      console.error("Error in getDiseaseByName:", error);
      res
        .status(500)
        .json(formatResponse(false, null, "Error fetching disease", error));
    }
  },

  /**
   * Create a new disease entry
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  createDisease: async (req, res) => {
    try {
      // Validate required fields
      const {
        name,
        scientificName,
        description,
        symptoms,
        treatments,
        severity,
      } = req.body;

      if (
        !name ||
        !scientificName ||
        !description ||
        !symptoms ||
        !treatments ||
        !severity
      ) {
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Missing required fields",
              new Error(
                "Name, scientificName, description, symptoms, treatments, and severity are required"
              )
            )
          );
      }

      // Check if disease already exists
      const existingDisease = await Disease.findOne({ name });
      if (existingDisease) {
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Disease already exists",
              new Error(`A disease with name "${name}" already exists`)
            )
          );
      }

      // Create the disease
      const disease = await Disease.create(req.body);

      res
        .status(201)
        .json(formatResponse(true, disease, "Disease created successfully"));
    } catch (error) {
      console.error("Error in createDisease:", error);

      // Handle validation errors
      if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Validation error",
              new Error(validationErrors.join(", "))
            )
          );
      }

      // Handle duplicate key errors
      if (error.code === 11000) {
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Disease already exists",
              new Error("A disease with this name already exists")
            )
          );
      }

      res
        .status(500)
        .json(formatResponse(false, null, "Error creating disease", error));
    }
  },

  /**
   * Update an existing disease
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  updateDisease: async (req, res) => {
    try {
      const diseaseName = req.params.name;

      if (!diseaseName) {
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Disease name is required",
              new Error("Disease name parameter is missing")
            )
          );
      }

      // Find and update the disease
      const disease = await Disease.findOneAndUpdate(
        { name: new RegExp(diseaseName, "i") },
        {
          ...req.body,
          updatedAt: new Date(), // Ensure updatedAt is set even if mongoose doesn't do it
        },
        {
          new: true, // Return the updated document
          runValidators: true, // Run model validators
          context: "query", // Required for custom validators
        }
      );

      if (!disease) {
        return res
          .status(404)
          .json(
            formatResponse(
              false,
              null,
              "Disease not found",
              new Error(`No disease found with name "${diseaseName}"`)
            )
          );
      }

      res
        .status(200)
        .json(formatResponse(true, disease, "Disease updated successfully"));
    } catch (error) {
      console.error("Error in updateDisease:", error);

      // Handle validation errors
      if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Validation error",
              new Error(validationErrors.join(", "))
            )
          );
      }

      res
        .status(500)
        .json(formatResponse(false, null, "Error updating disease", error));
    }
  },

  /**
   * Delete a disease
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  deleteDisease: async (req, res) => {
    try {
      const diseaseName = req.params.name;

      if (!diseaseName) {
        return res
          .status(400)
          .json(
            formatResponse(
              false,
              null,
              "Disease name is required",
              new Error("Disease name parameter is missing")
            )
          );
      }

      // Find and delete the disease
      const disease = await Disease.findOneAndDelete({
        name: new RegExp(diseaseName, "i"),
      });

      if (!disease) {
        return res
          .status(404)
          .json(
            formatResponse(
              false,
              null,
              "Disease not found",
              new Error(`No disease found with name "${diseaseName}"`)
            )
          );
      }

      res
        .status(200)
        .json(formatResponse(true, null, "Disease deleted successfully"));
    } catch (error) {
      console.error("Error in deleteDisease:", error);
      res
        .status(500)
        .json(formatResponse(false, null, "Error deleting disease", error));
    }
  },
};

module.exports = diseaseController;
