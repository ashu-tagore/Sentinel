// utils/seedDiseases.js
const mongoose = require("mongoose");
const Disease = require("../models/Disease");
const fs = require("fs").promises;
const path = require("path");

/**
 * Logger function for seeding operations
 * @param {string} level - Log level (info, success, warning, error)
 * @param {string} message - Log message
 * @param {Error} [error] - Optional error object
 */
function logMessage(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [SEED]`;

  switch (level) {
    case "success":
      console.log(`${prefix} ✅ ${message}`);
      break;
    case "info":
      console.log(`${prefix} ℹ️ ${message}`);
      break;
    case "warning":
      console.warn(`${prefix} ⚠️ ${message}`);
      break;
    case "error":
      console.error(`${prefix} ❌ ${message}`);
      if (error) {
        console.error(`${prefix} Error details:`, error);
      }
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

/**
 * Default disease data
 * Contains information about common plant diseases
 */
const diseaseData = [
  {
    name: "Early Blight",
    scientificName: "Alternaria solani",
    description:
      "A fungal disease that affects tomato leaves, stems, and fruits. It typically appears as dark brown spots with concentric rings, resembling a target. The disease starts on lower leaves and progresses upward if not controlled.",
    symptoms: [
      "Dark brown spots with concentric rings",
      "Yellowing around lesions",
      "Lower leaves affected first",
      "Spots may coalesce to form larger blighted areas",
      "Severely infected leaves may drop",
    ],
    treatments: [
      "Remove infected leaves immediately",
      "Apply copper-based fungicides",
      "Apply organic fungicides like neem oil",
      "Maintain proper plant spacing for airflow",
      "Keep foliage dry by using drip irrigation",
    ],
    preventions: [
      "Use disease-resistant varieties",
      "Practice crop rotation",
      "Mulch around plants to prevent soil splash",
      "Ensure adequate nutrition",
      "Apply preventive fungicides during humid weather",
    ],
    severity: "Medium",
    imageUrl: "/assets/diseases/early-blight.jpg",
  },
  {
    name: "Late Blight",
    scientificName: "Phytophthora infestans",
    description:
      "A devastating water mold that can rapidly kill tomato plants. It was responsible for the Irish Potato Famine and remains one of the most serious diseases of potatoes and tomatoes worldwide. In cool, wet conditions, an entire crop can be destroyed within days.",
    symptoms: [
      "Dark brown to black patches on leaves",
      "White fuzzy growth underneath leaves",
      "Blackened stems with dark lesions",
      "Firm, brown decay on green fruit",
      "Rapid plant collapse in wet conditions",
    ],
    treatments: [
      "Remove infected plants immediately",
      "Apply fungicides containing copper or chlorothalonil",
      "Apply organic fungicides as directed",
      "Improve air circulation around plants",
      "Harvest healthy fruit early if disease is detected",
    ],
    preventions: [
      "Plant resistant varieties",
      "Avoid overhead watering",
      "Space plants for good air circulation",
      "Remove volunteer tomato and potato plants",
      "Apply preventive fungicide during cool, wet weather",
    ],
    severity: "High",
    imageUrl: "/assets/diseases/late-blight.jpg",
  },
  {
    name: "Leaf Miner",
    scientificName: "Liriomyza spp.",
    description:
      "A pest that creates tunnels in leaves, causing damage and reducing photosynthesis. The adult is a small fly, but the damage is done by the larval stage that feeds between the upper and lower leaf surfaces, creating distinctive winding mines.",
    symptoms: [
      "Serpentine tunnels or tracks in leaves",
      "Wilting leaves in severe infestations",
      "Stunted growth in young plants",
      "Small black and yellow flies around plants",
      "Leaf drop in severe cases",
    ],
    treatments: [
      "Use insecticidal soap on affected areas",
      "Apply neem oil to leaves",
      "Introduce natural predators like parasitic wasps",
      "Remove and destroy severely infested leaves",
      "Apply appropriate systemic insecticides if necessary",
    ],
    preventions: [
      "Use row covers during peak insect seasons",
      "Monitor plants regularly for early detection",
      "Use yellow sticky traps to catch adult flies",
      "Maintain healthy plants that can withstand minor damage",
      "Practice crop rotation",
    ],
    severity: "Medium",
    imageUrl: "/assets/diseases/leaf-miner.jpg",
  },
  {
    name: "Leaf Mold",
    scientificName: "Cladosporium fulvum",
    description:
      "A fungal disease that thrives in humid conditions, affecting leaves primarily. It's particularly problematic in greenhouse environments or during periods of high humidity and moderate temperatures. The disease reduces photosynthesis and yield.",
    symptoms: [
      "Pale green to yellow spots on upper leaf surfaces",
      "Olive-green to grayish-brown mold on leaf undersides",
      "Leaf yellowing and eventual browning",
      "Premature leaf drop",
      "Reduced fruit size and yield",
    ],
    treatments: [
      "Improve air circulation around plants",
      "Reduce humidity in growing environment",
      "Apply fungicides containing chlorothalonil or copper",
      "Remove and destroy infected leaves",
      "Avoid overhead watering to keep foliage dry",
    ],
    preventions: [
      "Use resistant varieties",
      "Maintain proper spacing between plants",
      "Ensure good ventilation in greenhouses",
      "Keep humidity below 85% if possible",
      "Practice proper sanitation by removing crop debris",
    ],
    severity: "Medium",
    imageUrl: "/assets/diseases/leaf-mold.jpg",
  },
  {
    name: "Mosaic Virus",
    scientificName: "Tobacco mosaic virus",
    description:
      "A viral infection that causes mottled leaves and stunted growth. It's highly stable and contagious, spread primarily through mechanical means and can survive for years in dried plant material. Once a plant is infected, there is no cure.",
    symptoms: [
      "Mottled pattern of light and dark green on leaves",
      "Leaves may be curled, wrinkled, or smaller than normal",
      "Stunted plant growth",
      "Yellow streaking on leaves",
      "Reduced fruit production and quality",
    ],
    treatments: [
      "Remove and destroy infected plants completely",
      "Control aphids and other insects that spread the virus",
      "Wash hands and tools after handling infected plants",
      "Use milk or nonfat dry milk solution to protect healthy plants",
      "There is no cure once plants are infected",
    ],
    preventions: [
      "Plant resistant varieties",
      "Use certified disease-free seeds",
      "Disinfect tools with 70% alcohol or 10% bleach solution",
      "Wash hands before handling plants",
      "Control weeds that may harbor the virus",
    ],
    severity: "High",
    imageUrl: "/assets/diseases/mosaic-virus.jpg",
  },
  {
    name: "Septoria",
    scientificName: "Septoria lycopersici",
    description:
      "A fungal disease that causes leaf spots and can lead to defoliation. It primarily affects tomatoes and is most common during wet, humid weather. While it rarely kills plants, severe infections can reduce yields significantly.",
    symptoms: [
      "Small, circular spots with dark borders and gray centers",
      "Spots often have yellow halos around them",
      "Lower leaves affected first, progressing upward",
      "Tiny black fruiting bodies visible in the center of spots",
      "Severe defoliation in advanced cases",
    ],
    treatments: [
      "Remove infected leaves at first sign of disease",
      "Apply fungicides containing chlorothalonil or copper",
      "Ensure good air circulation around plants",
      "Apply organic fungicides like copper octanoate",
      "Maintain consistent watering schedule",
    ],
    preventions: [
      "Rotate crops (don't plant tomatoes in same spot for 3 years)",
      "Use mulch to prevent soil splash onto leaves",
      "Space plants properly for good air circulation",
      "Avoid overhead watering",
      "Remove and destroy plant debris at end of season",
    ],
    severity: "Medium",
    imageUrl: "/assets/diseases/septoria.jpg",
  },
  {
    name: "Spider Mites",
    scientificName: "Tetranychus spp.",
    description:
      "Tiny pests that suck sap from plants, leading to leaf discoloration and damage. They thrive in hot, dry conditions and can reproduce rapidly, leading to quick infestations. They create fine webbing on plant surfaces in severe cases.",
    symptoms: [
      "Tiny yellow or white speckles on leaves (stippling)",
      "Fine webbing on leaves and between plant parts",
      "Yellowing, bronzing, or browning of leaves",
      "Leaf drop in severe infestations",
      "Tiny moving dots visible with magnification",
    ],
    treatments: [
      "Spray plants with strong stream of water to dislodge mites",
      "Apply insecticidal soap or neem oil to affected areas",
      "Use miticides specifically labeled for spider mites",
      "Increase humidity around plants",
      "Introduce predatory mites as biological control",
    ],
    preventions: [
      "Maintain proper humidity (mites prefer dry conditions)",
      "Regularly inspect plants, especially during hot, dry weather",
      "Avoid drought stress in plants",
      "Use preventive applications of neem oil or insecticidal soap",
      "Keep plants healthy with proper nutrition",
    ],
    severity: "Medium",
    imageUrl: "/assets/diseases/spider-mites.jpg",
  },
  {
    name: "Yellow Leaf Curl Virus",
    scientificName: "Begomovirus",
    description:
      "A viral disease that causes yellowing and curling of leaves, often transmitted by whiteflies. It's one of the most devastating diseases of tomato worldwide. The virus can cause 100% crop loss if plants are infected when young.",
    symptoms: [
      "Upward curling and yellowing of leaves",
      "Leaves may be smaller and crumpled",
      "Stunted plant growth",
      "Flowers may drop before fruit development",
      "Severely reduced yield",
    ],
    treatments: [
      "Remove and destroy all infected plants",
      "Control whitefly populations with insecticidal soap or neem oil",
      "Use yellow sticky traps to monitor and reduce whitefly populations",
      "Use reflective mulches to repel whiteflies",
      "No cure exists once plants are infected",
    ],
    preventions: [
      "Plant resistant varieties",
      "Use insect netting or row covers",
      "Maintain weed-free area around plants",
      "Avoid planting during peak whitefly season",
      "Use trap crops to divert whiteflies",
    ],
    severity: "High",
    imageUrl: "/assets/diseases/yellow-leaf-curl.jpg",
  },
  {
    name: "Healthy",
    scientificName: "N/A",
    description:
      "Plant shows no signs of disease or pest infestation. Healthy plants have vibrant green leaves, strong stems, and normal growth patterns. They produce flowers and fruit according to their variety's characteristics.",
    symptoms: [
      "Vibrant green leaves",
      "Normal growth pattern for the variety",
      "No visible damage or discoloration",
      "Healthy root system if examined",
      "Normal flowering and fruiting",
    ],
    treatments: [
      "Regular watering according to plant needs",
      "Proper fertilization schedule",
      "Routine maintenance like pruning when needed",
      "Regular monitoring for early disease detection",
      "Preventive measures against common diseases",
    ],
    preventions: [
      "Proper plant spacing for air circulation",
      "Appropriate watering practices",
      "Regular soil testing and amendment",
      "Crop rotation in vegetable gardens",
      "Use of disease-resistant varieties",
    ],
    severity: "Low",
    imageUrl: "/assets/diseases/healthy.jpg",
  },
];

/**
 * Creates the assets directory if it doesn't exist
 * @returns {Promise<boolean>} Whether the directory exists or was created
 */
async function ensureAssetsDirectory() {
  const assetsDir = path.join(__dirname, "..", "assets", "diseases");

  try {
    await fs.mkdir(assetsDir, { recursive: true });
    logMessage("info", `Assets directory confirmed at: ${assetsDir}`);
    return true;
  } catch (err) {
    logMessage("error", `Failed to create assets directory: ${assetsDir}`, err);
    return false;
  }
}

/**
 * Checks if MongoDB is connected
 * @returns {boolean} Connection status
 */
function isMongoConnected() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

/**
 * Seeds the database with disease data
 * @param {Object} options - Seeding options
 * @param {boolean} options.force - Whether to force seeding even if data exists
 * @param {boolean} options.verbose - Whether to log detailed information
 * @returns {Promise<{success: boolean, count: number, errors: Array}>}
 */
async function seedDatabase(options = {}) {
  const { force = false, verbose = true } = options;

  // Result object to track operation
  const result = {
    success: false,
    count: 0,
    errors: [],
  };

  try {
    // Check MongoDB connection
    if (!isMongoConnected()) {
      throw new Error(
        "MongoDB is not connected. Check your database connection."
      );
    }

    // Ensure assets directory exists
    await ensureAssetsDirectory();

    // Check if diseases already exist in the database
    const existingCount = await Disease.countDocuments();

    if (existingCount > 0 && !force) {
      logMessage(
        "warning",
        `Database already contains ${existingCount} disease records.`
      );
      logMessage(
        "info",
        "Use { force: true } option to override existing data."
      );
      result.success = true;
      result.count = existingCount;
      return result;
    }

    // If forced or no existing data, proceed with seeding
    if (force && existingCount > 0) {
      logMessage(
        "info",
        `Removing ${existingCount} existing disease records...`
      );
      await Disease.deleteMany({});
    }

    // Insert disease data
    logMessage(
      "info",
      `Seeding database with ${diseaseData.length} disease records...`
    );

    // Process each disease entry
    for (const disease of diseaseData) {
      try {
        if (verbose) {
          logMessage("info", `Adding disease: ${disease.name}`);
        }

        await Disease.create(disease);
        result.count++;
      } catch (err) {
        logMessage("error", `Failed to add disease: ${disease.name}`, err);
        result.errors.push({
          disease: disease.name,
          error: err.message,
        });
      }
    }

    // Log results
    if (result.errors.length === 0) {
      logMessage(
        "success",
        `Database seeded successfully with ${result.count} disease records!`
      );
      result.success = true;
    } else {
      logMessage(
        "warning",
        `Seeding completed with ${result.errors.length} errors. Added ${result.count} of ${diseaseData.length} records.`
      );
      result.success = result.count > 0;
    }

    return result;
  } catch (error) {
    logMessage("error", "Error seeding database", error);
    result.errors.push({
      phase: "initialization",
      error: error.message,
    });
    return result;
  }
}

// Export the seeding function
module.exports = seedDatabase;
