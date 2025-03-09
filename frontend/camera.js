// Get DOM elements
const video = document.getElementById("camera-stream");
const switchButton = document.getElementById("switch-camera");
const fullscreenButton = document.getElementById("fullscreen");

// Add capture button with improved styling
const captureButton = document.createElement("button");
captureButton.id = "capture";
captureButton.textContent = "Analyze Plant";
captureButton.style.backgroundColor = "#4CAF50";
captureButton.style.fontWeight = "bold";
document.querySelector(".camera-controls").appendChild(captureButton);

// Track current camera mode (front/back)
let currentFacingMode = "environment"; // Start with back camera
let currentStream = null; // Track the current stream for proper cleanup

// Define camera constraints with fallback options
const getConstraints = () => ({
  video: {
    facingMode: currentFacingMode,
    width: { ideal: window.innerWidth },
    height: { ideal: window.innerHeight },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: false,
});

// Function to handle API errors with more informative messages
const handleApiError = (error) => {
  let errorMessage = "Camera error: ";

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    errorMessage +=
      "Camera access was denied. Please check your browser permissions.";
  } else if (
    error.name === "NotFoundError" ||
    error.name === "DevicesNotFoundError"
  ) {
    errorMessage +=
      "No camera found on this device, or the camera is already in use.";
  } else if (
    error.name === "NotReadableError" ||
    error.name === "TrackStartError"
  ) {
    errorMessage +=
      "Could not access your camera. It may be in use by another application.";
  } else if (error.name === "OverconstrainedError") {
    errorMessage +=
      "Camera doesn't support the requested settings. Trying simpler settings.";
    // Try again with simpler constraints
    startCamera({ video: true });
    return;
  } else {
    errorMessage += error.message || "Unknown camera error occurred.";
  }

  showErrorMessage(errorMessage);
};

// Show error message with overlay
const showErrorMessage = (message) => {
  const overlay = document.createElement("div");
  overlay.className = "results-overlay";
  overlay.innerHTML = `
    <div class="results-container">
      <h2>Camera Error</h2>
      <p>${message}</p>
      <button id="dismissError">Dismiss</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById("dismissError").addEventListener("click", () => {
    overlay.remove();
  });
};

// Function to send image to backend with improved error handling
async function sendImageToBackend(imageData) {
  let loadingOverlay = null;

  try {
    // Show loading overlay with better styling
    loadingOverlay = document.createElement("div");
    loadingOverlay.className = "results-overlay";
    loadingOverlay.innerHTML = `
      <div class="results-container">
        <h2>Analyzing Image...</h2>
        <p>Please wait while we process your plant image</p>
        <div class="loading-spinner"></div>
        <button id="cancelAnalysis">Cancel</button>
      </div>
    `;
    document.body.appendChild(loadingOverlay);

    // Add spinner style dynamically
    const style = document.createElement("style");
    style.innerHTML = `
      .loading-spinner {
        width: 40px;
        height: 40px;
        margin: 20px auto;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #fff;
        animation: spin 1s ease-in-out infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Add cancel button functionality with AbortController
    const controller = new AbortController();
    document.getElementById("cancelAnalysis").addEventListener("click", () => {
      loadingOverlay.remove();
      controller.abort();
    });

    // Create form data
    const formData = new FormData();
    const blob = await fetch(imageData).then((res) => res.blob());
    formData.append("image", blob, "plant-image.jpg");

    // Add timeout to request
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Check if we're running on a local server or production
    const baseUrl =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000"
        : "";

    const response = await fetch(`${baseUrl}/api/detection/analyze`, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `Server responded with status: ${response.status}`
      );
    }

    const result = await response.json();

    if (loadingOverlay) {
      loadingOverlay.remove();
    }

    if (result.success) {
      showResults(result.data);
    } else {
      throw new Error(
        result.message || "Analysis failed without specific error"
      );
    }
  } catch (error) {
    if (loadingOverlay) {
      loadingOverlay.remove();
    }

    if (error.name === "AbortError") {
      console.log("Request was cancelled by user");
    } else {
      showErrorMessage(
        `Analysis failed: ${error.message || "Unknown error occurred"}`
      );
      console.error("Analysis error:", error);
    }
  }
}

// Improved function to display results with enhanced UI
function showResults(data) {
  const existingOverlay = document.querySelector(".results-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const overlay = document.createElement("div");
  overlay.className = "results-overlay";

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      e.stopPropagation();
    }
  });

  // Format confidence as percentage and add color coding
  const confidence = (data.analysis.confidence * 100).toFixed(1);
  let confidenceClass = "low-confidence";

  if (confidence > 80) {
    confidenceClass = "high-confidence";
  } else if (confidence > 50) {
    confidenceClass = "medium-confidence";
  }

  // Add styling for confidence indicators
  const style = document.createElement("style");
  style.innerHTML = `
    .high-confidence { color: #4CAF50; font-weight: bold; }
    .medium-confidence { color: #FFC107; font-weight: bold; }
    .low-confidence { color: #F44336; font-weight: bold; }
    
    .results-container {
      background-color: #222;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.5);
      max-width: 90%;
      width: 500px;
    }
    
    .recommendations ul li {
      padding: 10px 0;
      border-bottom: 1px solid #333;
    }
    
    .action-buttons {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
    }
    
    .action-buttons button {
      flex: 1;
      margin: 0 5px;
    }
  `;
  document.head.appendChild(style);

  overlay.innerHTML = `
    <div class="results-container">
      <h2>Analysis Results</h2>
      <p>Disease: <strong>${data.analysis.disease || "Unknown"}</strong></p>
      <p>Confidence: <span class="${confidenceClass}">${confidence}%</span></p>
      <div class="recommendations">
        <h3>Recommendations:</h3>
        <ul>
          ${data.analysis.recommendations
            .map((rec) => `<li>${rec}</li>`)
            .join("")}
        </ul>
      </div>
      <div class="action-buttons">
        <button id="captureNew">Capture New</button>
        <button id="closeResults">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Add event listeners for buttons
  document.getElementById("closeResults").addEventListener("click", () => {
    overlay.remove();
  });

  document.getElementById("captureNew").addEventListener("click", () => {
    overlay.remove();
  });
}

// Initialize and start camera with improved error handling
async function startCamera(customConstraints = null) {
  try {
    // First stop any existing stream
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    video.style.opacity = "0";
    const constraints = customConstraints || getConstraints();

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.style.opacity = "1";
      video.play();
    };
  } catch (error) {
    console.error("Error accessing camera:", error);
    handleApiError(error);
  }
}

// Event Listeners with improved handling
switchButton.addEventListener("click", async () => {
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  try {
    await startCamera();
  } catch (error) {
    console.error("Error switching camera:", error);
    showErrorMessage("Failed to switch camera. Please try again.");
  }
});

fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
      showErrorMessage(
        "Fullscreen mode is not supported on this device/browser"
      );
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

captureButton.addEventListener("click", async () => {
  try {
    // Visual feedback on button press
    captureButton.style.backgroundColor = "#367c39";
    setTimeout(() => {
      captureButton.style.backgroundColor = "#4CAF50";
    }, 200);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const imageData = canvas.toDataURL("image/jpeg", 0.9); // Add quality parameter
    await sendImageToBackend(imageData);
  } catch (error) {
    console.error("Capture error:", error);
    showErrorMessage("Failed to capture image. Please try again.");
  }
});

// Add window resize handler to adjust video dimensions
window.addEventListener("resize", () => {
  if (currentStream) {
    // No need to restart the camera, just update CSS
    video.style.width = "100vw";
    video.style.height = "100vh";
  }
});

// Check camera support and permissions on page load
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  startCamera();
} else {
  showErrorMessage("Camera access is not supported by this browser.");
}

// Add a connection status indicator to show if the backend is available
async function checkBackendConnection() {
  try {
    const response = await fetch("http://localhost:3000/api/detection/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      mode: "no-cors", // This prevents CORS issues during the check
    });

    // We won't get a real response with no-cors, so if it doesn't throw, assume success
    return true;
  } catch (error) {
    console.log("Backend connection check failed:", error);
    return false;
  }
}

// Create status indicator
const statusIndicator = document.createElement("div");
statusIndicator.id = "connection-status";
statusIndicator.style.position = "fixed";
statusIndicator.style.top = "10px";
statusIndicator.style.right = "10px";
statusIndicator.style.width = "12px";
statusIndicator.style.height = "12px";
statusIndicator.style.borderRadius = "50%";
statusIndicator.style.backgroundColor = "#FFC107"; // Yellow initially
document.body.appendChild(statusIndicator);

// Check connection and update indicator
(async function updateConnectionStatus() {
  const isConnected = await checkBackendConnection();
  statusIndicator.style.backgroundColor = isConnected ? "#4CAF50" : "#F44336"; // Green if connected, red otherwise
  setTimeout(updateConnectionStatus, 30000); // Check every 30 seconds
})();
