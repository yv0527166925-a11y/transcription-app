#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🗄️ Installing MongoDB dependencies...');

// Install mongoose
const installProcess = spawn('npm', ['install', 'mongoose'], {
    stdio: 'inherit',
    shell: true
});

installProcess.on('close', (code) => {
    if (code === 0) {
        console.log('✅ MongoDB dependencies installed successfully!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Create your MongoDB cluster at https://cloud.mongodb.com');
        console.log('2. Get your connection string');
        console.log('3. Add MONGODB_URI to your .env file:');
        console.log('   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/transcription-app');
        console.log('');
        console.log('🚀 Then restart your server with: npm start');
        console.log('👤 Visit /admin.html to manage users');

        // Check if .env exists and show warning if MONGODB_URI is missing
        checkEnvFile();
    } else {
        console.error('❌ Failed to install MongoDB dependencies');
    }
});

function checkEnvFile() {
    const envPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(envPath)) {
        console.log('');
        console.log('⚠️ WARNING: .env file not found!');
        console.log('Please create .env file based on .env.example');
        return;
    }

    const envContent = fs.readFileSync(envPath, 'utf8');

    if (!envContent.includes('MONGODB_URI')) {
        console.log('');
        console.log('⚠️ WARNING: MONGODB_URI not found in .env file!');
        console.log('Please add your MongoDB connection string to .env file');
    } else {
        console.log('');
        console.log('✅ MongoDB configuration found in .env file');
    }
}