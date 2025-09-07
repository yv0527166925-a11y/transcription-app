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
app.use(express.static(path.join(__dirname))); // Serve static files like index.html

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
// =========================================================
//  THE FIX IS HERE
// =========================================================
const transporter = nodemailer.createTransport({ // Corrected from createTransporter
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
    ffprobe.on('close', (code) => {
      if (code === 0 && output) {
        resolve(Math.ceil(parseFloat(output.trim()) / 60));
      } else {
        const stats = fs.statSync(filePath);
        resolve(Math.max(1, Math.ceil(stats.size / (1024 * 1024 * 2)))); // Fallback
      }
    });
    ffprobe.on('error', () => resolve(1)); // Error fallback
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
  const { password: _, ...userToReturn } = user; // Exclude password from response
  res.json({ success: true, user: userToReturn });
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
    files.forEach(file => fs.unlinkSync(file.path)); // Clean up uploaded files
    return res.status(402).json({ success: false, error: 'אין מספיק דקות בחשבון' });
  }

  // Start processing in the background and respond immediately
  processTranscriptionJob(files, user, totalMinutes);
  res.json({ success: true, message: 'התמלול התחיל', estimatedMinutes: totalMinutes });
});

// --- Background Processing ---
async function processTranscriptionJob(files, user, totalMinutes) {
  console.log(`🚀 Starting transcription job for ${user.email}`);
  const successfulTranscriptions = [];

  for (const file of files) {
    const originalFileName = Buffer.from(file.filename.split('_').slice(1).join('_'), 'utf-8').toString();
    try {
      const convertedPath = await convertAudioForGemini(file.path);
      const transcriptionText = await transcribeWithGemini(convertedPath);
      const wordDocBuffer = await createWordDocument(transcriptionText, originalFileName);
      successfulTranscriptions.push({ filename: originalFileName, wordDoc: wordDocBuffer });
    } catch (error) {
      console.error(`❌ Failed to process ${originalFileName}:`, error.message);
    } finally {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path); // Clean up original
      const convertedPathCheck = file.path.replace(/\.[^/.]+$/, '_converted.wav');
      if (fs.existsSync(convertedPathCheck)) fs.unlinkSync(convertedPathCheck); // Clean up converted
    }
  }

  if (successfulTranscriptions.length > 0) {
    await sendTranscriptionEmail(user.email, successfulTranscriptions);
    user.remainingMinutes -= totalMinutes;
    user.totalTranscribed += totalMinutes;
    console.log(`✅ Job finished for ${user.email}. ${totalMinutes} minutes deducted.`);
  }
}

async function convertAudioForGemini(inputPath) {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath.replace(/\.[^/.]+$/, '_converted.wav');
        const ffmpeg = spawn('ffmpeg', ['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', outputPath]);
        ffmpeg.on('close', (code) => {
            if (code === 0) resolve(outputPath);
            else reject(new Error('ffmpeg conversion failed'));
        });
        ffmpeg.on('error', (err) => reject(err));
    });
}

async function transcribeWithGemini(filePath) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const audioData = fs.readFileSync(filePath);
  const base64Audio = audioData.toString('base64');
  
  const audioPart = { inlineData: { mimeType: 'audio/wav', data: base64Audio } };
  
  const prompt = `תמלל את קובץ האודיו במלואו, מההתחלה ועד הסוף. זהו שיעור תורני בעברית.
- תמלל כל מילה ומילה. אל תסכם.
- שמור על מבנה של פסקאות, עם שורה ריקה בין כל פסקה.`;
  
  const result = await model.generateContent([prompt, audioPart]);
  const transcription = result.response.text().trim();
  if (!transcription) throw new Error('Transcription result was empty');
  return transcription;
}

async function createWordDocument(transcription, filename) {
  const paragraphs = transcription.split(/\n\s*\n/).filter(s => s.trim()).map(section =>
    new Paragraph({
      children: [new TextRun({ text: section, size: 24, font: { name: "David" }, rightToLeft: true })],
      bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 200 }
    })
  );
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: `תמלול הקובץ: ${filename}`, alignment: AlignmentType.CENTER, heading: "Heading1" }),
        new Paragraph({ text: `תאריך: ${new
