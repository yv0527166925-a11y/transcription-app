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
app.use(express.static(path.join(__dirname))); // Serve static files from the root directory

// Configure multer for file uploads with Hebrew support
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    // Correctly handle Hebrew filenames
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${safeName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB limit
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure email transporter
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// In-memory database
const users = new Map();
const transcriptionJobs = new Map();

// Initialize demo users
function initializeDemoUsers() {
    users.set('admin@example.com', {
        id: 'admin', name: 'מנהל המערכת', email: 'admin@example.com', password: 'admin123',
        phone: '', remainingMinutes: 9999, totalTranscribed: 0, isAdmin: true, history: [], createdAt: new Date()
    });
    users.set('test@example.com', {
        id: 'test123', name: 'משתמש לבדיקה', email: 'test@example.com', password: 'test123',
        phone: '', remainingMinutes: 10, totalTranscribed: 0, isAdmin: false, history: [], createdAt: new Date()
    });
    console.log('👑 Admin and Test users initialized.');
}

// Audio duration extraction
async function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath]);
    let output = '';
    ffprobe.stdout.on('data', (data) => { output += data.toString(); });
    ffprobe.on('close', (code) => {
      if (code === 0 && output) {
        resolve(Math.ceil(parseFloat(output.trim()) / 60));
      } else {
        const stats = fs.statSync(filePath);
        resolve(Math.max(1, Math.ceil(stats.size / (1024 * 1024 * 2)))); // Fallback estimation
      }
    });
    ffprobe.on('error', () => {
      const stats = fs.statSync(filePath);
      resolve(Math.max(1, Math.ceil(stats.size / (1024 * 1024 * 2))));
    });
  });
}

// API ROUTES
app.post('/api/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (users.has(email)) {
    return res.status(400).json({ success: false, error: 'משתמש עם אימייל זה כבר קיים' });
  }
  const user = {
    id: Date.now().toString(), name, email, password, phone, remainingMinutes: 30,
    totalTranscribed: 0, isAdmin: false, history: [], createdAt: new Date()
  };
  users.set(email, user);
  console.log(`✅ New user registered: ${email}`);
  res.json({ success: true, user: { ...user, password: '' } });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
  }
  console.log(`✅ User logged in: ${email}`);
  res.json({ success: true, user: { ...user, password: '' } });
});

app.post('/api/admin/add-minutes', (req, res) => {
    const { userEmail, minutes } = req.body;
    const user = users.get(userEmail);
    if (!user) {
        return res.status(404).json({ success: false, error: `משתמש לא נמצא` });
    }
    const minutesToAdd = parseInt(minutes);
    if (isNaN(minutesToAdd) || minutesToAdd <= 0) {
        return res.status(400).json({ success: false, error: 'מספר הדקות חייב להיות חיובי' });
    }
    user.remainingMinutes += minutesToAdd;
    console.log(`✅ Added ${minutesToAdd} minutes to ${userEmail}. New balance: ${user.remainingMinutes}`);
    res.json({ success: true, message: `נוספו דקות בהצלחה`, newBalance: user.remainingMinutes });
});

app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  const { email, language } = req.body;
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'לא הועלו קבצים' });
  }
  const user = users.get(email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'משתמש לא נמצא' });
  }

  let totalMinutes = 0;
  const fileInfos = [];
  for (const file of files) {
      const duration = await getAudioDuration(file.path);
      totalMinutes += duration;
      fileInfos.push({ file, duration });
  }

  if (totalMinutes > user.remainingMinutes) {
    return res.status(400).json({ success: false, error: 'אין מספיק דקות בחשבון' });
  }

  const jobId = Date.now().toString();
  processTranscriptionJob(jobId, fileInfos, user, language); // Process in background
  res.json({ success: true, jobId, estimatedMinutes: totalMinutes, message: 'התמלול התחיל' });
});

// Main Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// HELPER FUNCTIONS
async function processTranscriptionJob(jobId, fileInfos, user, language) {
  console.log(`🚀 Starting job ${jobId}`);
  const successfulTranscriptions = [];
  let minutesToDeduct = 0;

  for (const { file, duration } of fileInfos) {
    const originalFileName = Buffer.from(file.filename.split('_').slice(1).join('_'), 'utf-8').toString();
    try {
      const transcriptionText = await realGeminiTranscription(file.path);
      const wordDocBuffer = await createWordDocument(transcriptionText, originalFileName, duration);
      successfulTranscriptions.push({ filename: originalFileName, wordDoc: wordDocBuffer });
      minutesToDeduct += duration;

      user.history.push({
          date: new Date().toLocaleDateString('he-IL'), fileName: originalFileName,
          duration, language, status: 'completed'
      });
    } catch (error) {
      console.error(`❌ Error processing ${originalFileName}:`, error);
      user.history.push({
          date: new Date().toLocaleDateString('he-IL'), fileName: originalFileName,
          duration, language, status: 'failed'
      });
    } finally {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path); // Clean up file
    }
  }

  if (successfulTranscriptions.length > 0) {
    await sendTranscriptionEmail(user.email, successfulTranscriptions);
    user.remainingMinutes -= minutesToDeduct;
    user.totalTranscribed += minutesToDeduct;
  }
  console.log(`🎉 Job ${jobId} completed.`);
}

async function realGeminiTranscription(filePath) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const audioData = fs.readFileSync(filePath);
  const base64Audio = audioData.toString('base64');
  const mimeType = 'audio/mpeg'; // Generic MIME type for compatibility

  const prompt = `תמלל את קובץ האודיו במלואו, מההתחלה ועד הסוף. זהו שיעור תורני בעברית עם הגיה ליטאית.
- תמלל כל מילה ומילה.
- אל תסכם או תקצר.
- שמור על מבנה של פסקאות, עם שורה ריקה בין כל פסקה.`;
  
  const result = await model.generateContent([{ inlineData: { mimeType, data: base64Audio } }, prompt]);
  const transcription = result.response.text().trim();
  if (!transcription || transcription.length < 20) throw new Error('Transcription failed or text too short');
  return transcription;
}

async function createWordDocument(transcription, filename, duration) {
  const sections = transcription.split(/\n\s*\n/).filter(s => s.trim().length > 0);
  const paragraphs = sections.map(section => new Paragraph({
      children: [new TextRun({ text: section.trim(), size: 24, font: { name: "David" }, rightToLeft: true })],
      bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 200 }
  }));

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: "תמלול אוטומטי", bold: true, size: 36, font: { name: "David" } })],
          alignment: AlignmentType.CENTER, spacing: { after: 400 }
        }),
        new Paragraph({ text: `שם הקובץ: ${filename}`, alignment: AlignmentType.RIGHT }),
        new Paragraph({ text: `משך: ${duration} דקות`, alignment: AlignmentType.RIGHT }),
        new Paragraph({ text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`, alignment: AlignmentType.RIGHT, spacing: { after: 600 } }),
        ...paragraphs
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

async function sendTranscriptionEmail(userEmail, transcriptions) {
  const attachments = transcriptions.map(trans => ({
    filename: `תמלול_${trans.filename.replace(/\.[^/.]+$/, '')}.docx`,
    content: trans.wordDoc,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }));
  await transporter.sendMail({
    from: `"תמלול חכם" <${process.env.EMAIL_USER}>`,
    to: userEmail, subject: '✅ התמלול שלך מוכן!',
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;"><h2>התמלול הושלם בהצלחה!</h2><p>מצורפים קבצי ה-Word שהזמנת.</p></div>`,
    attachments
  });
  console.log(`✅ Email sent successfully to: ${userEmail}`);
}

// Initialize and start server
initializeDemoUsers();
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
