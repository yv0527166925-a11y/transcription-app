#!/bin/bash

# Render build script for Node.js + Python hybrid app

echo "🔧 Installing Node.js dependencies..."
npm install

echo "🐍 Installing Python dependencies..."
pip install -r requirements.txt

echo "✅ Build completed successfully"