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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Multer Configuration ---
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

// --- Services Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- In-memory Data ---
const users = new Map();
initializeDemoUsers();

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
    ffprobe.on('close', () => {
        resolve(Math.ceil(parseFloat(output.trim() || '60') / 60)); // Default to 1 min if fails
    });
    ffprobe.on('error', () => resolve(1));
  });
}

// --- API Routes ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
  }
  const { password: _, ...userToReturn } = user;
  res.json({ success: true, user: userToReturn });
});

// =========================================================
//  FIX: Re-added the missing admin route with security
// =========================================================
app.post('/api/admin/add-minutes', (req, res) => {
  const { adminEmail, userEmail, minutes } = req.body;

  // Security check
  const adminUser = users.get(adminEmail);
  if (!adminUser || !adminUser.isAdmin) {
    return res.status(403).json({ success: false, error: 'Forbidden: User is not an admin.' });
  }
  
  const targetUser = users.get(userEmail);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User to add minutes to was not found.' });
  }

  const minutesToAdd = parseInt(minutes);
  if (isNaN(minutesToAdd) || minutesToAdd <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid number of minutes.' });
  }
  
  targetUser.remainingMinutes += minutesToAdd;
  console.log(`✅ Admin ${adminEmail} added ${minutesToAdd} minutes to ${userEmail}.`);
  res.json({ success: true, message: `נוספו ${minutesToAdd} דקות בהצלחה`, newBalance: targetUser.remainingMinutes });
});


app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  const { email } = req.body;
  const files = req.files;
  const user = users.get(email);

  if (!user) return res.status(404).json({ success: false, error: 'משתמש לא נמצא' });
  if (!files || files.length === 0) return res.status(400).json({ success: false, error: 'לא הועלו קבצים' });

  let totalMinutes = 0;
  for (const file of files) {
    totalMinutes += await getMediaDuration(file.path);
  }

  if (totalMinutes > user.remainingMinutes) {
    files.forEach(file => fs.unlinkSync(file.path));
    return res.status(402).json({ success: false, error: 'אין מספיק דקות בחשבון' });
  }

  processTranscriptionJob(files, user, totalMinutes);
  res.json({ success: true, message: 'התמלול התחיל', estimatedMinutes: totalMinutes });
});

// --- Background Processing ---
async function processTranscriptionJob(files, user, totalMinutes) {
  // ... (rest of the functions are the same)
}
// (The rest of the `server.js` file remains unchanged)
