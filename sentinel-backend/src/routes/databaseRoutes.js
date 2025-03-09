// routes/databaseRoutes.js
/**
 * This module defines the routes for database operations related to
 * plant diseases and detection history.
 *
 * It provides endpoints for:
 * - Retrieving disease information
 * - Managing disease data (admin functions)
 * - Accessing detection history
 */

const express = require("express");
const router = express.Router();
const diseaseController = require("../controllers/diseaseController");

/**
 * Disease routes
 * ---------------------------------------------------------------------
 * These routes handle disease information retrieval and management
 */

/**
 * @route   GET /api/database/diseases
 * @desc    Get all diseases in the database
 * @access  Public
 * @returns {Object} JSON with all diseases
 */
router.get("/diseases", diseaseController.getAllDiseases);

/**
 * @route   GET /api/database/diseases/:name
 * @desc    Get a specific disease by name
 * @access  Public
 * @param   {string} name - The name of the disease
 * @returns {Object} JSON with disease details
 */
router.get("/diseases/:name", diseaseController.getDiseaseByName);

/**
 * @route   POST /api/database/diseases
 * @desc    Create a new disease entry
 * @access  Admin only
 * @body    {Object} Disease information
 * @returns {Object} JSON with created disease
 */
router.post("/diseases", diseaseController.createDisease);

/**
 * @route   PUT /api/database/diseases/:name
 * @desc    Update a disease entry
 * @access  Admin only
 * @param   {string} name - The name of the disease to update
 * @body    {Object} Updated disease information
 * @returns {Object} JSON with updated disease
 */
router.put("/diseases/:name", diseaseController.updateDisease);

/**
 * @route   DELETE /api/database/diseases/:name
 * @desc    Delete a disease entry
 * @access  Admin only
 * @param   {string} name - The name of the disease to delete
 * @returns {Object} JSON with success message
 */
router.delete("/diseases/:name", diseaseController.deleteDisease);

/**
 * Database management routes
 * ---------------------------------------------------------------------
 * These routes provide database management functionality
 */

/**
 * @route   GET /api/database/stats
 * @desc    Get database statistics
 * @access  Admin only
 * @returns {Object} Database statistics including counts of entries
 */
router.get("/stats", async (req, res) => {
  try {
    // Placeholder implementation until full functionality is implemented
    res.status(200).json({
      success: true,
      message: "Database statistics feature coming soon",
      data: {
        diseasesCount: "Feature in development",
        detectionsCount: "Feature in development",
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving database statistics",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/database/seed
 * @desc    Seed the database with initial disease data
 * @access  Admin only
 * @returns {Object} JSON with seeding results
 */
router.post("/seed", async (req, res) => {
  try {
    // Import the seed utility
    const seedDatabase = require("../utils/seedDiseases");

    // Execute the seeding function
    await seedDatabase();

    res.status(200).json({
      success: true,
      message: "Database seeded successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error seeding database",
      error: error.message,
    });
  }
});

/**
 * Note: The following detection-related routes have been removed as they
 * require implementation of additional controller methods. They will be
 * re-added when the corresponding functionality is implemented.
 *
 * - GET /api/database/detections - Get detection history
 * - POST /api/database/detections - Create new detection record
 * - GET /api/database/detections/:id - Get specific detection
 * - DELETE /api/database/detections/:id - Delete detection record
 *
 * - GET /api/database/analytics/disease-frequency - Get disease frequency data
 * - GET /api/database/analytics/detection-timeline - Get detection timeline
 */

module.exports = router;
