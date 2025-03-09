import os
import sys
import io
import base64
import time
import logging
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import torch

import pathlib
temp = pathlib.PosixPath
pathlib.PosixPath = pathlib.WindowsPath

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.after_request
def add_cors_headers(response):
    response.headers.add("Access-Control-Allow-Credentials", "true")
    return response

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

# Global variables to store the models
yolov5_model = None
yolov7_model = None  # Leave this if you plan to use it later

# Disease labels (adjust these indices to match your training)
label_map = {
    0: "Early Blight",
    1: "Healthy",
    2: "Late Blight",
    3: "Leaf Miner",
    4: "Leaf Mold",
    5: "Mosaic Virus",
    6: "Septoria",
    7: "Spider Mites",
    8: "Yellow Leaf Curl Virus",
}


def get_recommendations(disease_name):
    recommendations = {
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
        "Septoria": [
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
        "Healthy": [
            "Continue regular maintenance",
            "Monitor plants regularly for early signs of disease",
            "Maintain proper watering and fertilization schedule",
            "Ensure good air circulation around plants",
        ],
    }
    return recommendations.get(disease_name, [
        "Consult with a plant pathologist for specific recommendations",
        "Monitor the plant closely for changes in symptoms",
        "Ensure proper growing conditions (light, water, nutrients)",
    ])


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def load_models():
    """Load YOLOv5 (and optionally YOLOv7) models."""
    global yolov5_model, yolov7_model

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"Using device: {device}")

    # Load YOLOv5 using YOLOv5's attempt_load
    try:
        sys.path.insert(0, os.path.join(os.getcwd(), 'yolov5'))
        from yolov5.models.experimental import attempt_load
        logger.info("Loading YOLOv5 model...")
        yolov5_path = os.path.join('model', 'yolov', 'modelv5.pt')
        if os.path.exists(yolov5_path):
            yolov5_model = attempt_load(yolov5_path)
            yolov5_model.eval()
            logger.info("YOLOv5 model loaded successfully")
        else:
            logger.warning(f"YOLOv5 model file not found at {yolov5_path}")
    except Exception as e:
        logger.error(f"Error loading YOLOv5 model: {str(e)}")

    # YOLOv7 loading (if needed; otherwise you can remove this block)
    try:
        # import numpy.core.multiarray
        # sys.path.insert(0, os.path.join(os.getcwd(), 'yolov7'))
        # from yolov7.models.experimental import attempt_load as attempt_load_yolov7
        logger.info("Loading YOLOv7 model...")
        yolov7_path = os.path.join('model', 'yolov7', 'modelv7.pt')
        if os.path.exists(yolov7_path):
            # If you plan to use YOLOv7, ensure its repository is cloned and accessible.
            # with torch.serialization.safe_globals([numpy.core.multiarray._reconstruct]):
            #     yolov7_model = attempt_load_yolov7(yolov7_path)
            # # yolov7_model = torch.load(yolov7_path, map_location=device, weights_only=False)
            # yolov7_model.eval()
            logger.info("YOLOv7 model loaded successfully")
        else:
            logger.warning(f"YOLOv7 model file not found at {yolov7_path}")
    except Exception as e:
        logger.error(f"Error loading YOLOv7 model: {str(e)}")


def preprocess_image(image_path=None, image_data=None):
    """Preprocess image for inference (resize and convert to tensor)."""
    try:
        if image_path:
            img = Image.open(image_path)
        elif image_data:
            img = Image.open(io.BytesIO(image_data))
        else:
            raise ValueError("Either image_path or image_data must be provided")

        # Resize to 640x640 (YOLOv5 default)
        img = img.resize((640, 640))
        # Convert image to numpy array
        img_array = np.array(img)
        # If image is not 3-channel, convert to RGB
        if img_array.ndim == 2 or img_array.shape[2] != 3:
            img = img.convert("RGB")
            img_array = np.array(img)
        # Convert to tensor (note: YOLOv5 models usually expect a numpy array)
        img_tensor = torch.from_numpy(img_array).float()
        # Rearrange dimensions to [batch_size, channels, height, width]
        if len(img_tensor.shape) == 3:
            img_tensor = img_tensor.permute(2, 0, 1)
        img_tensor = img_tensor.unsqueeze(0)  # Add batch dimension
        return img_tensor
    except Exception as e:
        logger.error(f"Image preprocessing error: {str(e)}")
        raise


def run_inference(model, img_tensor):
    """
    Run inference using the YOLOv5 detection model.
    Assumes model output shape is [1, 25200, 14]:
      - Columns 0-3: Bounding box coordinates
      - Column 4: Objectness confidence
      - Columns 5-13: Class scores (for 9 classes)
    """
    if not model:
        raise ValueError("Model not loaded")

    device = next(model.parameters()).device
    img_tensor = img_tensor.to(device)

    try:
        with torch.no_grad():
            predictions = model(img_tensor)[0]  # shape: [1, 25200, 14]

        # Check if any predictions were made
        if predictions.shape[1] == 0:
            raise ValueError("No detections were made.")

        # Remove the batch dimension: shape becomes [25200, 14]
        predictions = predictions[0]

        # Extract objectness scores and class scores
        obj_conf = predictions[:, 4]            # Shape: [25200]
        class_scores = predictions[:, 5:]         # Shape: [25200, 9]

        # Compute final scores by multiplying objectness with class scores
        # This gives a score for each candidate for each class
        final_scores = obj_conf.unsqueeze(1) * class_scores  # Shape: [25200, 9]

        # For each candidate, find the best class and its score
        max_scores, class_indices = torch.max(final_scores, dim=1)  # Each is [25200]

        # Get the candidate with the highest final score across all predictions
        best_score, best_index = torch.max(max_scores, dim=0)
        best_class = int(class_indices[best_index].item())
        confidence = float(best_score.item())

        # Lookup disease name based on class index
        disease_name = label_map.get(best_class, "Unknown")
        logger.info(f"Detection: {disease_name} with confidence {confidence:.2f}")

        return {
            "disease": disease_name,
            "confidence": confidence,
            "recommendations": get_recommendations(disease_name)
        }
    except Exception as e:
        logger.error(f"Inference error: {str(e)}")
        raise ValueError(f"Error during inference: {str(e)}")

@app.route('/')
def index():
    return jsonify({
        "message": "Sentinel Plant Disease Detection API (Flask with YOLOv5)",
        "version": "1.0.0",
        "endpoints": {
            "analyze": "/analyze",
            "stream": "/stream",
            "health": "/health"
        }
    })


@app.route('/health')
def health_check():
    """Check if models are loaded and API is functioning."""
    status = {
        "status": "operational",
        "models": {
            "yolov5": yolov5_model is not None,
            "yolov7": yolov7_model is not None
        }
    }
    return jsonify(status)


@app.route('/analyze', methods=['POST'])
def analyze_image():
    """Process uploaded image file."""
    try:
        if 'image' not in request.files:
            return jsonify({
                "success": False,
                "message": "No image file uploaded"
            }), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({
                "success": False,
                "message": "No file selected"
            }), 400
        if not allowed_file(file.filename):
            return jsonify({
                "success": False,
                "message": "File type not allowed. Please upload an image (png, jpg, jpeg)"
            }), 400

        # Save the file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Preprocess the image
        try:
            image_tensor = preprocess_image(image_path=filepath)
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Error preprocessing image: {str(e)}"
            }), 500

        # Run inference with YOLOv5
        results = {}
        try:
            if yolov5_model:
                results['yolov5Analysis'] = run_inference(yolov5_model, image_tensor)
            else:
                results['yolov5Analysis'] = {"error": "YOLOv5 model not loaded"}
        except Exception as e:
            logger.error(f"YOLOv5 inference error: {str(e)}")
            results['yolov5Analysis'] = {"error": f"YOLOv5 inference failed: {str(e)}"}

        # (Optional) YOLOv7 inference block if available...
        try:
            if yolov7_model:
                results['yolov7Analysis'] = run_inference(yolov7_model, image_tensor)
            else:
                results['yolov7Analysis'] = {"error": "YOLOv7 model not loaded"}
        except Exception as e:
            logger.error(f"YOLOv7 inference error: {str(e)}")
            results['yolov7Analysis'] = {"error": f"YOLOv7 inference failed: {str(e)}"}

        # Decide which analysis to report (based on higher confidence)
        if ('error' not in results.get('yolov5Analysis', {})) and ('error' not in results.get('yolov7Analysis', {})):
            if results['yolov5Analysis']['confidence'] > results['yolov7Analysis']['confidence']:
                results['analysis'] = {**results['yolov5Analysis'], "model": "YOLOv5"}
            else:
                results['analysis'] = {**results['yolov7Analysis'], "model": "YOLOv7"}
        elif 'error' not in results.get('yolov5Analysis', {}):
            results['analysis'] = {**results['yolov5Analysis'], "model": "YOLOv5"}
        elif 'error' not in results.get('yolov7Analysis', {}):
            results['analysis'] = {**results['yolov7Analysis'], "model": "YOLOv7"}
        else:
            return jsonify({
                "success": False,
                "message": "Both models failed to process the image",
                "data": results
            }), 500

        # Remove the file after processing
        try:
            os.remove(filepath)
        except Exception as e:
            logger.warning(f"Error removing temporary file: {str(e)}")

        return jsonify({
            "success": True,
            "data": results,
            "filename": filename
        })

    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        return jsonify({"success": False, "message": f"Error processing image: {str(e)}"}), 500


@app.route('/stream', methods=['POST'])
def process_stream():
    """Process image data from camera stream (base64)."""
    try:
        data = request.get_json()
        if not data or 'imageData' not in data:
            return jsonify({"success": False, "message": "No image data provided"}), 400

        image_data = data['imageData']
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        image_binary = base64.b64decode(image_data)

        # Preprocess the image from raw bytes
        try:
            image_tensor = preprocess_image(image_data=image_binary)
        except Exception as e:
            return jsonify({"success": False, "message": f"Error preprocessing image: {str(e)}"}), 500

        # Run inference with YOLOv5
        results = {}
        try:
            if yolov5_model:
                results['yolov5Prediction'] = run_inference(yolov5_model, image_tensor)
            else:
                results['yolov5Prediction'] = {"error": "YOLOv5 model not loaded"}
        except Exception as e:
            logger.error(f"YOLOv5 inference error: {str(e)}")
            results['yolov5Prediction'] = {"error": f"YOLOv5 inference failed: {str(e)}"}

        # YOLOv7 (optional)
        try:
            if yolov7_model:
                results['yolov7Prediction'] = run_inference(yolov7_model, image_tensor)
            else:
                results['yolov7Prediction'] = {"error": "YOLOv7 model not loaded"}
        except Exception as e:
            logger.error(f"YOLOv7 inference error: {str(e)}")
            results['yolov7Prediction'] = {"error": f"YOLOv7 inference failed: {str(e)}"}

        # Determine final analysis based on higher confidence
        if ('error' not in results.get('yolov5Prediction', {})) and (
                'error' not in results.get('yolov7Prediction', {})):
            if results['yolov5Prediction']['confidence'] > results['yolov7Prediction']['confidence']:
                results['analysis'] = {**results['yolov5Prediction'], "model": "YOLOv5"}
            else:
                results['analysis'] = {**results['yolov7Prediction'], "model": "YOLOv7"}
        elif 'error' not in results.get('yolov5Prediction', {}):
            results['analysis'] = {**results['yolov5Prediction'], "model": "YOLOv5"}
        elif 'error' not in results.get('yolov7Prediction', {}):
            results['analysis'] = {**results['yolov7Prediction'], "model": "YOLOv7"}
        else:
            return jsonify({
                "success": False,
                "message": "Both models failed to process the image",
                "data": results
            }), 500

        return jsonify({"success": True, "data": results})

    except Exception as e:
        logger.error(f"Error processing stream: {str(e)}")
        return jsonify({"success": False, "message": f"Error in stream processing: {str(e)}"}), 500


if __name__ == '__main__':
    # Load models on startup
    load_models()
    # Run the app
    app.run(host='0.0.0.0', port=5000, debug=True)
