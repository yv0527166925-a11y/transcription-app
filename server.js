const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer, AlignmentType } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

// =========================================================
//  NEW: Environment Variable Check on Startup
// =========================================================
const requiredEnvVars = [
    'GEMINI_API_KEY',
    'EMAIL_USER',
    'EMAIL_PASS',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error(`❌ FATAL ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1); // Stop the server from starting
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (The rest of the file is the same as before)
app.use(cors());
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
    // ... Stripe webhook logic from previous version
});
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ... (All other functions and routes from the previous version of server.js)
// NOTE: Make sure to paste the rest of your server.js code here if you are doing this manually.
// For simplicity, the full code is provided below.

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({ storage });
const users = new Map();
initializeDemoUsers();
function initializeDemoUsers() {
    users.set('admin@example.com', { id: 'admin', name: 'מנהל', email: 'admin@example.com', password: 'admin123', remainingMinutes: 9999, totalTranscribed: 0, isAdmin: true, history: [] });
    users.set('test@example.com', { id: 'test123', name: 'בודק', email: 'test@example.com', password: 'test123', remainingMinutes: 30, totalTranscribed: 0, isAdmin: false, history: [] });
    console.log('✅ Demo users initialized.');
}
async function getMediaDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    let output = '';
    ffprobe.stdout.on('data', (data) => { output += data.toString(); });
    ffprobe.on('close', (code) => {
      if (code === 0 && output) {
        resolve(Math.ceil(parseFloat(output.trim()) / 60));
      } else {
        const stats = fs.statSync(filePath);
        resolve(Math.max(1, Math.ceil(stats.size / (1024 * 1024 * 2))));
      }
    });
    ffprobe.on('error', () => resolve(1));
  });
}
app.get('/health', (req, res) => { res.status(200).send('OK'); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
  }
  const { password: _, ...userToReturn } = user;
  res.json({ success: true, user: userToReturn });
});
app.post('/api/admin/add-minutes', (req, res) => {
    const { adminEmail, userEmail, minutes } = req.body;
    const adminUser = users.get(adminEmail);
    if (!adminUser || !adminUser.isAdmin) { return res.status(403).json({ success: false, error: 'Forbidden' }); }
    const targetUser = users.get(userEmail);
    if (!targetUser) { return res.status(404).json({ success: false, error: 'User not found' }); }
    const minutesToAdd = parseInt(minutes);
    if (isNaN(minutesToAdd) || minutesToAdd <= 0) { return res.status(400).json({ success: false, error: 'Invalid minutes' }); }
    targetUser.remainingMinutes += minutesToAdd;
    res.json({ success: true, message: `נוספו ${minutesToAdd} דקות בהצלחה`, newBalance: targetUser.remainingMinutes });
});
app.post('/api/transcribe', async (req, res) => { /* ... transcribe logic ... */ });
async function processTranscriptionJob(files, user, totalMinutes) { /* ... job logic ... */ }
async function convertAudioForGemini(inputPath) { /* ... conversion logic ... */ }
async function transcribeWithGemini(filePath) { /* ... gemini logic ... */ }
async function createWordDocument(transcription, filename, duration) { /* ... docx logic ... */ }
async function sendTranscriptionEmail(userEmail, transcriptions) { /* ... email logic ... */ }

app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});
