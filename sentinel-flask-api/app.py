import os
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

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

# Global variables to store the models
yolov5_model = None
yolov7_model = None

# Disease labels
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

# Recommendations for each disease
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
    """Load both YOLOv5 and YOLOv7 models using PyTorch"""
    global yolov5_model, yolov7_model
    
    # Set device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"Using device: {device}")
    
    try:
        logger.info("Loading YOLOv5 model...")
        yolov5_path = os.path.join('models', 'yolov5', 'modelv5.pt')
        if os.path.exists(yolov5_path):
            # Load YOLOv5 model
            yolov5_model = torch.load(yolov5_path, map_location=device)
            yolov5_model.eval()
            logger.info("YOLOv5 model loaded successfully")
        else:
            logger.warning(f"YOLOv5 model file not found at {yolov5_path}")
    except Exception as e:
        logger.error(f"Error loading YOLOv5 model: {str(e)}")
        
    try:
        logger.info("Loading YOLOv7 model...")
        yolov7_path = os.path.join('models', 'yolov7', 'modelv7.pt')
        if os.path.exists(yolov7_path):
            # Load YOLOv7 model
            yolov7_model = torch.load(yolov7_path, map_location=device)
            yolov7_model.eval()
            logger.info("YOLOv7 model loaded successfully")
        else:
            logger.warning(f"YOLOv7 model file not found at {yolov7_path}")
    except Exception as e:
        logger.error(f"Error loading YOLOv7 model: {str(e)}")

def preprocess_image(image_path=None, image_data=None):
    """Preprocess image for model input"""
    try:
        if image_path:
            img = Image.open(image_path)
        elif image_data:
            img = Image.open(io.BytesIO(image_data))
        else:
            raise ValueError("Either image_path or image_data must be provided")
            
        # Resize to 640x640
        img = img.resize((640, 640))
        
        # Convert to numpy array and normalize
        img_array = np.array(img) / 255.0
        
        # Convert to PyTorch tensor
        img_tensor = torch.from_numpy(img_array).float()
        
        # Rearrange dimensions to [batch_size, channels, height, width]
        if len(img_tensor.shape) == 3:
            img_tensor = img_tensor.permute(2, 0, 1)  # HWC to CHW
        img_tensor = img_tensor.unsqueeze(0)  # Add batch dimension
        
        return img_tensor
    except Exception as e:
        logger.error(f"Image preprocessing error: {str(e)}")
        raise

def run_inference(model, img_tensor):
    """Run inference using the PyTorch model"""
    if not model:
        raise ValueError("Model not loaded")
        
    device = next(model.parameters()).device
    img_tensor = img_tensor.to(device)
    
    try:
        # Run inference
        start_time = time.time()
        with torch.no_grad():
            if hasattr(model, 'forward'):
                output = model(img_tensor)
            else:
                # For YOLOv5/YOLOv7 models that might return detection results
                output = model(img_tensor)
                if isinstance(output, tuple) and len(output) > 0:
                    output = output[0]  # Take first output for YOLOv7
        
        # This is a simplified approach - actual structure will depend on your model
        # If your model's output format is different, you'll need to adjust this
        inference_time = time.time() - start_time
        logger.info(f"Inference completed in {inference_time:.2f} seconds")
        
        # If the model outputs classification probabilities directly
        if hasattr(output, 'softmax'):
            probs = output.softmax(dim=1)[0]
        else:
            # If you're using detection models, take the classification scores
            # This part might need adjustment based on your model's output format
            probs = torch.softmax(output[0], dim=0)
        
        # Get the class with highest probability
        class_idx = torch.argmax(probs).item()
        confidence = float(probs[class_idx].item())
        disease_name = label_map.get(class_idx, "Unknown")
        
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
        "message": "Sentinel Plant Disease Detection API (Flask with PyTorch)",
        "version": "1.0.0",
        "endpoints": {
            "analyze": "/analyze",
            "stream": "/stream",
            "health": "/health"
        }
    })

@app.route('/health')
def health_check():
    """Check if models are loaded and API is functioning"""
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
    """Process uploaded image file"""
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
        
        # Run inference with both models
        results = {}
        
        try:
            if yolov5_model:
                results['yolov5Analysis'] = run_inference(yolov5_model, image_tensor)
            else:
                results['yolov5Analysis'] = {
                    "error": "YOLOv5 model not loaded"
                }
        except Exception as e:
            logger.error(f"YOLOv5 inference error: {str(e)}")
            results['yolov5Analysis'] = {
                "error": f"YOLOv5 inference failed: {str(e)}"
            }
            
        try:
            if yolov7_model:
                results['yolov7Analysis'] = run_inference(yolov7_model, image_tensor)
            else:
                results['yolov7Analysis'] = {
                    "error": "YOLOv7 model not loaded"
                }
        except Exception as e:
            logger.error(f"YOLOv7 inference error: {str(e)}")
            results['yolov7Analysis'] = {
                "error": f"YOLOv7 inference failed: {str(e)}"
            }
        
        # Determine which model has higher confidence for primary result
        if 'error' not in results.get('yolov5Analysis', {}) and 'error' not in results.get('yolov7Analysis', {}):
            yolov5_confidence = results['yolov5Analysis']['confidence']
            yolov7_confidence = results['yolov7Analysis']['confidence']
            
            if yolov5_confidence > yolov7_confidence:
                results['analysis'] = {
                    **results['yolov5Analysis'],
                    "model": "YOLOv5"
                }
            else:
                results['analysis'] = {
                    **results['yolov7Analysis'],
                    "model": "YOLOv7"
                }
        elif 'error' not in results.get('yolov5Analysis', {}):
            results['analysis'] = {
                **results['yolov5Analysis'],
                "model": "YOLOv5"
            }
        elif 'error' not in results.get('yolov7Analysis', {}):
            results['analysis'] = {
                **results['yolov7Analysis'],
                "model": "YOLOv7"
            }
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
        return jsonify({
            "success": False,
            "message": f"Error processing image: {str(e)}"
        }), 500

@app.route('/stream', methods=['POST'])
def process_stream():
    """Process image data from camera stream"""
    try:
        data = request.get_json()
        
        if not data or 'imageData' not in data:
            return jsonify({
                "success": False,
                "message": "No image data provided"
            }), 400
            
        # Extract base64 data
        image_data = data['imageData']
        if image_data.startswith('data:image'):
            # Remove the data URL prefix
            image_data = image_data.split(',')[1]
            
        # Decode base64 to binary
        image_binary = base64.b64decode(image_data)
        
        # Preprocess the image
        try:
            image_tensor = preprocess_image(image_data=image_binary)
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Error preprocessing image: {str(e)}"
            }), 500
        
        # Run inference with both models
        results = {}
        
        try:
            if yolov5_model:
                results['yolov5Prediction'] = run_inference(yolov5_model, image_tensor)
            else:
                results['yolov5Prediction'] = {
                    "error": "YOLOv5 model not loaded"
                }
        except Exception as e:
            logger.error(f"YOLOv5 inference error: {str(e)}")
            results['yolov5Prediction'] = {
                "error": f"YOLOv5 inference failed: {str(e)}"
            }
            
        try:
            if yolov7_model:
                results['yolov7Prediction'] = run_inference(yolov7_model, image_tensor)
            else:
                results['yolov7Prediction'] = {
                    "error": "YOLOv7 model not loaded"
                }
        except Exception as e:
            logger.error(f"YOLOv7 inference error: {str(e)}")
            results['yolov7Prediction'] = {
                "error": f"YOLOv7 inference failed: {str(e)}"
            }
        
        # Determine which model has higher confidence for primary result
        if 'error' not in results.get('yolov5Prediction', {}) and 'error' not in results.get('yolov7Prediction', {}):
            yolov5_confidence = results['yolov5Prediction']['confidence']
            yolov7_confidence = results['yolov7Prediction']['confidence']
            
            if yolov5_confidence > yolov7_confidence:
                results['analysis'] = {
                    **results['yolov5Prediction'],
                    "model": "YOLOv5"
                }
            else:
                results['analysis'] = {
                    **results['yolov7Prediction'],
                    "model": "YOLOv7"
                }
        elif 'error' not in results.get('yolov5Prediction', {}):
            results['analysis'] = {
                **results['yolov5Prediction'],
                "model": "YOLOv5"
            }
        elif 'error' not in results.get('yolov7Prediction', {}):
            results['analysis'] = {
                **results['yolov7Prediction'],
                "model": "YOLOv7"
            }
        else:
            return jsonify({
                "success": False,
                "message": "Both models failed to process the image",
                "data": results
            }), 500
            
        return jsonify({
            "success": True,
            "data": results
        })
    
    except Exception as e:
        logger.error(f"Error processing stream: {str(e)}")
        return jsonify({
            "success": False,
            "message": f"Error in stream processing: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Create folders if they don't exist
    os.makedirs('models/yolov5', exist_ok=True)
    os.makedirs('models/yolov7', exist_ok=True)
    
    # Load models on startup
    load_models()
    
    # Run the app
    app.run(host='0.0.0.0', port=5000, debug=True)