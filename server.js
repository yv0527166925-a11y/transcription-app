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

// Middleware - ORDER MATTERS!
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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for large files
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

// In-memory database (replace with real database in production)
const users = new Map();
const transcriptionJobs = new Map();

// Audio duration extraction utility
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    // Using ffprobe to get duration
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
        resolve(Math.ceil(duration / 60)); // Return duration in minutes (rounded up)
      } else {
        // Fallback: estimate based on file size (rough estimation)
        const stats = fs.statSync(filePath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        const estimatedMinutes = Math.ceil(fileSizeInMB / 2); // Very rough estimate
        resolve(estimatedMinutes);
      }
    });

    ffprobe.on('error', (err) => {
      console.warn('ffprobe not available, using file size estimation');
      // Fallback estimation
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
    
    // Convert to WAV format that Gemini can process
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000', // 16kHz sample rate
      '-ac', '1',     // Mono
      '-c:a', 'pcm_s16le', // PCM 16-bit
      '-y',           // Overwrite output file
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        // If ffmpeg fails, try to use original file
        console.warn('FFmpeg conversion failed, trying original file');
        resolve(inputPath);
      }
    });

    ffmpeg.on('error', (err) => {
      console.warn('FFmpeg not available, using original file');
      resolve(inputPath);
    });
  });
}

// =================================
// API ROUTES - MUST BE FIRST!
// =================================

// User registration
app.post('/api/register', (req, res) => {
  console.log('Register request received:', req.body);
  
  const { name, email, password, phone } = req.body;
  
  if (users.has(email)) {
    return res.status(400).json({ success: false, error: 'משתמש עם אימייל זה כבר קיים' });
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
  
  console.log('User registered successfully:', email);
  
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

// User login
app.post('/api/login', (req, res) => {
  console.log('Login request received:', req.body);
  
  const { email, password } = req.body;
  
  const user = users.get(email);
  if (!user || user.password !== password) {
    console.log('Login failed for:', email);
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
  }
  
  console.log('Login successful for:', email);
  
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
  console.log('Transcription request received');
  
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
    
    // Calculate actual duration for all files
    let totalMinutes = 0;
    const fileInfos = [];
    
    for (const file of files) {
      try {
        const duration = await getAudioDuration(file.path);
        totalMinutes += duration;
        fileInfos.push({ file, duration });
      } catch (error) {
        console.error('Error getting duration for', file.originalname, error);
        // Fallback estimation
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
    
    // Start async processing
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

// Admin: Add minutes to user
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

// Check job status
app.get('/api/job/:jobId', (req, res) => {
  const job = transcriptionJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'עבודה לא נמצאה' });
  }
  
  res.json(job);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  });
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});

// =================================
// STATIC FILES - AFTER API ROUTES
// =================================

app.use(express.static('.'));

// =================================
// CATCH-ALL ROUTE - MUST BE LAST!
// =================================

app.get('*', (req, res) => {
  // Don't intercept API calls
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Serve the main HTML file for all other routes
  res.sendFile(path.join(__dirname, 'index.html'));
});

// =================================
// HELPER FUNCTIONS
// =================================

// Process transcription job asynchronously
async function processTranscriptionJob(jobId, fileInfos, user, language, totalMinutes) {
  try {
    transcriptionJobs.set(jobId, { status: 'processing', progress: 0 });
    
    const transcriptions = [];
    
    for (let i = 0; i < fileInfos.length; i++) {
      const { file, duration } = fileInfos[i];
      
      // Update progress
      transcriptionJobs.set(jobId, { 
        status: 'processing', 
        progress: (i / fileInfos.length) * 80 
      });
      
      try {
        // Convert audio to compatible format
        const convertedPath = await convertAudioForGemini(file.path);
        
        // Real transcription with Gemini 2.5 Pro
        const transcription = await realGeminiTranscription(convertedPath, file.originalname, language);
        
        // Create Word document
        const wordDoc = await createWordDocument(transcription, file.originalname, duration);
        
        transcriptions.push({
          filename: file.originalname,
          wordDoc: wordDoc,
          transcription: transcription,
          duration: duration
        });
        
        // Clean up converted file if different from original
        if (convertedPath !== file.path && fs.existsSync(convertedPath)) {
          fs.unlinkSync(convertedPath);
        }
        
      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        // Add error entry to transcriptions
        transcriptions.push({
          filename: file.originalname,
          error: error.message,
          duration: duration
        });
      }
    }
    
    // Update progress
    transcriptionJobs.set(jobId, { status: 'processing', progress: 90 });
    
    // Filter successful transcriptions for email
    const successfulTranscriptions = transcriptions.filter(t => !t.error);
    
    if (successfulTranscriptions.length > 0) {
      // Send email with attachments
      await sendTranscriptionEmail(user.email, successfulTranscriptions);
    }
    
    // Update user account (only for successful transcriptions)
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
    
    // Complete job
    transcriptionJobs.set(jobId, { 
      status: 'completed', 
      progress: 100,
      successful: successfulTranscriptions.length,
      failed: transcriptions.length - successfulTranscriptions.length
    });
    
    // Clean up uploaded files
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

// Real Gemini 2.5 Pro transcription with improved citation handling
async function realGeminiTranscription(filePath, filename, language) {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      throw new Error('Gemini API key לא הוגדר');
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // Read audio file as base64
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.m4a') mimeType = 'audio/mp4';
    else if (ext === '.mov') mimeType = 'video/quicktime';

    // Enhanced prompt for Hebrew with Lithuanian pronunciation and Aramaic terms
    const prompt = `תמלל את הקובץ האודיו הבא לעברית בלבד. זהו רב המדבר בעברית עם הגיה ליטאית ומשלב מושגים בארמית.

הנחיות חשובות לתמלול:

כללי:
1. תמלל רק בעברית - אל תתרגם לשפות אחרות
2. שמור על ההגיה הליטאית המיוחדת (למשל: "א" נהגית כמו "אה", "ו" כמו "או")
3. כתוב מושגים ארמיים בכתיב המקורי (למשל: אבא, אמא, רבנן, תנא קמא)
4. הוסף סימני פיסוק מדויקים
5. חלק לפסקאות לוגיות ברורות
6. תקן שגיאות דקדוק קלות אך שמור על הסגנון המקורי

זיהוי דוברים:
- אל תוסיף זיהוי דוברים אלא אם הם מוזכרים באופן ברור
- אם יש שינוי דובר ברור, התחל פסקה חדשה
- אם אין זיהוי ברור של דוברים, פשוט תמלל את התוכן ברציפות

ציטוטים מהמקורות (חשוב מאוד!):
- כל ציטוט מהתלמוד, משנה, מקרא או מאמרי חז"ל - שים במירכאות
- דוגמאות לציטוטים לשים במירכאות:
  • "שנאמר..." 
  • "כדאיתא בגמרא..."
  • "אמרו חכמים..."
  • "כמו שכתוב..."
  • "תניא..."
  • "כדכתיב..."
  • "משנה במסכת..."
  • "וכתוב..."
  • "כמאמר חז״ל..."
  • "דאמר..."
- אל תשים במירכאות: הסברים, פירושים, או דעות אישיות של הרב

עיצוב הטקסט:
- שמור על טון רשמי ומכובד המתאים לדברי רב
- חלק לפסקאות מובחנות לפי נושאים
- אם יש מילים לא ברורות, ציין [לא ברור] במקום לנחש
- אל תוסיף כותרות או עיצובים מיוחדים - רק התוכן הנתמלל

התחל את התמלול עכשיו:`;

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
    
    // Post-processing for better formatting
    transcription = transcription
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/^\s+|\s+$/gm, '') // Trim whitespace from lines
      .trim();
    
    // Additional cleanup for quotation marks
    transcription = cleanupQuotations(transcription);
    
    if (!transcription || transcription.length < 10) {
      throw new Error('התמלול לא הצליח - קובץ ריק או לא זוהה תוכן');
    }
    
    return transcription;
    
  } catch (error) {
    console.error('Gemini transcription error:', error);
    
    // More specific error messages
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
  // תיקון מירכאות לא סדירות
  text = text.replace(/״([^״]+)״/g, '"$1"'); // החלפת גרשיים בכפול למירכאות רגילות
  text = text.replace(/׳([^׳]+)׳/g, '"$1"'); // החלפת גרש למירכאות
  
  // הסרת מירכאות כפולות
  text = text.replace(/""/g, '"');
  text = text.replace(/"""/g, '"');
  
  // תיקון רווחים סביב מירכאות
  text = text.replace(/\s+"/g, ' "');
  text = text.replace(/"\s+/g, '" ');
  
  return text;
}

// Create formatted Word document - styled like the screenshot
async function createWordDocument(transcription, filename, duration) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // כותרת ראשית מרכוזה
        new Paragraph({
          children: [
            new TextRun({
              text: "תמלול אוטומטי",
              bold: true,
              size: 28, // 14pt
              font: "David"
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        
        // פרטי הקובץ
        new Paragraph({
          children: [
            new TextRun({
              text: `שם הקובץ: ${filename}`,
              size: 24, // 12pt
              font: "David"
            })
          ],
          spacing: { after: 120 }
        }),
        
        new Paragraph({
          children: [
            new TextRun({
              text: `משך זמן: ${duration} דקות`,
              size: 24, // 12pt
              font: "David"
            })
          ],
          spacing: { after: 120 }
        }),
        
        new Paragraph({
          children: [
            new TextRun({
              text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
              size: 24, // 12pt
              font: "David"
            })
          ],
          spacing: { after: 240 }
        }),
        
        // קו הפרדה
        new Paragraph({
          children: [
            new TextRun({
              text: "────────────────────────────────────────",
              size: 20, // 10pt
              font: "David"
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 }
        }),
        
        // עיבוד תוכן התמלול
        ...processTranscriptionContent(transcription)
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}

// פונקציה עזר לעיבוד תוכן התמלול
function processTranscriptionContent(transcription) {
  const paragraphs = [];
  
  // חלוקה לפסקאות על בסיס שורות ריקות כפולות
  const sections = transcription.split(/\n\s*\n/).filter(section => section.trim());
  
  for (let section of sections) {
    const lines = section.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length === 0) continue;
    
    // יצירת פסקה אחת מכל הקטע
    const fullText = lines.join(' ');
    
    // זיהוי אם זו שורת דובר או תוכן רגיל
    if (isSpeakerLine(fullText)) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: fullText,
            size: 24, // 12pt
            font: "David",
            bold: true
          })
        ],
        spacing: { 
          before: 240, // רווח לפני
          after: 120   // רווח אחרי
        }
      }));
    } else {
      // פסקה רגילה - מעבדים ציטוטים
      const processedText = addQuotationMarks(fullText);
      
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: processedText,
            size: 24, // 12pt
            font: "David"
          })
        ],
        spacing: { 
          before: 120, // רווח קל לפני
          after: 200   // רווח אחרי
        }
      }));
    }
  }
  
  return paragraphs;
}

// פונקציה לזיהוי שורות דוברים
function isSpeakerLine(line) {
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
    /^[א-ת]{2,}\s*:/
  ];
  
  return speakerPatterns.some(pattern => pattern.test(line));
}

// פונקציה להוספת מירכאות לציטוטים
function addQuotationMarks(text) {
  // ביטויים שצריכים להיות במירכאות
  const citationPatterns = [
    // ציטוטים מהתלמוד
    /(כדאיתא ב[א-ת\s,():.״״׳׳0-9]+)/g,
    /(כמו שכתוב ב[א-ת\s,():.״״׳׳0-9]+)/g,
    /(שנאמר[^.!?]*)/g,
    /(כמאמר חז״ל[^.!?]*)/g,
    /(אמרו חכמים[^.!?]*)/g,
    /(תניא[^.!?]*)/g,
    /(דאמר[^.!?]*)/g,
    /(כדכתיב[^.!?]*)/g,
    /(והיינו דאמר[^.!?]*)/g,
    
    // ציטוטים מקראיים
    /(וכתוב[^.!?]*)/g,
    /(כמו שנאמר[^.!?]*)/g,
    /(שכתוב[^.!?]*)/g,
    /(כתיב[^.!?]*)/g,
    
    // ציטוטים מהמשנה
    /(משנה[^.!?]*)/g,
    /(ברייתא[^.!?]*)/g,
    /(תוספתא[^.!?]*)/g,
    /(מתני׳[^.!?]*)/g,
    /(גמ׳[^.!?]*)/g
  ];
  
  citationPatterns.forEach(pattern => {
    text = text.replace(pattern, (match) => {
      // בדיקה אם הציטוט כבר במירכאות
      if (match.startsWith('"') && match.endsWith('"')) {
        return match;
      }
      return `"${match.trim()}"`;
    });
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
            התמלול שלך הושלם בהצלחה באמצעות <strong>Google Gemini 2.5 Pro</strong>!<br>
            המערכת מותאמת במיוחד לתמלול עברית עם הגיה ליטאית ומושגי ארמית.
          </p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2E74B5; margin: 0 0 15px 0;">📊 סיכום התמלול:</h3>
            <ul style="margin: 0; padding-right: 20px;">
              <li><strong>מספר קבצים:</strong> ${transcriptions.length}</li>
              <li><strong>זמן כולל:</strong> ${totalMinutes} דקות</li>
              <li><strong>פורמט פלט:</strong> קבצי Word מעוצבים</li>
              <li><strong>שפה:</strong> עברית (הגיה ליטאית)</li>
            </ul>
          </div>
          
          <h3 style="color: #2E74B5; margin: 25px 0 15px 0;">📄 קבצים מצורפים:</h3>
          <ul style="background: #e3f2fd; padding: 15px 20px; border-radius: 5px; margin: 15px 0;">
            ${transcriptions.map(trans => 
              `<li style="margin: 5px 0;"><strong>${trans.filename}</strong> (${trans.duration} דקות) → תמלול מעוצב</li>`
            ).join('')}
          </ul>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #ffc107;">
            <h4 style="color: #856404; margin: 0 0 10px 0;">💡 טיפים לשימוש:</h4>
            <ul style="color: #856404; margin: 0; padding-right: 20px; font-size: 14px;">
              <li>הקבצים מעוצבים ומוכנים לעריכה</li>
              <li>מומלץ לבדוק מושגים מיוחדים בארמית</li>
              <li>ניתן להדפיס או לערוך ישירות ב-Word</li>
              <li>שמור את הקבצים לארכיון שלך</li>
            </ul>
          </div>
          
          <p style="font-size: 16px; margin-top: 25px;">
            תודה שבחרת במערכת התמלול המתקדמת שלנו!<br>
            נשמח לשרת אותך שוב בעתיד.
          </p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
          <p style="margin: 0;">מערכת תמלול חכמה | Powered by Google Gemini 2.5 Pro</p>
          <p style="margin: 5px 0 0 0;">מותאם במיוחד לעברית, הגיה ליטאית ומושגי ארמית</p>
        </div>
      </div>
    `,
    attachments: attachments
  };
  
  await transporter.sendMail(mailOptions);
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Access your app at: http://localhost:${PORT}`);
  console.log(`🤖 Gemini API: ${process.env.GEMINI_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
  console.log(`📧 Email: ${process.env.EMAIL_USER ? 'Configured' : 'NOT CONFIGURED'}`);
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
