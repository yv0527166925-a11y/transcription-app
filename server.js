const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process');
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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for large files
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
    res.status(500).json({ error: 'שגיאה בעיבוד התמלול' });
  }
});

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

// Real Gemini 2.5 Pro transcription
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

    // Specialized prompt for Hebrew with Lithuanian pronunciation and Aramaic terms
    const prompt = `תמלל את הקובץ האודיו הבא לעברית בלבד. זהו רב המדבר בעברית עם הגיה ליטאית ומשלב מושגים בארמית.

הנחיות חשובות לתמלול:
1. תמלל רק בעברית - אל תתרגם לשפות אחרות
2. שמור על ההגיה הליטאית המיוחדת (למשל: "א" נהגית כמו "אה", "ו" כמו "או")
3. כתוב מושגים ארמיים בכתיב המקורי (למשל: אבא, אמא, רבנן, תנא קמא)
4. הוסף סימני פיסוק מדויקים
5. חלק לפסקאות לוגיות
6. ציין דוברים שונים אם יש (רב, שואל, וכו')
7. שמור על טון רשמי ומכובד המתאים לדברי רב
8. תקן שגיאות דקדוק קלות אך שמור על הסגנון המקורי
9. אם יש מילים לא ברורות, ציין [לא ברור] במקום לנחש

פורמט הפלט:
- כותרת: תמלול שיחה/דרשה/שיעור
- תאריך ושעה אם מוזכרים
- תוכן מחולק לפסקאות
- הערות חשובות בסוגריים אם נדרש

התחל את התמלול:`;

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

// Create formatted Word document
async function createWordDocument(transcription, filename, duration) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "תמלול אוטומטי - Gemini 2.5 Pro",
              bold: true,
              size: 32,
              color: "2E74B5"
            })
          ],
          alignment: "center"
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "═══════════════════════════════════",
              size: 20,
              color: "CCCCCC"
            })
          ],
          alignment: "center"
        }),
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({
          children: [
            new TextRun({
              text: "📁 שם הקובץ: ",
              bold: true,
              size: 24
            }),
            new TextRun({
              text: filename,
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "⏱️ משך הקובץ: ",
              bold: true,
              size: 24
            }),
            new TextRun({
              text: `${duration} דקות`,
              size: 24,
              color: "2E74B5"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "📅 תאריך התמלול: ",
              bold: true,
              size: 24
            }),
            new TextRun({
              text: new Date().toLocaleDateString('he-IL'),
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "🤖 מערכת: ",
              bold: true,
              size: 20
            }),
            new TextRun({
              text: "Google Gemini 2.5 Pro - תמלול מתקדם לעברית",
              size: 20,
              italics: true,
              color: "4A90E2"
            })
          ]
        }),
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({
          children: [
            new TextRun({
              text: "תוכן התמלול:",
              bold: true,
              size: 26,
              color: "2E74B5"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "─────────────────────────────────────────",
              size: 20,
              color: "CCCCCC"
            })
          ]
        }),
        new Paragraph({ text: "" }), // Empty line
        
        // Process transcription content
        ...transcription.split('\n').filter(line => line.trim()).map(line => {
          // Special formatting for speakers or sections
          if (line.includes('רב:') || line.includes('שואל:') || line.includes('תשובה:')) {
            return new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 22,
                  bold: true,
                  color: "C5504B"
                })
              ]
            });
          }
          
          // Regular content
          return new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 22
              })
            ]
          });
        }),
        
        // Footer
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({
          children: [
            new TextRun({
              text: "─────────────────────────────────────────",
              size: 16,
              color: "CCCCCC"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "הערות חשובות:",
              bold: true,
              size: 18,
              color: "E67E22"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "• התמלול מותאם לעברית עם הגיה ליטאית ומושגי ארמית",
              size: 16,
              color: "666666"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "• מומלץ לבדוק ולערוך את התוכן בהתאם לצורך",
              size: 16,
              color: "666666"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "• איכות התמלול תלויה באיכות ההקלטה המקורית",
              size: 16,
              color: "666666"
            })
          ]
        })
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
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Access your app at: http://localhost:${PORT}`);
  console.log(`🤖 Gemini API: ${process.env.GEMINI_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
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
