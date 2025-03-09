// tests/testDatabase.js
const mongoose = require("mongoose");
const Disease = require("../models/Disease");
const Detection = require("../models/Detection");

const testDatabase = async () => {
  try {
    // Test database connection
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database connection successful");

    // Test Disease model
    const diseasesCount = await Disease.countDocuments();
    console.log(`Number of diseases in database: ${diseasesCount}`);

    // Test Detection model
    const detectionsCount = await Detection.countDocuments();
    console.log(`Number of detections in database: ${detectionsCount}`);

    // Test disease retrieval
    const sampleDisease = await Disease.findOne();
    if (sampleDisease) {
      console.log("Sample disease record:", sampleDisease.name);
    }

    console.log("Database tests completed successfully");
  } catch (error) {
    console.error("Database test failed:", error.message);
  } finally {
    await mongoose.connection.close();
  }
};

testDatabase();
