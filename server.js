const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configure multer for file uploads
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
    const extension = path.extname(file.originalname);
    cb(null, `${timestamp}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure email transporter - FIXED LINE
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// In-memory database (replace with real database in production)
const users = new Map();
const transcriptionJobs = new Map();

// Routes

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// User registration
app.post('/api/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  
  if (users.has(email)) {
    return res.status(400).json({ error: 'משתמש עם אימייל זה כבר קיים' });
  }
  
  const user = {
    id: Date.now().toString(),
    name,
    email,
    password, // In production, hash the password!
    phone,
    remainingMinutes: 30, // Free minutes for new users
    totalTranscribed: 0,
    isAdmin: false,
    history: [],
    createdAt: new Date()
  };
  
  users.set(email, user);
  
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      remainingMinutes: user.remainingMinutes,
      totalTranscribed: user.totalTranscribed,
      isAdmin: user.isAdmin
    }
  });
});

// User login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
  }
  
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      remainingMinutes: user.remainingMinutes,
      totalTranscribed: user.totalTranscribed,
      isAdmin: user.isAdmin,
      history: user.history
    }
  });
});

// Process transcription
app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
    const { email, language } = req.body;
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'לא הועלו קבצים' });
    }
    
    const user = users.get(email);
    if (!user) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Calculate estimated duration (in real app, use audio analysis)
    const estimatedMinutes = files.length * 5; // Simplified estimation
    
    if (estimatedMinutes > user.remainingMinutes) {
      return res.status(400).json({ 
        error: 'אין מספיק דקות בחשבון',
        needed: estimatedMinutes,
        available: user.remainingMinutes
      });
    }
    
    const jobId = Date.now().toString();
    
    // Start async processing
    processTranscriptionJob(jobId, files, user, language);
    
    res.json({
      success: true,
      jobId: jobId,
      message: 'התמלול התחיל. התוצאות יישלחו למייל'
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'שגיאה בעיבוד התמלול' });
  }
});

// Process transcription job asynchronously
async function processTranscriptionJob(jobId, files, user, language) {
  try {
    transcriptionJobs.set(jobId, { status: 'processing', progress: 0 });
    
    const transcriptions = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Update progress
      transcriptionJobs.set(jobId, { 
        status: 'processing', 
        progress: (i / files.length) * 80 
      });
      
      // In real implementation, extract audio and send to Gemini
      // For now, simulate transcription
      const transcription = await simulateGeminiTranscription(file, language);
      
      // Create Word document
      const wordDoc = await createWordDocument(transcription, file.originalname);
      
      transcriptions.push({
        filename: file.originalname,
        wordDoc: wordDoc,
        transcription: transcription
      });
    }
    
    // Update progress
    transcriptionJobs.set(jobId, { status: 'processing', progress: 90 });
    
    // Send email with attachments
    await sendTranscriptionEmail(user.email, transcriptions);
    
    // Update user account
    const estimatedMinutes = files.length * 5;
    user.remainingMinutes -= estimatedMinutes;
    user.totalTranscribed += estimatedMinutes;
    
    // Add to history
    transcriptions.forEach((trans, index) => {
      user.history.push({
        id: Date.now() + index,
        date: new Date().toLocaleDateString('he-IL'),
        fileName: trans.filename,
        duration: 5, // Simplified
        language: language,
        status: 'completed',
        jobId: jobId
      });
    });
    
    // Complete job
    transcriptionJobs.set(jobId, { status: 'completed', progress: 100 });
    
    // Clean up uploaded files
    files.forEach(file => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    
  } catch (error) {
    console.error('Job processing error:', error);
    transcriptionJobs.set(jobId, { status: 'failed', error: error.message });
  }
}

// Simulate Gemini 2.5 Pro transcription
async function simulateGeminiTranscription(file, language) {
  try {
    // In real implementation:
    // 1. Extract audio from file
    // 2. Convert to base64 or proper format
    // 3. Send to Gemini 2.5 Pro with appropriate prompts
    
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'temp_key') {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      
      // This is a simulation - in reality you'd process the actual audio
      const prompt = `תמלל את הקובץ הבא לעברית נקייה ומסודרת. הקובץ: ${file.originalname}`;
      
      // For demo purposes, return simulated transcription
      // In real app, you'd send the actual audio file to Gemini
    }
    
    return `
תמלול הקובץ: ${file.originalname}

זהו תמלול דמו שנוצר על ידי Gemini 2.5 Pro.
בתמלול אמיתי, כאן יופיע התוכן המדויק של הקובץ האודיו או הווידאו.

התמלול כולל:
- זיהוי דוברים מדויק
- סימני פיסוק מדויקים
- פיצול לפסקאות לוגיות
- עריכה לשונית בסיסית
- תיקון שגיאות כתיב

זהו דוגמה לתמלול איכותי שמתקבל מהמערכת. בפועל, המערכת תעבד את הקובץ האמיתי ותחזיר תמלול מדויק ומעוצב.

תאריך: ${new Date().toLocaleDateString('he-IL')}
שפה: ${language}
מודל: Gemini 2.5 Pro
איכות: גבוהה
    `.trim();
    
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('שגיאה בתמלול עם Gemini');
  }
}

// Create formatted Word document
async function createWordDocument(transcription, filename) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "תמלול מתקדם",
              bold: true,
              size: 32,
              color: "667eea"
            })
          ],
          heading: "Title"
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `קובץ: ${filename}`,
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "מופק על ידי Gemini 2.5 Pro",
              size: 20,
              italics: true,
              color: "666666"
            })
          ]
        }),
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({
          children: [
            new TextRun({
              text: "תוכן התמלול:",
              bold: true,
              size: 26
            })
          ]
        }),
        new Paragraph({ text: "" }), // Empty line
        ...transcription.split('\n').map(line => 
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 22
              })
            ]
          })
        )
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}

// Send transcription email
async function sendTranscriptionEmail(email, transcriptions) {
  const attachments = transcriptions.map((trans, index) => ({
    filename: `${trans.filename.replace(/\.[^/.]+$/, "")}_תמלול.docx`,
    content: trans.wordDoc
  }));
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: '🎯 התמלול שלך מוכן!',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #667eea;">🎯 התמלול הושלם בהצלחה!</h2>
        
        <p>שלום,</p>
        
        <p>התמלול שלך עם <strong>Gemini 2.5 Pro</strong> הושלם!</p>
        
        <h3>📄 קבצים מצורפים:</h3>
        <ul>
          ${transcriptions.map(trans => 
            `<li>${trans.filename} - תמלול מעוצב בפורמט Word</li>`
          ).join('')}
        </ul>
        
        <p style="color: #666;">
          <small>
            ✨ התמלול עוצב בקפידה ומוכן לעריכה נוספת<br>
            🤖 מופק על ידי טכנולוגיית Gemini 2.5 Pro<br>
            📝 פורמט Word מתאים לעריכה והדפסה
          </small>
        </p>
        
        <p>תודה שבחרת בשירות התמלול החכם שלנו!</p>
        
        <hr>
        <p style="font-size: 12px; color: #888;">
          מערכת תמלול חכמה | Powered by Gemini 2.5 Pro
        </p>
      </div>
    `,
    attachments: attachments
  };
  
  await transporter.sendMail(mailOptions);
}

// Admin: Add minutes to user
app.post('/api/admin/add-minutes', (req, res) => {
  const { adminEmail, userEmail, minutes } = req.body;
  
  const admin = users.get(adminEmail);
  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ error: 'אין הרשאת מנהל' });
  }
  
  const user = users.get(userEmail);
  if (!user) {
    return res.status(404).json({ error: 'משתמש לא נמצא' });
  }
  
  user.remainingMinutes += parseInt(minutes);
  
  res.json({
    success: true,
    message: `נוספו ${minutes} דקות למשתמש ${userEmail}`,
    newBalance: user.remainingMinutes
  });
});

// Check job status
app.get('/api/job/:jobId', (req, res) => {
  const job = transcriptionJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'עבודה לא נמצאה' });
  }
  
  res.json(job);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Access your app at: http://localhost:${PORT}`);
});

// Create admin user on startup
setTimeout(() => {
  users.set('admin@example.com', {
    id: 'admin',
    name: 'מנהל המערכת',
    email: 'admin@example.com',
    password: 'admin123',
    phone: '',
    remainingMinutes: 9999,
    totalTranscribed: 0,
    isAdmin: true,
    history: [],
    createdAt: new Date()
  });
  console.log('👑 Admin user created: admin@example.com / admin123');
}, 1000);
