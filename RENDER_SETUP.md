# Render Deployment Setup

## Requirements for Render

This application requires both Node.js and Python to run properly:
- **Node.js**: Main server and API handling
- **Python**: Hebrew Word document generation with perfect RTL alignment

## Files for Render Setup

### 1. `build.sh`
Build script that installs both Node.js and Python dependencies.

### 2. `requirements.txt`
Python dependencies:
- `python-docx==0.8.11` - For Hebrew Word document creation

### 3. `.buildpacks` (Optional)
Specifies both Node.js and Python buildpacks for Render.

### 4. `render.yaml` (Optional)
Configuration file for Render deployment.

## Environment Variables Required

Make sure these are set in your Render dashboard:

- `GEMINI_API_KEY` - Your Google Gemini API key
- `EMAIL_USER` - Gmail address for sending documents
- `EMAIL_PASS` - Gmail app password
- `NODE_ENV=production`

## Deployment Steps

1. Connect your GitHub repository to Render
2. Set Environment to "Node"
3. Set Build Command to `./build.sh`
4. Set Start Command to `node server.js`
5. Add the environment variables above

## How it Works

1. User uploads audio file
2. Node.js server processes the request
3. Gemini API transcribes the audio
4. Python script (`generate_word_doc.py`) creates perfect Hebrew Word document
5. Document is sent to user via email

The Python script uses Hebrew templates to ensure:
- Perfect RTL alignment
- No punctuation jumping issues
- Proper Hebrew fonts (David)
- Correct paragraph structure