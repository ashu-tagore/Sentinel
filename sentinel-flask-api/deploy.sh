#!/bin/bash

# Script to set up and deploy the Flask API for Sentinel

# Make script exit on first error
set -e

# Set current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "Sentinel Flask API Deployment"
echo "======================================"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3 and try again."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "pip3 is not installed. Please install pip and try again."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing dependencies..."
pip install -r requirements.txt

# Create necessary directories
echo "Creating model directories..."
mkdir -p models/yolov5
mkdir -p models/yolov7
mkdir -p uploads

# Check for model files
echo "Checking for model files..."
if [ ! -f "models/yolov5/saved_model.pb" ]; then
    echo "⚠️ YOLOv5 model files not found in models/yolov5/"
    echo "Please place your YOLOv5 model files in this directory before running the API."
fi

if [ ! -f "models/yolov7/saved_model.pb" ]; then
    echo "⚠️ YOLOv7 model files not found in models/yolov7/"
    echo "Please place your YOLOv7 model files in this directory before running the API."
fi

# Ask if user wants to start the API now
read -p "Do you want to start the Flask API now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting Flask API..."
    # Check for production flag
    if [[ "$1" == "--prod" ]]; then
        echo "Starting in production mode with Gunicorn..."
        # If gunicorn is not installed, install it
        if ! command -v gunicorn &> /dev/null; then
            pip install gunicorn
        fi
        gunicorn -w 4 -b 0.0.0.0:5000 app:app
    else
        echo "Starting in development mode..."
        python app.py
    fi
else
    echo "To start the API later, run:"
    echo "source venv/bin/activate && python app.py"
    echo "Or for production:"
    echo "source venv/bin/activate && gunicorn -w 4 -b 0.0.0.0:5000 app:app"
fi

echo "======================================"
echo "Setup completed!"
echo "======================================"