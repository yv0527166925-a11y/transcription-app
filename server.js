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
  limits: { fileSize: 500 * 1024 * 1024 }
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// In-memory database
const users = new Map();
const transcriptionJobs = new Map();

// Audio duration extraction utility
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
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
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(Math.ceil(duration / 60));
      } else {
        const stats = fs.statSync(filePath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        const estimatedMinutes = Math.ceil(fileSizeInMB / 2);
        resolve(estimatedMinutes);
      }
    });

    ffprobe.on('error', (err) => {
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      const estimatedMinutes = Math.ceil(fileSizeInMB / 2);
      resolve(estimatedMinutes);
    });
  });
}

// Convert audio/video to compatible format for Gemini
async function convertAudioForGemini(inputPath) {
  return new Promise((resolve, reject) => {
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
      if (code === 0) {
        resolve(outputPath);
      } else {
        resolve(inputPath);
      }
    });

    ffmpeg.on('error', (err) => {
      resolve(inputPath);
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

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
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

app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
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
      try {
        const duration = await getAudioDuration(file.path);
        totalMinutes += duration;
        fileInfos.push({ file, duration });
      } catch (error) {
        const estimatedDuration = 5;
        totalMinutes += estimatedDuration;
        fileInfos.push({ file, duration: estimatedDuration });
      }
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
    processTranscriptionJob(jobId, fileInfos, user, language, totalMinutes);
    
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
  const { adminEmail, userEmail, minutes } = req.body;
  
  const admin = users.get(adminEmail);
  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ success: false, error: 'אין הרשאת מנהל' });
  }
  
  const user = users.get(userEmail);
  if (!user) {
    return res.status(404).json({ success: false, error: 'משתמש לא נמצא' });
  }
  
  user.remainingMinutes += parseInt(minutes);
  
  res.json({
    success: true,
    message: `נוספו ${minutes} דקות למשתמש ${userEmail}`,
    newBalance: user.remainingMinutes
  });
});

app.get('/api/job/:jobId', (req, res) => {
  const job = transcriptionJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'עבודה לא נמצאה' });
  }
  res.json(job);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
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

// Catch-all route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// HELPER FUNCTIONS

// Process transcription job asynchronously
async function processTranscriptionJob(jobId, fileInfos, user, language, totalMinutes) {
  try {
    transcriptionJobs.set(jobId, { status: 'processing', progress: 0 });
    
    const transcriptions = [];
    
    for (let i = 0; i < fileInfos.length; i++) {
      const { file, duration } = fileInfos[i];
      
      transcriptionJobs.set(jobId, { 
        status: 'processing', 
        progress: (i / fileInfos.length) * 80 
      });
      
      try {
        const convertedPath = await convertAudioForGemini(file.path);
        const transcription = await realGeminiTranscription(convertedPath, file.originalname, language);
        const wordDoc = await createWordDocument(transcription, file.originalname, duration);
        
        transcriptions.push({
          filename: file.originalname,
          wordDoc: wordDoc,
          transcription: transcription,
          duration: duration
        });
        
        if (convertedPath !== file.path && fs.existsSync(convertedPath)) {
          fs.unlinkSync(convertedPath);
        }
        
      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        transcriptions.push({
          filename: file.originalname,
          error: error.message,
          duration: duration
        });
      }
    }
    
    transcriptionJobs.set(jobId, { status: 'processing', progress: 90 });
    
    const successfulTranscriptions = transcriptions.filter(t => !t.error);
    
    if (successfulTranscriptions.length > 0) {
      await sendTranscriptionEmail(user.email, successfulTranscriptions);
    }
    
    const successfulMinutes = successfulTranscriptions.reduce((sum, t) => sum + t.duration, 0);
    user.remainingMinutes -= successfulMinutes;
    user.totalTranscribed += successfulMinutes;
    
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
    
    fileInfos.forEach(({ file }) => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    
  } catch (error) {
    console.error('Job processing error:', error);
    transcriptionJobs.set(jobId, { status: 'failed', error: error.message });
  }
}

// Real Gemini 2.5 Pro transcription with IMPROVED prompt for better formatting
async function realGeminiTranscription(filePath, filename, language) {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      throw new Error('Gemini API key לא הוגדר');
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.m4a') mimeType = 'audio/mp4';
    else if (ext === '.mov') mimeType = 'video/quicktime';

    const prompt = `תמלל את הקובץ האודיו הבא לעברית בלבד. זהו רב המדבר בעברית עם הגיה ליטאית ומשלב מושגים בארמית.

חשוב מאוד - הנחיות מדויקות לתמלול:

דרישות יסוד:
1. תמלל רק בעברית - אל תתרגם לשפות אחרות
2. שמור על ההגיה הליטאית המיוחדת
3. כתוב מושגים ארמיים בכתיב המקורי
4. הוסף סימני פיסוק מדויקים
5. כתוב בצורה נקייה וברורה

מבנה הטקסט (חשוב מאוד!):
- חלק את התוכן לפסקאות קצרות (3-5 משפטים בכל פסקה)
- השאר שורה ריקה בין כל פסקה לפסקה
- כל משפט צריך להסתיים בנקודה, סימן קריאה או סימן שאלה
- אל תכתוב משפטים ארוכים מדי - חלק למשפטים קצרים וברורים

ציטוטים מהמקורות:
שים במירכאות כל ביטוי שמתחיל ב:
- "שנאמר..."
- "כדאיתא בגמרא..."
- "אמרו חכמים..."
- "כמו שכתוב..."
- "תניא..."
- "כדכתיב..."
- "משנה במסכת..."
- "וכתוב..."
- "כמאמר חז״ל..."
- "דאמר..."

דוגמה לפורמט הנכון:
רב מסביר את הנושא ואומר "שנאמר בתורה כך וכך". זה הסבר חשוב.

הוא ממשיך ומוסיף שיש לדעת את הדין. "כדאיתא בגמרא במסכת ברכות" יש דיון נוסף בנושא.

זהו המשך ההסבר בנושא.

זיהוי דוברים:
- רק אם אתה שומע בבירור "רב אומר" או "שואל שואל" - אז כתוב זאת
- אחרת פשוט תמלל את התוכן ברציפות ללא זיהוי דוברים

התחל את התמלול בדיוק לפי הפורמט שהראיתי:`;

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
    
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .replace(/([.!?])\s*([א-ת])/g, '$1 $2')
      .trim();
    
    transcription = cleanupQuotations(transcription);
    transcription = transcription.replace(/([א-ת])\n\n/g, '$1.\n\n');
    
    if (!transcription || transcription.length < 10) {
      throw new Error('התמלול לא הצליח - קובץ ריק או לא זוהה תוכן');
    }
    
    return transcription;
    
  } catch (error) {
    console.error('Gemini transcription error:', error);
    
    if (error.message.includes('API key')) {
      throw new Error('שגיאה באימות Gemini API');
    } else if (error.message.includes('quota')) {
      throw new Error('הגעת למגבלת השימוש ב-Gemini API');
    } else if (error.message.includes('format')) {
      throw new Error('פורמט הקובץ אינו נתמך');
    } else {
      throw new Error(`שגיאה בתמלול: ${error.message}`);
    }
  }
}

// פונקציה לניקוי ושיפור מירכאות בתמלול
function cleanupQuotations(text) {
  text = text.replace(/״([^״]+)״/g, '"$1"');
  text = text.replace(/׳([^׳]+)׳/g, '"$1"');
  text = text.replace(/"/g, '"').replace(/"/g, '"');
  text = text.replace(/""+/g, '"');
  text = text.replace(/\s+"/g, ' "');
  text = text.replace(/"\s+/g, '" ');
  
  const quotes = text.match(/"/g);
  if (quotes && quotes.length % 2 !== 0) {
    text += '"';
  }
  
  return text;
}

// Create formatted Word document - IMPROVED FORMATTING
async function createWordDocument(transcription, filename, duration) {
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
                name: "David",
                hint: "default"
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
                name: "David",
                hint: "default"
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
                name: "David",
                hint: "default"
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
                name: "David",
                hint: "default"
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
                name: "David",
                hint: "default"
              }
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { 
            after: 400,
            line: 360
          }
        }),
        
        ...processTranscriptionContentImproved(transcription)
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}

// פונקציה משופרת לעיבוד תוכן התמלול
function processTranscriptionContentImproved(transcription) {
  const paragraphs = [];
  
  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  const sections = cleanedText.split(/(?:\n\s*\n)|(?:\.\s*(?=[א-ת]))/g)
    .map(section => section.trim())
    .filter(section => section.length > 0);
  
  for (let i = 0; i < sections.length; i++) {
    let section = sections[i];
    
    section = section.replace(/\n+/g, ' ').trim();
    
    if (section.length < 50 && i < sections.length - 1) {
      sections[i + 1] = section + '. ' + sections[i + 1];
      continue;
    }
    
    if (!section.endsWith('.') && !section.endsWith('!') && !section.endsWith('?') && !section.endsWith(':')) {
      section += '.';
    }
    
    section = addQuotationMarksImproved(section);
    
    if (isSpeakerLineImproved(section)) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: section,
            size: 24,
            font: {
              name: "David",
              hint: "default"
            },
            bold: true
          })
        ],
        spacing: { 
          before: 400,
          after: 200,
          line: 360
        }
      }));
    } else {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: section,
            size: 24,
            font: {
              name: "David",
              hint: "default"
            }
          })
        ],
        spacing: { 
          before: 200,
          after: 300,
          line: 400
        }
      }));
    }
  }
  
  return paragraphs;
}

// פונקציה משופרת לזיהוי שורות דוברים
function isSpeakerLineImproved(line) {
  const speakerPatterns = [
    /^רב\s*:/,
    /^הרב\s*:/,
    /^שואל\s*:/,
    /^תשובה\s*:/,
    /^שאלה\s*:/,
    /^המשיב\s*:/,
    /^התלמיד\s*:/,
    /^השואל\s*:/,
    /^מרצה\s*:/,
    /^דובר\s+\d+\s*:/,
    /^[א-ת]{2,10}\s*:/
  ];
  
  return speakerPatterns.some(pattern => pattern.test(line.trim()));
}

// פונקציה משופרת להוספת מירכאות לציטוטים
function addQuotationMarksImproved(text) {
  const citationPatterns = [
    {
      pattern: /(כדאיתא\s+ב[א-ת\s,():.״״׳׳0-9]+?)(?=\s|$|\.)/gi,
      addQuotes: true
    },
    {
      pattern: /(כמו\s+שכתוב\s+ב[א-ת\s,():.״״׳׳0-9]+?)(?=\s|$|\.)/gi,
      addQuotes: true
    },
    {
      pattern: /(שנאמר\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(כמאמר\s+חז״ל\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(אמרו\s+חכמים\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(תניא\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(דאמר\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(כדכתיב\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(והיינו\s+דאמר\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(וכתוב\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(כמו\s+שנאמר\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(שכתוב\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(כתיב\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(משנה\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(ברייתא\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(תוספתא\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(מתני׳\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    },
    {
      pattern: /(גמ׳\s+[^.!?]*?)(?=\.|$)/gi,
      addQuotes: true
    }
  ];
  
  citationPatterns.forEach(({pattern, addQuotes}) => {
    if (addQuotes) {
      text = text.replace(pattern, (match) => {
        const trimmed = match.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return match;
        }
        return `"${trimmed}"`;
      });
    }
  });
  
  return text;
}

// Send transcription email
async function sendTranscriptionEmail(email, transcriptions) {
  const attachments = transcriptions.map((trans, index) => ({
    filename: `${trans.filename.replace(/\.[^/.]+$/, "")}_תמלול.docx`,
    content: trans.wordDoc
  }));
  
  const totalMinutes = transcriptions.reduce((sum, trans) => sum + trans.duration, 0);
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: '🎯 התמלול שלך מוכן! (Gemini 2.5 Pro)',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🎯 התמלול הושלם בהצלחה!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">מופק על ידי Gemini 2.5 Pro</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <p style="font-size: 16px; margin-bottom: 20px;">שלום,</p>
          
          <p style="font-size: 16px; margin-bottom: 25px;">
            התמ
