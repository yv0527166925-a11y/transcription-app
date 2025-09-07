const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer, AlignmentType } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process');
const crypto = require('crypto'); // For generating unique IDs
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

// --- Conditional Stripe Integration ---
// (Stripe logic remains the same)
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
// (getMediaDuration function remains the same)

// --- API Routes ---
app.get('/health', (req, res) => { res.status(200).send('OK'); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.post('/api/login', (req, res) => { /* ... login logic ... */ });
app.post('/api/register', (req, res) => { /* ... register logic ... */ });
app.post('/api/admin/add-minutes', (req, res) => { /* ... add-minutes logic ... */ });
app.post('/api/transcribe', upload.array('files'), async (req, res) => { /* ... transcribe logic ... */ });

// =========================================================
//  NEW: Download Route for History Files
// =========================================================
app.get('/api/download/:fileId', (req, res) => {
    const { fileId } = req.params;
    const { userEmail } = req.query; // For security check

    if (!userEmail) {
        return res.status(401).send('Unauthorized');
    }

    const user = users.get(userEmail);
    // Security: Check if the fileId exists in the user's history
    const historyItem = user?.history.find(item => item.fileId === fileId);

    if (!historyItem) {
        return res.status(404).send('File not found or access denied.');
    }

    const filePath = path.join(__dirname, 'transcripts', fileId);

    if (fs.existsSync(filePath)) {
        res.download(filePath, `תמלול - ${historyItem.fileName}.docx`);
    } else {
        res.status(404).send('File not found on server.');
    }
});


// --- Background Processing & Helpers ---
async function processTranscriptionJob(files, user, totalMinutes) {
  console.log(`🚀 Starting job for ${user.email}`);
  const successfulTranscriptions = [];

  for (const file of files) {
    const originalFileName = file.originalname;
    try {
      const convertedPath = await convertAudioForGemini(file.path);
      const transcriptionText = await transcribeWithGemini(convertedPath);
      
      // =========================================================
      //  MODIFIED: Save the file and update history
      // =========================================================
      const wordDocBuffer = await createWordDocument(transcriptionText, originalFileName, totalMinutes);
      
      // 1. Create a unique ID for the file
      const fileId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.docx`;
      const savePath = path.join(__dirname, 'transcripts', fileId);

      // 2. Ensure the transcripts directory exists
      if (!fs.existsSync(path.join(__dirname, 'transcripts'))) {
          fs.mkdirSync(path.join(__dirname, 'transcripts'));
      }

      // 3. Save the file
      fs.writeFileSync(savePath, wordDocBuffer);
      console.log(`📄 Saved transcript to ${savePath}`);

      // 4. Add to user history with the fileId
      user.history.push({
          date: new Date().toISOString(),
          fileName: originalFileName,
          duration: totalMinutes, // This might need refinement for single files
          status: 'completed',
          fileId: fileId // The link to the saved file
      });
      
      successfulTranscriptions.push({ filename: originalFileName, wordDoc: wordDocBuffer });

    } catch (error) {
        console.error(`❌ Failed to process ${originalFileName}:`, error.message);
        user.history.push({
            date: new Date().toISOString(),
            fileName: originalFileName,
            duration: totalMinutes,
            status: 'failed',
            fileId: null
        });
    } finally {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      const convertedPathCheck = file.path.replace(/\.[^/.]+$/, '_converted.wav');
      if (fs.existsSync(convertedPathCheck)) fs.unlinkSync(convertedPathCheck);
    }
  }

  if (successfulTranscriptions.length > 0) {
    await sendTranscriptionEmail(user.email, successfulTranscriptions);
    user.remainingMinutes -= totalMinutes;
    user.totalTranscribed += totalMinutes;
  }
}

// (All other functions like convertAudioForGemini, transcribeWithGemini, etc. remain the same)

app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});
