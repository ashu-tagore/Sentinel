    @echo off
setlocal enabledelayedexpansion

echo ======================================
echo Sentinel Flask API Deployment
echo ======================================

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Python is not installed. Please install Python 3 and try again.
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install requirements
echo Installing dependencies...
pip install -r requirements.txt

REM Create necessary directories
echo Creating model directories...
if not exist models\yolov5 mkdir models\yolov5
if not exist models\yolov7 mkdir models\yolov7
if not exist uploads mkdir uploads

REM Check for model files
echo Checking for model files...
if not exist models\yolov5\saved_model.pb (
    echo WARNING: YOLOv5 model files not found in models\yolov5\
    echo Please place your YOLOv5 model files in this directory before running the API.
)

if not exist models\yolov7\saved_model.pb (
    echo WARNING: YOLOv7 model files not found in models\yolov7\
    echo Please place your YOLOv7 model files in this directory before running the API.
)

REM Ask if user wants to start the API now
set /p start_now="Do you want to start the Flask API now? (y/n): "
if /i "%start_now%"=="y" (
    echo Starting Flask API...
    REM Check for production flag
    if "%1"=="--prod" (
        echo Starting in production mode with waitress...
        REM If waitress is not installed, install it
        pip install waitress
        python -m waitress --host=0.0.0.0 --port=5000 app:app
    ) else (
        echo Starting in development mode...
        python app.py
    )
) else (
    echo To start the API later, run:
    echo venv\Scripts\activate.bat ^&^& python app.py
    echo Or for production:
    echo venv\Scripts\activate.bat ^&^& python -m waitress --host=0.0.0.0 --port=5000 app:app
)

echo ======================================
echo Setup completed!
echo ======================================

pause