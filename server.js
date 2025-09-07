const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer, AlignmentType } = require('docx');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🔧 Starting server initialization...');

// Middleware
app.use(cors());
app.use(express.json());

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
    cb(null, `${timestamp}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

console.log('🔧 Multer configured');

// Initialize Gemini AI
let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('🤖 Gemini AI initialized');
} catch (error) {
  console.error('❌ Gemini AI initialization failed:', error);
}

// Configure email transporter
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  console.log('📧 Email transporter configured');
} catch (error) {
  console.error('❌ Email transporter failed:', error);
}

// In-memory database
const users = new Map();
const transcriptionJobs = new Map();

// Initialize demo users
function initializeDemoUsers() {
  users.set('admin@example.com', {
    id: 'admin1',
    name: 'מנהל המערכת',
    email: 'admin@example.com',
    password: 'admin123',
    remainingMinutes: 1000,
    totalTranscribed: 150,
    isAdmin: true,
    history: []
  });

  users.set('test@example.com', {
    id: 'user1',
    name: 'משתמש בדיקה',
    email: 'test@example.com',
    password: 'test123',
    remainingMinutes: 45,
    totalTranscribed: 25,
    isAdmin: false,
    history: []
  });

  console.log('✅ Demo users initialized');
}

// Simple duration estimation
function getAudioDuration(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    return Math.max(1, Math.ceil(fileSizeInMB));
  } catch (error) {
    return 5;
  }
}

// API ROUTES
app.post('/api/register', (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    if (users.has(email)) {
      return res.status(400).json({ success: false, error: 'משתמש עם אימייל זה כבר קיים' });
    }
    
    const user = {
      id: Date.now().toString(),
      name,
      email,
      password,
      phone,
      remainingMinutes: 30,
      totalTranscribed: 0,
      isAdmin: false,
      history: []
    };
    
    users.set(email, user);
    console.log(`✅ New user registered: ${email}`);
    
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
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהרשמה' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = users.get(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
    }
    
    console.log(`✅ User logged in: ${email}`);
    
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהתחברות' });
  }
});

app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
    const { email, language } = req.body;
    const files = req.files;
    
    console.log(`🎯 Transcription request from: ${email}`);
    
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
      const duration = getAudioDuration(file.path);
      totalMinutes += duration;
      fileInfos.push({ file, duration });
    }
    
    if (totalMinutes > user.remainingMinutes) {
      return res.status(400).json({ 
        success: false,
        error: 'אין מספיק דקות בחשבון'
      });
    }
    
    const jobId = Date.now().toString();
    console.log(`🚀 Starting transcription job: ${jobId}`);
    
    // Start processing asynchronously
    setTimeout(() => processTranscriptionJob(jobId, fileInfos, user, language), 1000);
    
    res.json({
      success: true,
      jobId: jobId,
      estimatedMinutes: totalMinutes,
      message: 'התמלול התחיל. התוצאות יישלחו למייל'
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בעיבוד התמלול' });
  }
});

app.post('/api/admin/add-minutes', (req, res) => {
  try {
    const { userEmail, minutes } = req.body;
    
    if (!userEmail || !minutes) {
      return res.status(400).json({ 
        success: false, 
        error: 'חסרים פרטים' 
      });
    }
    
    const user = users.get(userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: `משתמש לא נמצא` 
      });
    }
    
    const minutesToAdd = parseInt(minutes);
    const oldBalance = user.remainingMinutes;
    user.remainingMinutes += minutesToAdd;
    
    console.log(`✅ Added ${minutesToAdd} minutes to ${userEmail}`);
    
    res.json({
      success: true,
      message: `נוספו ${minutesToAdd} דקות`,
      oldBalance: oldBalance,
      newBalance: user.remainingMinutes
    });
  } catch (error) {
    console.error('Admin error:', error);
    res.status(500).json({ success: false, error: 'שגיאה' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.size
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working!',
    users: users.size
  });
});

// Static files
app.use(express.static('.'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// HELPER FUNCTIONS
async function processTranscriptionJob(jobId, fileInfos, user, language) {
  try {
    console.log(`🎯 Processing job ${jobId}`);
    
    const transcriptions = [];
    
    for (let i = 0; i < fileInfos.length; i++) {
      const { file, duration } = fileInfos[i];
      
      try {
        console.log(`🎵 Processing: ${file.originalname}`);
        const transcription = await realGeminiTranscription(file.path, file.originalname);
        const wordDoc = await createWordDocument(transcription, file.originalname, duration);
        
        transcriptions.push({
          filename: file.originalname,
          wordDoc: wordDoc,
          duration: duration
        });
        
        console.log(`✅ Completed: ${file.originalname}`);
        
      } catch (error) {
        console.error(`❌ Error processing ${file.originalname}:`, error);
      }
    }
    
    if (transcriptions.length > 0) {
      await sendTranscriptionEmail(user.email, transcriptions);
      
      const successfulMinutes = transcriptions.reduce((sum, t) => sum + t.duration, 0);
      user.remainingMinutes -= successfulMinutes;
      user.totalTranscribed += successfulMinutes;
    }
    
    // Cleanup files
    fileInfos.forEach(({ file }) => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    
    console.log(`🎉 Job ${jobId} completed`);
    
  } catch (error) {
    console.error('Job processing error:', error);
  }
}

async function realGeminiTranscription(filePath, filename) {
  try {
    if (!genAI) {
      throw new Error('Gemini not initialized');
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro"
    });
    
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.m4a') mimeType = 'audio/mp4';

    const prompt = `תמלל את הקובץ האודיו הבא לעברית בצורה מלאה ומדויקת. חלק לפסקאות ברורות.`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio
        }
      },
      prompt
    ]);

    const response = await result.response;
    let transcription = response.text();
    
    transcription = transcription.trim();
    
    if (!transcription || transcription.length < 10) {
      throw new Error('התמלול נכשל');
    }
    
    return transcription;
    
  } catch (error) {
    console.error('Gemini error:', error);
    throw error;
  }
}

async function createWordDocument(transcription, filename, duration) {
  try {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "תמלול אוטומטי",
                bold: true,
                size: 32
              })
            ],
            alignment: AlignmentType.CENTER
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `שם הקובץ: ${filename}`,
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
                text: transcription,
                size: 24
              })
            ]
          })
        ]
      }]
    });
    
    return await Packer.toBuffer(doc);
    
  } catch (error) {
    console.error('Word doc error:', error);
    throw error;
  }
}

async function sendTranscriptionEmail(userEmail, transcriptions) {
  try {
    if (!transporter) {
      console.log('⚠️ Email not configured, skipping send');
      return;
    }

    console.log(`📧 Sending email to: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => ({
      filename: `תמלול_${trans.filename}.docx`,
      content: trans.wordDoc,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }));

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: '✅ התמלול הושלם',
      html: `
        <div dir="rtl">
          <h2>התמלול הושלם בהצלחה!</h2>
          <p>מצורפים הקבצים המתומללים.</p>
        </div>
      `,
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to: ${userEmail}`);
    
  } catch (error) {
    console.error('Email error:', error);
  }
}

// Initialize and start
initializeDemoUsers();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email: ${!!process.env.EMAIL_USER}`);
  console.log(`🤖 Gemini: ${!!process.env.GEMINI_API_KEY}`);
  console.log('✅ Server ready!');
});
