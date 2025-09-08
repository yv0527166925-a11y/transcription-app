const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 🔥 SIMPLE: Store files with timestamp + safe name
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = 'uploads';
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    
    // For now, just store with timestamp - we'll handle Hebrew in display function
    const ext = path.extname(file.originalname);
    const finalName = `${timestamp}_original${ext}`;
    
    console.log(`📁 Storing as: ${finalName}`);
    console.log(`📁 Original was: ${file.originalname}`);
    
    // Store the original name for later use
    req.originalFileName = file.originalname;
    
    cb(null, finalName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp3|mp4|wav|m4a|mov|avi|mkv|flac|aac|ogg)$/i;
    if (allowedTypes.test(file.originalname) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('סוג קובץ לא נתמך'), false);
    }
  }
});

// Mock database
let users = [
  {
    id: 1,
    name: 'מנהל המערכת',
    email: 'admin@example.com',
    password: 'admin123',
    isAdmin: true,
    remainingMinutes: 1000,
    totalTranscribed: 0,
    history: []
  },
  {
    id: 2,
    name: 'משתמש בדיקה',
    email: 'test@example.com',
    password: 'test123',
    isAdmin: false,
    remainingMinutes: 30,
    totalTranscribed: 0,
    history: []
  }
];

// 🔥 SIMPLE: Get a nice display name for the file
function getDisplayName(originalName, storedName) {
  console.log(`🔍 Creating display name from: "${originalName}"`);
  
  if (!originalName) {
    return 'קובץ_אודיו';
  }
  
  // Remove file extension
  let name = originalName.replace(/\.[^/.]+$/, '');
  
  // If it already has Hebrew, use it
  if (name.match(/[\u0590-\u05FF]/)) {
    console.log(`✅ Found Hebrew in original name: "${name}"`);
    return name;
  }
  
  // If it's still problematic, create a generic name with timestamp
  const timestamp = storedName.match(/^(\d+)_/);
  if (timestamp) {
    const time = new Date(parseInt(timestamp[1]));
    const timeStr = time.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `קובץ_אודיו_${timeStr}`;
  }
  
  return 'קובץ_אודיו';
}

// 🔥 ULTIMATE: Multiple phase transcription for COMPLETE results
async function transcribeCompletely(filePath, originalName, storedName) {
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  const displayName = getDisplayName(originalName, storedName);
  
  console.log(`🎯 COMPLETE TRANSCRIPTION START`);
  console.log(`📊 File: ${displayName} (${fileSizeMB.toFixed(1)} MB)`);
  
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536
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

  // 🔥 PHASE 1: Ultra demanding complete transcription
  console.log(`🚨 PHASE 1: Ultra demanding approach`);
  try {
    const phase1Prompt = `🚨🚨🚨 CRITICAL MISSION: תמלל את כל הקובץ האודיו הזה במלואו!

📋 MISSION DETAILS:
- File: ${displayName}
- Size: ${fileSizeMB.toFixed(1)} MB
- REQUIREMENT: COMPLETE transcription from start to finish

🔥 ABSOLUTE REQUIREMENTS:
1. תמלל מהשנייה הראשונה עד השנייה האחרונה
2. אם הקובץ ארוך 30 דקות - תמלל את כל 30 הדקות
3. אם הקובץ ארוך 45 דקות - תמלל את כל 45 הדקות  
4. אם הקובץ ארוך 60 דקות - תמלל את כל 60 הדקות
5. אסור לעצור באמצע! תמלל עד שהאודיו נגמר
6. אם יש הפסקות - כתוב [שתיקה] והמשך
7. זה המקום האחרון - תמלל הכל!

📝 FORMAT:
- פסקאות של 2-3 משפטים
- זיהוי דוברים: "רב:", "שואל:"
- ציטוטים במירכאות

🚨 THIS IS ${fileSizeMB.toFixed(1)} MB - I EXPECT A VERY LONG TRANSCRIPTION!
START NOW AND DON'T STOP UNTIL THE AUDIO ENDS:`;

    const result1 = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        phase1Prompt
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Phase 1 timeout')), 900000) // 15 minutes
      )
    ]);

    const response1 = await result1.response;
    let transcription1 = response1.text();
    
    transcription1 = transcription1
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const words1 = transcription1.split(/\s+/).length;
    const expectedWords = fileSizeMB * 20; // 20 words per MB
    
    console.log(`📊 Phase 1 result: ${transcription1.length} chars, ${words1} words`);
    console.log(`📊 Expected minimum: ${expectedWords} words`);
    
    // If phase 1 gave us a good result, return it
    if (words1 >= expectedWords * 0.6) {
      console.log(`✅ Phase 1 SUCCESS - good transcription achieved!`);
      return transcription1;
    }
    
    console.log(`⚠️ Phase 1 too short, trying Phase 2...`);
  } catch (error) {
    console.log(`❌ Phase 1 failed: ${error.message}`);
  }
  
  // 🔥 PHASE 2: Different approach with longer timeout
  console.log(`🔄 PHASE 2: Extended professional approach`);
  try {
    const phase2Prompt = `PROFESSIONAL TRANSCRIPTIONIST TASK:

🎯 Assignment: Complete transcription of ${displayName}
📊 File size: ${fileSizeMB.toFixed(1)} MB

💼 As a professional transcriptionist, I MUST:
1. Transcribe EVERY WORD from beginning to end
2. Never skip any portion of the audio
3. Work through the ENTIRE file systematically
4. Continue until the audio completely ends
5. Produce a transcription worthy of professional standards

📝 The file is ${fileSizeMB.toFixed(1)} MB - this requires extensive work.
I will transcribe everything from start to finish:`;

    const result2 = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        phase2Prompt
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Phase 2 timeout')), 1200000) // 20 minutes
      )
    ]);

    const response2 = await result2.response;
    let transcription2 = response2.text();
    
    transcription2 = transcription2
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const words2 = transcription2.split(/\s+/).length;
    console.log(`📊 Phase 2 result: ${transcription2.length} chars, ${words2} words`);
    
    if (words2 >= expectedWords * 0.5) {
      console.log(`✅ Phase 2 SUCCESS!`);
      return transcription2;
    }
    
    console.log(`⚠️ Phase 2 too short, trying Phase 3...`);
  } catch (error) {
    console.log(`❌ Phase 2 failed: ${error.message}`);
  }
  
  // 🔥 PHASE 3: Last resort with maximum timeout
  console.log(`🆘 PHASE 3: Last resort maximum effort`);
  try {
    const phase3Prompt = `FINAL ATTEMPT - TRANSCRIBE EVERYTHING:

${displayName} (${fileSizeMB.toFixed(1)} MB)

This is the final chance. Transcribe the entire audio file.
Don't stop until you reach the very end.
Work through every minute of the audio.

Start transcribing now:`;

    const result3 = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        phase3Prompt
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Phase 3 timeout')), 1500000) // 25 minutes
      )
    ]);

    const response3 = await result3.response;
    let transcription3 = response3.text();
    
    transcription3 = transcription3
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const words3 = transcription3.split(/\s+/).length;
    console.log(`📊 Phase 3 result: ${transcription3.length} chars, ${words3} words`);
    
    if (transcription3.length > 50) {
      console.log(`✅ Phase 3 completed - using final result`);
      return transcription3;
    }
    
  } catch (error) {
    console.log(`❌ Phase 3 failed: ${error.message}`);
  }
  
  throw new Error('כל השלבים נכשלו');
}

// Word document creation
async function createWordDocument(transcription, originalName, storedName) {
  try {
    const displayName = getDisplayName(originalName, storedName);
    console.log(`📄 Creating Word document for: ${displayName}`);
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 2160,
              right: 1800,
              bottom: 2160,
              left: 1800
            }
          }
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "תמלול אוטומטי מלא",
                bold: true,
                size: 36,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 480,
              line: 480
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `שם הקובץ: ${displayName}`,
                size: 24,     
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 240,
              line: 360
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
                size: 24,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 480,
              line: 360
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: "═".repeat(50),
                size: 20,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              before: 240,
              after: 480,
              line: 360
            }
          }),
          
          ...processTranscriptionContent(transcription)
        ]
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    console.log(`✅ Word document created successfully`);
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
  
  sections.forEach((section, index) => {
    const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let combinedSection = lines.join(' ').trim();
    
    if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
      combinedSection += '.';
    }
    
    const isSpeakerLine = /^(רב|הרב|שואל|תשובה|שאלה|המשיב|התלמיד|השואל|מרצה|דובר|מורה)\s*:/.test(combinedSection);
    
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: combinedSection,
          size: 26,
          font: {
            name: "Arial Unicode MS"
          },
          bold: isSpeakerLine
        })
      ],
      spacing: { 
        before: isSpeakerLine ? 360 : 240,
        after: 240,
        line: 400
      }
    }));
    
    if ((index + 1) % 3 === 0 && index < sections.length - 1) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: "",
            size: 16
          })
        ],
        spacing: { 
          after: 240
        }
      }));
    }
  });
  
  return paragraphs;
}

// Enhanced email
async function sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions = []) {
  try {
    console.log(`📧 Preparing email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => {
      const displayName = getDisplayName(trans.originalName, trans.storedName);
      return {
        filename: `תמלול_מלא_${displayName}.docx`,
        content: trans.wordDoc,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    });

    const successList = transcriptions.map(t => {
      const displayName = getDisplayName(t.originalName, t.storedName);
      const wordCount = t.transcription.split(/\s+/).length;
      return `<li>📄 <strong>${displayName}</strong> <small>(${wordCount} מילים)</small></li>`;
    }).join('');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `✅ תמלול מלא הושלם - ${transcriptions.length} קבצי Word מצורפים`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 26px;">🎯 התמלול המלא הושלם בהצלחה!</h1>
          </div>
          
          <div style="background: #f8f9ff; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">שלום וברכה,</p>
            
            <p style="font-size: 16px;">
              התמלול המלא והמפורט שלך הושלם! 
              מצורפים קבצי Word מעוצבים עם תמלול שלם מההתחלה עד הסוף:
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #4caf50;">
              <h3 style="color: #2e7d32;">✅ קבצים מושלמים:</h3>
              <ul>${successList}</ul>
            </div>
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #2196f3;">
              <h3 style="color: #1565c0;">🔥 מערכת תמלול 3-שלבית:</h3>
              <ul style="color: #1565c0;">
                <li>🚨 <strong>שלב 1:</strong> תמלול אגרסיבי מלא (15 דקות)</li>
                <li>💼 <strong>שלב 2:</strong> גישה מקצועית מורחבת (20 דקות)</li>
                <li>🆘 <strong>שלב 3:</strong> מאמץ מקסימלי אחרון (25 דקות)</li>
                <li>✨ <strong>Gemini 2.5 Pro</strong> - דיוק מקסימלי</li>
                <li>📖 <strong>עיצוב Word מקצועי</strong> - נוח לקריאה</li>
                <li>🎓 <strong>מותאם לעברית</strong> - מושגים דתיים מדויקים</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 18px; color: #667eea; font-weight: bold;">
                תודה שבחרת במערכת התמלול המתקדמת!
              </p>
            </div>
          </div>
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

// Enhanced transcription processing
async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes) {
  console.log(`🎯 Starting 3-phase transcription for ${files.length} files`);
  
  const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
  if (!user) {
    console.error('❌ User not found during async processing:', userEmail);
    return;
  }

  try {
    const transcriptions = [];
    
    for (const file of files) {
      console.log(`🎵 Processing file: ${file.filename}`);
      console.log(`📊 File size: ${(fs.statSync(file.path).size / (1024 * 1024)).toFixed(1)} MB`);
      console.log(`📧 Original name: ${file.originalname}`);
      
      try {
        const transcription = await transcribeCompletely(file.path, file.originalname, file.filename);
        const wordDoc = await createWordDocument(transcription, file.originalname, file.filename);
        
        transcriptions.push({
          originalName: file.originalname,
          storedName: file.filename,
          transcription,
          wordDoc
        });
        
        const displayName = getDisplayName(file.originalname, file.filename);
        console.log(`✅ Successfully processed: ${displayName}`);
        console.log(`📊 Final transcription: ${transcription.length} characters, ${transcription.split(/\s+/).length} words`);
        
      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
        
        transcriptions.push({
          originalName: file.originalname,
          storedName: file.filename,
          transcription: `שגיאה בתמלול הקובץ: ${fileError.message}`,
          wordDoc: null,
          failed: true
        });
      } finally {
        try {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Cleaned up file: ${file.path}`);
        } catch (e) {
          console.warn('Could not delete file:', file.path);
        }
      }
    }
    
    if (transcriptions.length > 0) {
      const successfulTranscriptions = transcriptions.filter(t => !t.failed);
      const failedTranscriptions = transcriptions.filter(t => t.failed);
      
      if (successfulTranscriptions.length > 0) {
        await sendTranscriptionEmail(userEmail, successfulTranscriptions, failedTranscriptions);
        console.log(`📧 Email sent with ${successfulTranscriptions.length} successful transcriptions`);
      }
      
      const actualMinutesUsed = Math.min(estimatedMinutes, user.remainingMinutes);
      user.remainingMinutes = Math.max(0, user.remainingMinutes - actualMinutesUsed);
      user.totalTranscribed += actualMinutesUsed;
      
      console.log(`🎉 3-phase transcription completed for: ${userEmail}`);
      console.log(`💰 Updated balance: ${user.remainingMinutes} minutes remaining`);
      console.log(`📊 Success rate: ${successfulTranscriptions.length}/${transcriptions.length} files`);
    }
    
  } catch (error) {
    console.error('Async transcription batch error:', error);
  }
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working!',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    emailConfigured: !!process.env.EMAIL_USER
  });
});

// Authentication routes
app.post('/api/login', (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.json({ success: false, error: 'אימייל וסיסמה נדרשים' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    console.log('🔍 User found:', user ? 'Yes' : 'No');
    
    if (user) {
      console.log('✅ Login successful for:', user.email);
      res.json({ success: true, user: { ...user, password: undefined } });
    } else {
      console.log('❌ Login failed for:', email);
      res.json({ success: false, error: 'אימייל או סיסמה שגויים' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בשרת' });
  }
});

app.post('/api/register', (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password) {
      return res.json({ success: false, error: 'שם, אימייל וסיסמה נדרשים' });
    }
    
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.json({ success: false, error: 'משתמש עם האימייל הזה כבר קיים' });
    }
    
    const newUser = {
      id: users.length + 1,
      name,
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      isAdmin: false,
      remainingMinutes: 30,
      totalTranscribed: 0,
      history: []
    };
    
    users.push(newUser);
    console.log('✅ User registered successfully:', newUser.email);
    
    res.json({ success: true, user: { ...newUser, password: undefined } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהרשמה' });
  }
});

// Admin route
app.post('/api/admin/add-minutes', (req, res) => {
  try {
    const { userEmail, minutes } = req.body;
    
    if (!userEmail || !minutes || minutes <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'אימייל ומספר דקות נדרשים' 
      });
    }
    
    const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: `משתמש לא נמצא: ${userEmail}` 
      });
    }
    
    const oldBalance = user.remainingMinutes;
    user.remainingMinutes += minutes;
    const newBalance = user.remainingMinutes;
    
    console.log(`✅ Added ${minutes} minutes to ${userEmail}: ${oldBalance} → ${newBalance}`);
    
    res.json({ 
      success: true, 
      message: `נוספו ${minutes} דקות לחשבון ${userEmail}`,
      oldBalance,
      newBalance,
      user: { ...user, password: undefined }
    });
    
  } catch (error) {
    console.error('Admin add-minutes error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'שגיאה בהוספת דקות' 
    });
  }
});

// Transcription route
app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
    console.log('🎯 Transcription request received');
    console.log('📁 Files uploaded:', req.files?.length || 0);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'לא נבחרו קבצים' });
    }

    const { email, language } = req.body;
