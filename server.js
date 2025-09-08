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

console.log('🚀 Starting transcription server...');

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
    const extension = path.extname(file.originalname);
    // Fix Hebrew encoding
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${safeName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

console.log('📁 Multer configured');

// Initialize Gemini AI
let genAI;
try {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('🤖 Gemini AI initialized');
  } else {
    console.log('⚠️ Gemini API key not configured');
  }
} catch (error) {
  console.error('❌ Gemini AI initialization failed:', error);
}

// Configure email transporter - FIXED!
let transporter;
try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    console.log('📧 Email transporter configured');
  } else {
    console.log('⚠️ Email credentials not configured');
  }
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
    phone: '050-1234567',
    remainingMinutes: 1000,
    totalTranscribed: 150,
    isAdmin: true,
    history: [],
    createdAt: new Date()
  });

  users.set('test@example.com', {
    id: 'user1',
    name: 'משתמש בדיקה',
    email: 'test@example.com',
    password: 'test123',
    phone: '050-7654321',
    remainingMinutes: 45,
    totalTranscribed: 25,
    isAdmin: false,
    history: [],
    createdAt: new Date()
  });

  console.log('✅ Demo users initialized');
}

// Simple duration estimation (no FFmpeg dependency)
function getAudioDuration(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    // Estimate: 1-2MB per minute of audio
    const estimatedMinutes = Math.max(1, Math.ceil(fileSizeInMB / 1.5));
    return estimatedMinutes;
  } catch (error) {
    console.error('Duration estimation error:', error);
    return 5; // Default fallback
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
    console.log(`📁 Files uploaded: ${files ? files.length : 0}`);
    
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
      console.log(`📊 File: ${file.originalname}, estimated duration: ${duration} minutes`);
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
    console.log('🔧 Admin add minutes request');
    console.log('🔧 Request body:', req.body);
    
    const { userEmail, minutes } = req.body;
    
    if (!userEmail || !minutes) {
      return res.status(400).json({ 
        success: false, 
        error: 'חסרים פרטים: אימייל משתמש ומספר דקות' 
      });
    }
    
    const user = users.get(userEmail);
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
      oldBalance: oldBalance,
      newBalance: user.remainingMinutes
    });
  } catch (error) {
    console.error('Admin add minutes error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהוספת דקות' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    geminiConfigured: !!genAI,
    emailConfigured: !!transporter,
    users: users.size,
    version: '1.0.0'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working perfectly!',
    timestamp: new Date().toISOString(),
    users: users.size
  });
});

// Static files
app.use(express.static('.'));

// Catch-all route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// HELPER FUNCTIONS
async function processTranscriptionJob(jobId, fileInfos, user, language) {
  try {
    console.log(`🎯 Processing transcription job ${jobId} with ${fileInfos.length} files`);
    transcriptionJobs.set(jobId, { status: 'processing', progress: 0 });
    
    const transcriptions = [];
    
    for (let i = 0; i < fileInfos.length; i++) {
      const { file, duration } = fileInfos[i];
      
      transcriptionJobs.set(jobId, { 
        status: 'processing', 
        progress: (i / fileInfos.length) * 80 
      });
      
      try {
        console.log(`🎵 Processing file: ${file.originalname}`);
        
        if (!genAI) {
          throw new Error('Gemini AI not configured');
        }
        
        const transcription = await realGeminiTranscription(file.path, file.originalname, language);
        const wordDoc = await createWordDocument(transcription, file.originalname, duration);
        
        transcriptions.push({
          filename: file.originalname,
          wordDoc: wordDoc,
          transcription: transcription,
          duration: duration
        });
        
        console.log(`✅ Completed processing: ${file.originalname}`);
        
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
    
    if (successfulTranscriptions.length > 0 && transporter) {
      console.log(`📧 Sending email with ${successfulTranscriptions.length} documents`);
      await sendTranscriptionEmail(user.email, successfulTranscriptions);
    } else if (!transporter) {
      console.log('⚠️ Email not configured, skipping email send');
    }
    
    // Update user balance
    const successfulMinutes = successfulTranscriptions.reduce((sum, t) => sum + t.duration, 0);
    user.remainingMinutes -= successfulMinutes;
    user.totalTranscribed += successfulMinutes;
    
    // Add to history
    transcriptions.forEach((trans, index) => {
      user.history.push({
        id: Date.now() + index,
        date: new Date().toLocaleDateString('he-IL'),
        fileName: trans.filename,
        duration: trans.duration,
        language: language,
        status: trans.error ? 'failed' : 'completed',
        jobId: jobId,
        error: trans.error
      });
    });
    
    transcriptionJobs.set(jobId, { 
      status: 'completed', 
      progress: 100,
      successful: successfulTranscriptions.length,
      failed: transcriptions.length - successfulTranscriptions.length
    });
    
    // Cleanup uploaded files
    fileInfos.forEach(({ file }) => {
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (error) {
        console.error('File cleanup error:', error);
      }
    });
    
    console.log(`🎉 Transcription job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error('Job processing error:', error);
    transcriptionJobs.set(jobId, { status: 'failed', error: error.message });
  }
}

async function realGeminiTranscription(filePath, filename, language) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    });
    
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.m4a') mimeType = 'audio/mp4';
    else if (ext === '.mov') mimeType = 'video/quicktime';

    const prompt = `תמלל את כל הקובץ האודיו הבא לעברית בצורה מלאה ומדויקת. זהו רב המדבר בעברית עם הגיה ליטאית ומשלב מושגים בארמית.

🔴 חשוב מאוד - תמלל הכל מההתחלה עד הסוף:
1. אל תקצר או תסכם כלום
2. תמלל כל מילה שנאמרת
3. אם הקובץ ארוך - המשך עד הסוף המוחלט
4. חלק לפסקאות של 2-3 משפטים
5. השאר שורה ריקה בין פסקאות

עיצוב הטקסט:
- כל משפט מסתיים בנקודה
- אם יש דובר חדש, כתוב "רב:" או "שואל:" רק אם זה ברור

ציטוטים במירכאות:
- "שנאמר..."
- "כדאיתא בגמרא..."
- "אמרו חכמים..."
- "כמו שכתוב..."
- "תניא..."
- "כדכתיב..."

זכור: תמלל הכל! אל תקצר! המשך עד הסוף המוחלט של הקובץ!

התחל עכשיו:`;

    console.log(`🎯 Starting Gemini transcription for: ${filename}`);

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
    
    console.log(`🎯 Raw transcription length: ${transcription.length} characters`);
    
    // Clean up text
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .replace(/([.!?])\s*([א-ת])/g, '$1 $2')
      .trim();
    
    if (!transcription || transcription.length < 50) {
      throw new Error('התמלול נכשל - טקסט קצר מדי או ריק');
    }
    
    console.log(`✅ Transcription completed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('🔥 Gemini transcription error:', error);
    
    if (error.message.includes('API key')) {
      throw new Error('שגיאה באימות Gemini API');
    } else if (error.message.includes('quota')) {
      throw new Error('הגעת למגבלת השימוש ב-Gemini API');
    } else {
      throw new Error(`שגיאה בתמלול: ${error.message}`);
    }
  }
}

async function createWordDocument(transcription, filename, duration) {
  try {
    console.log(`📄 Creating Word document for: ${filename}`);
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "תמלול אוטומטי",
                bold: true,
                size: 32,
                font: {
                  name: "David"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 400,
              line: 360
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `שם הקובץ: ${filename}`,
                size: 24,
                font: {
                  name: "David"
                }
              })
            ],
            spacing: { 
              after: 200,
              line: 360
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `משך זמן: ${duration} דקות`,
                size: 24,
                font: {
                  name: "David"
                }
              })
            ],
            spacing: { 
              after: 200,
              line: 360
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
                size: 24,
                font: {
                  name: "David"
                }
              })
            ],
            spacing: { 
              after: 400,
              line: 360
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: "─".repeat(50),
                size: 20,
                font: {
                  name: "David"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 400,
              line: 360
            }
          }),
          
          ...processTranscriptionContent(transcription)
        ]
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    console.log(`✅ Word document created successfully for: ${filename}`);
    return buffer;
    
  } catch (error) {
    console.error('Error creating Word document:', error);
    throw error;
  }
}

function processTranscriptionContent(transcription) {
  const paragraphs = [];
  
  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  const sections = cleanedText.split(/\n\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0);
  
  sections.forEach(section => {
    section = section.replace(/\n+/g, ' ').trim();
    
    if (!section.endsWith('.') && !section.endsWith('!') && !section.endsWith('?') && !section.endsWith(':')) {
      section += '.';
    }
    
    // Check if this is a speaker line
    const isSpeakerLine = /^(רב|הרב|שואל|תשובה|שאלה|המשיב|התלמיד|השואל|מרצה|דובר)\s*:/.test(section.trim());
    
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: section,
          size: 24,
          font: {
            name: "David"
          },
          bold: isSpeakerLine
        })
      ],
      spacing: { 
        before: isSpeakerLine ? 400 : 200,
        after: 300,
        line: 400
      }
    }));
  });
  
  return paragraphs;
}

async function sendTranscriptionEmail(userEmail, transcriptions) {
  try {
    console.log(`📧 Preparing email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => ({
      filename: `תמלול_${trans.filename.replace(/\.[^/.]+$/, '')}.docx`,
      content: trans.wordDoc,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }));

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: '✅ התמלול הושלם בהצלחה',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>🎯 התמלול הושלם בהצלחה!</h2>
          <p>שלום,</p>
          <p>התמלול שלך הושלם. מצורפים הקבצים:</p>
          <ul>
            ${transcriptions.map(t => `<li>📄 ${t.filename}</li>`).join('')}
          </ul>
          <p><strong>💫 תמלול מותאם במיוחד לעברית עם הגיה ליטאית ומושגי ארמית</strong></p>
          <p>הקבצים נוצרו במיוחד עבורך על ידי מערכת Gemini 2.5 Pro המתקדמת.</p>
          <p>בברכה,<br>מערכת התמלול החכמה</p>
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

// Initialize demo users and start server
initializeDemoUsers();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Access: http://localhost:${PORT}`);
  console.log(`📧 Email configured: ${!!transporter}`);
  console.log(`🤖 Gemini configured: ${!!genAI}`);
  console.log('📊 Demo users available:');
  console.log('   👨‍💼 Admin: admin@example.com / admin123');
  console.log('   👤 User: test@example.com / test123');
  console.log('✅ Server ready and waiting for requests!');
});
