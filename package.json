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
    // Fix Hebrew filename encoding
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

// Debug function to list all users
function debugListUsers() {
  console.log('🔧 Current users in system:');
  users.forEach((user, email) => {
    console.log(`   📧 ${email}: ${user.name} (${user.remainingMinutes} דקות, Admin: ${user.isAdmin})`);
  });
}

// Initialize demo users
function initializeDemoUsers() {
    // יצירת מנהל
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
    
    // יצירת משתמש לבדיקה
    users.set('test@example.com', {
        id: 'test123',
        name: 'משתמש לבדיקה',
        email: 'test@example.com',
        password: 'test123',
        phone: '',
        remainingMinutes: 10,
        totalTranscribed: 0,
        isAdmin: false,
        history: [],
        createdAt: new Date()
    });
    
    console.log('👑 Admin user created: admin@example.com / admin123');
    console.log('👤 Test user created: test@example.com / test123');
    debugListUsers();
}


// Audio duration extraction
async function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0 && output) {
        const duration = parseFloat(output.trim());
        resolve(Math.ceil(duration / 60));
      } else {
        const stats = fs.statSync(filePath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        resolve(Math.max(1, Math.ceil(fileSizeInMB / 2)));
      }
    });

    ffprobe.on('error', () => {
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      resolve(Math.max(1, Math.ceil(fileSizeInMB / 2)));
    });
  });
}

// Convert audio for Gemini
async function convertAudioForGemini(inputPath) {
  return new Promise((resolve) => {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '_converted.wav');
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      resolve(code === 0 ? outputPath : inputPath);
    });

    ffmpeg.on('error', () => {
      resolve(inputPath);
    });
  });
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
      remainingMinutes: 30, // Free minutes for new users
      totalTranscribed: 0,
      isAdmin: false,
      history: [],
      createdAt: new Date()
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
        const duration = await getAudioDuration(file.path);
        totalMinutes += duration;
        fileInfos.push({ file, duration });
    }
    
    if (totalMinutes > user.remainingMinutes) {
      return res.status(400).json({ 
        success: false,
        error: 'אין מספיק דקות בחשבון',
        needed: totalMinutes,
        available: user.remainingMinutes
      });
    }
    
    const jobId = Date.now().toString();
    console.log(`🚀 Starting transcription job: ${jobId}`);
    
    // Start processing asynchronously
    processTranscriptionJob(jobId, fileInfos, user, language);
    
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
    console.log('🔧 Admin add minutes request received');
    console.log('🔧 Request body:', req.body);
    
    debugListUsers(); // הדפס רשימת משתמשים
    
    const { userEmail, minutes } = req.body;
    
    if (!userEmail || !minutes) {
        console.log('❌ Missing fields:', { userEmail, minutes });
        return res.status(400).json({ 
            success: false, 
            error: 'חסרים פרטים: אימייל משתמש ומספר דקות' 
        });
    }
    
    const user = users.get(userEmail);
    console.log('🔧 Found user:', user ? 'YES' : 'NO');
    
    if (!user) {
        console.log('❌ User not found:', userEmail);
        console.log('🔧 Available users:', Array.from(users.keys()));
        return res.status(404).json({ 
            success: false, 
            error: `משתמש עם אימייל ${userEmail} לא נמצא` 
        });
    }
    
    const minutesToAdd = parseInt(minutes);
    if (isNaN(minutesToAdd) || minutesToAdd <= 0) {
        console.log('❌ Invalid minutes:', minutes);
        return res.status(400).json({ 
            success: false, 
            error: 'מספר הדקות חייב להיות מספר חיובי' 
        });
    }
    
    const oldBalance = user.remainingMinutes;
    user.remainingMinutes += minutesToAdd;
    
    console.log(`✅ Added ${minutesToAdd} minutes to ${userEmail}`);
    console.log(`   Old balance: ${oldBalance}, New balance: ${user.remainingMinutes}`);
    
    res.json({
        success: true,
        message: `נוספו ${minutesToAdd} דקות למשתמש ${userEmail}`,
        newBalance: user.remainingMinutes
    });
});


app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working!',
    timestamp: new Date().toISOString()
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
    transcriptionJobs.set(jobId, { status: 'processing', progress: 0 });
    
    const transcriptions = [];
    
    for (let i = 0; i < fileInfos.length; i++) {
      const { file, duration } = fileInfos[i];
      
      transcriptionJobs.set(jobId, { 
        status: 'processing', 
        progress: (i / fileInfos.length) * 80 
      });
      
      try {
        console.log(`🎵 Processing: ${file.originalname}`);
        const convertedPath = await convertAudioForGemini(file.path);
        const transcription = await realGeminiTranscription(convertedPath, file.originalname, language);
        // השתמש בשם הקובץ המקורי (הלא מקודד) ליצירת המסמך
        const originalFileName = Buffer.from(file.filename.split('_').slice(1).join('_'), 'utf8').toString();
        const wordDoc = await createWordDocument(transcription, originalFileName, duration);
        
        transcriptions.push({
          filename: originalFileName,
          wordDoc: wordDoc,
          duration: duration
        });
        
        // Cleanup
        if (convertedPath !== file.path && fs.existsSync(convertedPath)) {
          fs.unlinkSync(convertedPath);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.originalname}:`, error);
        transcriptions.push({
          filename: file.originalname,
          error: error.message,
          duration: duration
        });
      }
    }
    
    const successfulTranscriptions = transcriptions.filter(t => !t.error);
    
    if (successfulTranscriptions.length > 0) {
      await sendTranscriptionEmail(user.email, successfulTranscriptions);
    }
    
    // Update user stats
    const successfulMinutes = successfulTranscriptions.reduce((sum, t) => sum + t.duration, 0);
    user.remainingMinutes -= successfulMinutes;
    user.totalTranscribed += successfulMinutes;
    
    // Add to history
    transcriptions.forEach((trans, index) => {
      user.history.push({
        id: `${jobId}-${index}`,
        date: new Date().toLocaleDateString('he-IL'),
        fileName: trans.filename,
        duration: trans.duration,
        language: language,
        status: trans.error ? 'failed' : 'completed',
        jobId: jobId
      });
    });
    
    transcriptionJobs.set(jobId, { status: 'completed', progress: 100 });
    
    // Cleanup uploaded files
    fileInfos.forEach(({ file }) => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    
    console.log(`🎉 Job ${jobId} completed`);
    
  } catch (error) {
    console.error('Job processing error:', error);
    transcriptionJobs.set(jobId, { status: 'failed', error: error.message });
  }
}

async function realGeminiTranscription(filePath, filename, language) {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      throw new Error('Gemini API key לא הוגדר');
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
    });
    
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav'; // Default for converted files
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.m4a') mimeType = 'audio/mp4';

    const prompt = `תמלל את קובץ האודיו במלואו, מההתחלה ועד הסוף. זהו שיעור תורני בעברית עם הגיה ליטאית ומושגים בארמית.
- תמלל כל מילה ומילה שנאמרת.
- אל תסכם או תקצר דבר.
- שמור על מבנה של פסקאות, והשאר שורה ריקה בין כל פסקה.
- סמן ציטוטים במירכאות (לדוגמה: "שנאמר...", "כדאיתא בגמרא...").
- התחל כעת ותמלל את הקובץ בשלמותו.`;

    console.log(`🎯 Starting Gemini transcription: ${filename}`);

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
    
    if (!transcription || transcription.length < 20) {
      throw new Error('התמלול נכשל או שהתקבל טקסט קצר מדי');
    }
    
    console.log(`✅ Transcription completed: ${transcription.length} chars`);
    return transcription;
    
  } catch (error) {
    console.error('Gemini error:', error);
    throw new Error(`שגיאה בתמלול מול Gemini: ${error.message}`);
  }
}

// =========================================================
//  FIX: Improved Word document creation function
// =========================================================
async function createWordDocument(transcription, filename, duration) {
  try {
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "תמלול אוטומטי",
                bold: true,
                size: 36, // Font size in half-points
                font: { name: "David" }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new Paragraph({
            children: [ new TextRun({ text: `שם הקובץ: ${filename}`, size: 24, font: { name: "David" }, rightToLeft: true }) ],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [ new TextRun({ text: `משך זמן: ${duration} דקות`, size: 24, font: { name: "David" }, rightToLeft: true }) ],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [ new TextRun({ text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`, size: 24, font: { name: "David" }, rightToLeft: true }) ],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 600 }
          }),
          ...processTranscriptionContent(transcription)
        ]
      }]
    });
    
    return await Packer.toBuffer(doc);
    
  } catch (error) {
    console.error('Word doc error:', error);
    throw error;
  }
}

// =========================================================
//  FIX: Improved transcription processing for Word
// =========================================================
function processTranscriptionContent(transcription) {
  const paragraphs = [];
  
  // Split text into paragraphs based on one or more newlines
  const sections = transcription
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .filter(section => section.trim().length > 0);
  
  sections.forEach(section => {
    const trimmedSection = section.trim();
    
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: trimmedSection,
          size: 24, // 12pt font
          font: { name: "David" },
          rightToLeft: true
        })
      ],
      // Ensure Right-to-Left alignment for Hebrew
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 } // Spacing after each paragraph
    }));
  });
  
  return paragraphs;
}


// =========================================================
//  FIX: Improved email function with correct filename handling
// =========================================================
async function sendTranscriptionEmail(userEmail, transcriptions) {
  try {
    console.log(`📧 Preparing email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => ({
      // Use the clean filename for the attachment
      filename: `תמלול_${trans.filename.replace(/\.[^/.]+$/, '')}.docx`,
      content: trans.wordDoc,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }));

    const mailOptions = {
      from: `"תמלול חכם" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: '✅ התמלול שלך מוכן!',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
          <h2>שלום,</h2>
          <p>התמלול שביקשת הושלם בהצלחה.</p>
          <p>מצורפים קבצי ה-Word:</p>
          <ul>
            ${transcriptions.map(t => `<li>📄 ${t.filename}</li>`).join('')}
          </ul>
          <p>תודה שהשתמשת במערכת התמלול החכמה.</p>
        </div>
      `,
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to: ${userEmail}`);
    
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
}

// Initialize and start server
initializeDemoUsers();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Access: http://localhost:${PORT}`);
});
