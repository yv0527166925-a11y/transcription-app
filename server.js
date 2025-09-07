const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer, AlignmentType } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process');
const crypto = require('crypto');
require('dotenv').config();

// --- Environment Variable Check ---
const requiredEnvVars = ['GEMINI_API_KEY', 'EMAIL_USER', 'EMAIL_PASS'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ FATAL ERROR: Missing core environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Services Configuration & Data ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
const users = new Map();
initializeDemoUsers();

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

// --- Helper Functions ---
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
        resolve(Math.max(1, Math.ceil(stats.size / (1024 * 1024 * 5))));
      }
    });
    ffprobe.on('error', () => resolve(1));
  });
}

// --- API Routes ---
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

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) { return res.status(400).json({ success: false, error: 'נא למלא את כל השדות' }); }
    if (users.has(email)) { return res.status(409).json({ success: false, error: 'משתמש עם אימייל זה כבר קיים' }); }
    const newUser = { id: Date.now().toString(), name, email, password, remainingMinutes: 30, totalTranscribed: 0, isAdmin: false, history: [] };
    users.set(email, newUser);
    const { password: _, ...userToReturn } = newUser;
    res.status(201).json({ success: true, user: userToReturn });
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

app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  const { email } = req.body;
  const files = req.files;
  const user = users.get(email);
  if (!user) return res.status(404).json({ success: false, error: 'משתמש לא נמצא' });
  if (!files || files.length === 0) return res.status(400).json({ success: false, error: 'לא הועלו קבצים' });

  let totalMinutes = 0;
  for (const file of files) { totalMinutes += await getMediaDuration(file.path); }
  if (totalMinutes > user.remainingMinutes) {
    files.forEach(file => fs.unlinkSync(file.path));
    return res.status(402).json({ success: false, error: 'אין מספיק דקות בחשבון' });
  }

  processTranscriptionJob(files, user, totalMinutes);
  res.json({ success: true, message: 'התמלול התחיל', estimatedMinutes: totalMinutes });
});

app.get('/api/download/:fileId', (req, res) => {
    const { fileId } = req.params;
    const { userEmail } = req.query;
    if (!userEmail) return res.status(401).send('Unauthorized');
    const user = users.get(userEmail);
    const historyItem = user?.history.find(item => item.fileId === fileId);
    if (!historyItem) return res.status(404).send('File not found or access denied.');
    const filePath = path.join(__dirname, 'transcripts', fileId);
    if (fs.existsSync(filePath)) {
        res.download(filePath, `תמלול - ${historyItem.fileName}`);
    } else {
        res.status(404).send('File not found on server.');
    }
});


// --- Background Processing & Helpers ---
async function processTranscriptionJob(files, user, totalMinutes) { /* ... same as before ... */ }
async function convertAudioForGemini(inputPath) { /* ... same as before ... */ }
async function transcribeWithGemini(filePath) { /* ... same as before ... */ }
async function createWordDocument(transcription, filename, duration) { /* ... same as before ... */ }
async function sendTranscriptionEmail(userEmail, transcriptions) { /* ... same as before ... */ }


app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});
