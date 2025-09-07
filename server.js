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

// --- Services & Data ---
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
  if (!user || user.password !== password) { return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' }); }
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

  processTranscriptionJob(files, user);
  res.json({ success: true, message: 'התמלול התחיל' });
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
async function processTranscriptionJob(files, user) {
  for (const file of files) {
    const originalFileName = file.originalname;
    let duration = 0;
    try {
      duration = await getMediaDuration(file.path);
      if (duration > user.remainingMinutes) {
          throw new Error(`Not enough minutes for file ${originalFileName}.`);
      }
      
      const convertedPath = await convertAudioForGemini(file.path);
      const transcriptionText = await transcribeWithGemini(convertedPath);
      const wordDocBuffer = await createWordDocument(transcriptionText, originalFileName, duration);
      
      const fileId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.docx`;
      const savePath = path.join(__dirname, 'transcripts', fileId);
      if (!fs.existsSync(path.join(__dirname, 'transcripts'))) {
          fs.mkdirSync(path.join(__dirname, 'transcripts'));
      }
      fs.writeFileSync(savePath, wordDocBuffer);
      
      user.history.push({ date: new Date().toISOString(), fileName: originalFileName, duration, status: 'completed', fileId });
      await sendTranscriptionEmail(user.email, [{ filename: originalFileName, wordDoc: wordDocBuffer }]);
      
      user.remainingMinutes -= duration;
      user.totalTranscribed += duration;
      console.log(`✅ Successfully processed ${originalFileName} for ${user.email}.`);

    } catch (error) {
      console.error(`❌ Failed to process ${originalFileName} for ${user.email}:`, error.message);
      user.history.push({ date: new Date().toISOString(), fileName: originalFileName, duration, status: 'failed', fileId: null });
    } finally {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      const convertedPathCheck = file.path.replace(/\.[^/.]+$/, '_converted.wav');
      if (fs.existsSync(convertedPathCheck)) fs.unlinkSync(convertedPathCheck);
    }
  }
}

async function convertAudioForGemini(inputPath) {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath.replace(/\.[^/.]+$/, '_converted.wav');
        const ffmpeg = spawn('ffmpeg', ['-i', inputPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', outputPath]);
        ffmpeg.on('close', (code) => code === 0 ? resolve(outputPath) : reject(new Error('ffmpeg conversion failed')));
        ffmpeg.on('error', (err) => reject(err));
    });
}

async function transcribeWithGemini(filePath) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); 
  const fileResponse = await genAI.uploadFile(filePath, { mimeType: 'audio/wav', displayName: path.basename(filePath) });
  const prompt = `Please transcribe the following audio file accurately from start to finish.`;
  const filePart = { fileData: { mimeType: fileResponse.file.mimeType, fileUri: fileResponse.file.uri } };
  const result = await model.generateContent([prompt, filePart]);
  await genAI.deleteFile(fileResponse.file.name);
  const response = result.response;
  if (response.promptFeedback?.blockReason) { throw new Error(`Transcription blocked: ${response.promptFeedback.blockReason}`); }
  const transcription = response.text().trim();
  if (!transcription) throw new Error('Transcription result was empty');
  return transcription;
}

async function createWordDocument(transcription, filename, duration) {
  const paragraphs = transcription.split(/\n\s*\n/).filter(s => s.trim()).map(section => new Paragraph({ children: [new TextRun({ text: section, size: 24, font: { name: "David" }, rightToLeft: true })], bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 200 } }));
  const fileNameParagraph = new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "שם הקובץ: ", bold: true, rightToLeft: true, size: 24 }), new TextRun({ text: filename, rightToLeft: true, size: 24 })] });
  const doc = new Document({ sections: [{ children: [ new Paragraph({ text: `תמלול אוטומטי`, alignment: AlignmentType.CENTER, heading: "Title" }), fileNameParagraph, new Paragraph({ text: `משך: ${duration} דקות`, alignment: AlignmentType.RIGHT }), new Paragraph({ text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`, alignment: AlignmentType.RIGHT, spacing: { after: 400 } }), ...paragraphs ] }] });
  return Packer.toBuffer(doc);
}

async function sendTranscriptionEmail(userEmail, transcriptions) {
  const attachments = transcriptions.map(trans => ({
    filename: `תמלול - ${path.basename(trans.filename, path.extname(trans.filename))}.docx`,
    content: trans.wordDoc,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }));
  await transporter.sendMail({
    from: `"תמלול חכם" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: '✅ התמלול שלך מוכן!',
    html: `<div dir="rtl"><h2>התמלול הושלם!</h2><p>מצורפים קבצי ה-Word שהזמנת.</p></div>`,
    attachments
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});
