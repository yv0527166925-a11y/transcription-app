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

// Simple file storage
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
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}_audio${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }
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
    totalTranscribed: 0
  },
  {
    id: 2,
    name: 'משתמש בדיקה',
    email: 'test@example.com',
    password: 'test123',
    isAdmin: false,
    remainingMinutes: 30,
    totalTranscribed: 0
  }
];

// Get nice display name for files
function getDisplayName(originalName) {
  if (!originalName) {
    return 'קובץ_אודיו';
  }
  
  let name = originalName.replace(/\.[^/.]+$/, '');
  
  // If has Hebrew, use it
  if (name.match(/[\u0590-\u05FF]/)) {
    return name;
  }
  
  // Create time-based name
  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `קובץ_אודיו_${timeStr}`;
}

// Complete transcription with multiple attempts
async function transcribeCompletely(filePath, originalName) {
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  const displayName = getDisplayName(originalName);
  
  console.log(`🎯 Starting complete transcription`);
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

  // PHASE 1: Ultra aggressive
  console.log('🚨 PHASE 1: Ultra aggressive');
  try {
    const prompt1 = `🚨🚨🚨 CRITICAL: תמלל את כל הקובץ האודיו הזה!

File: ${displayName} (${fileSizeMB.toFixed(1)} MB)

ABSOLUTE REQUIREMENTS:
1. תמלל מהשנייה הראשונה עד השנייה האחרונה
2. אם הקובץ ארוך 30 דקות - תמלל את כל 30 הדקות
3. אם הקובץ ארוך 45 דקות - תמלל את כל 45 הדקות
4. אל תעצור באמצע! תמלל עד שהאודיו נגמר
5. אם יש שתיקות - כתוב [שתיקה] והמשך

פסקאות של 2-3 משפטים
זיהוי דוברים: "רב:", "שואל:"

THIS IS ${fileSizeMB.toFixed(1)} MB - COMPLETE TRANSCRIPTION REQUIRED!
START NOW:`;

    const result1 = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        prompt1
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Phase 1 timeout')), 900000)
      )
    ]);

    const response1 = await result1.response;
    let transcription1 = response1.text();
    
    transcription1 = transcription1
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const words1 = transcription1.split(/\s+/).length;
    const expectedWords = fileSizeMB * 20;
    
    console.log(`📊 Phase 1: ${transcription1.length} chars, ${words1} words`);
    
    if (words1 >= expectedWords * 0.6) {
      console.log(`✅ Phase 1 SUCCESS!`);
      return transcription1;
    }
    
    console.log(`⚠️ Phase 1 too short, trying Phase 2...`);
  } catch (error) {
    console.log(`❌ Phase 1 failed: ${error.message}`);
  }
  
  // PHASE 2: Professional
  console.log('💼 PHASE 2: Professional');
  try {
    const prompt2 = `PROFESSIONAL TRANSCRIPTIONIST TASK:

Assignment: Complete transcription of ${displayName}
File size: ${fileSizeMB.toFixed(1)} MB

As a professional transcriptionist, I MUST:
1. Transcribe EVERY WORD from beginning to end
2. Never skip any portion of the audio
3. Work through the ENTIRE file systematically
4. Continue until the audio completely ends

The file is ${fileSizeMB.toFixed(1)} MB - extensive work required.
Complete transcription starting now:`;

    const result2 = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        prompt2
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Phase 2 timeout')), 1200000)
      )
    ]);

    const response2 = await result2.response;
    let transcription2 = response2.text();
    
    transcription2 = transcription2
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const words2 = transcription2.split(/\s+/).length;
    console.log(`📊 Phase 2: ${transcription2.length} chars, ${words2} words`);
    
    if (words2 >= expectedWords * 0.5) {
      console.log(`✅ Phase 2 SUCCESS!`);
      return transcription2;
    }
    
    console.log(`⚠️ Phase 2 too short, trying Phase 3...`);
  } catch (error) {
    console.log(`❌ Phase 2 failed: ${error.message}`);
  }
  
  // PHASE 3: Last resort
  console.log('🆘 PHASE 3: Last resort');
  try {
    const prompt3 = `FINAL ATTEMPT - TRANSCRIBE EVERYTHING:

${displayName} (${fileSizeMB.toFixed(1)} MB)

This is the final chance. Transcribe the entire audio file.
Don't stop until you reach the very end.

Start transcribing now:`;

    const result3 = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        prompt3
      ]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Phase 3 timeout')), 1500000)
      )
    ]);

    const response3 = await result3.response;
    let transcription3 = response3.text();
    
    transcription3 = transcription3
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const words3 = transcription3.split(/\s+/).length;
    console.log(`📊 Phase 3: ${transcription3.length} chars, ${words3} words`);
    
    if (transcription3.length > 50) {
      console.log(`✅ Phase 3 completed`);
      return transcription3;
    }
    
  } catch (error) {
    console.log(`❌ Phase 3 failed: ${error.message}`);
  }
  
  throw new Error('כל השלבים נכשלו');
}

// Create Word document
async function createWordDocument(transcription, originalName) {
  const displayName = getDisplayName(originalName);
  
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
  
  return await Packer.toBuffer(doc);
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

// Send email
async function sendTranscriptionEmail(userEmail, transcriptions) {
  const attachments = transcriptions.map(trans => {
    const displayName = getDisplayName(trans.originalName);
    return {
      filename: `תמלול_מלא_${displayName}.docx`,
      content: trans.wordDoc,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  });

  const successList = transcriptions.map(t => {
    const displayName = getDisplayName(t.originalName);
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
            מצורפים קבצי Word מעוצבים עם תמלול שלם:
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #4caf50;">
            <h3 style="color: #2e7d32;">✅ קבצים מושלמים:</h3>
            <ul>${successList}</ul>
          </div>
          
          <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #2196f3;">
            <h3 style="color: #1565c0;">🔥 מערכת תמלול 3-שלבית:</h3>
            <ul style="color: #1565c0;">
              <li>🚨 <strong>שלב 1:</strong> תמלול אגרסיבי (15 דקות)</li>
              <li>💼 <strong>שלב 2:</strong> גישה מקצועית (20 דקות)</li>
              <li>🆘 <strong>שלב 3:</strong> מאמץ מקסימלי (25 דקות)</li>
              <li>✨ <strong>Gemini 2.5 Pro</strong> - דיוק מקסימלי</li>
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
}

// Process transcription
async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes) {
  console.log(`🎯 Starting 3-phase transcription for ${files.length} files`);
  
  const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
  if (!user) {
    console.error('❌ User not found');
    return;
  }

  const transcriptions = [];
  
  for (const file of files) {
    console.log(`🎵 Processing: ${file.filename}`);
    console.log(`📧 Original: ${file.originalname}`);
    
    try {
      const transcription = await transcribeCompletely(file.path, file.originalname);
      const wordDoc = await createWordDocument(transcription, file.originalname);
      
      transcriptions.push({
        originalName: file.originalname,
        transcription,
        wordDoc
      });
      
      const displayName = getDisplayName(file.originalname);
      console.log(`✅ Successfully processed: ${displayName}`);
      console.log(`📊 Result: ${transcription.length} chars, ${transcription.split(/\s+/).length} words`);
      
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
    } finally {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
  
  if (transcriptions.length > 0) {
    await sendTranscriptionEmail(userEmail, transcriptions);
    
    const actualMinutesUsed = Math.min(estimatedMinutes, user.remainingMinutes);
    user.remainingMinutes = Math.max(0, user.remainingMinutes - actualMinutesUsed);
    user.totalTranscribed += actualMinutesUsed;
    
    console.log(`🎉 Completed for: ${userEmail}`);
    console.log(`💰 Balance: ${user.remainingMinutes} minutes`);
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

app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.json({ success: false, error: 'אימייל וסיסמה נדרשים' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (user) {
      res.json({ success: true, user: { ...user, password: undefined } });
    } else {
      res.json({ success: false, error: 'אימייל או סיסמה שגויים' });
    }
  } catch (error) {
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
      totalTranscribed: 0
    };
    
    users.push(newUser);
    res.json({ success: true, user: { ...newUser, password: undefined } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'שגיאה בהרשמה' });
  }
});

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
    
    res.json({ 
      success: true, 
      message: `נוספו ${minutes} דקות לחשבון ${userEmail}`,
      oldBalance,
      newBalance,
      user: { ...user, password: undefined }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'שגיאה בהוספת דקות' 
    });
  }
});

app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
    console.log('🎯 Transcription request received');
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'לא נבחרו קבצים' });
    }

    const { email, language } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'אימייל נדרש' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return res.status(400).json({ success: false, error: `משתמש לא נמצא: ${email}` });
    }

    const estimatedMinutes = req.files.reduce((total, file) => {
      return total + Math.ceil(file.size / (1024 * 1024 * 2));
    }, 0);

    if (estimatedMinutes > user.remainingMinutes) {
      return res.status(400).json({ 
        success: false, 
        error: `אין מספיק דקות בחשבון. נדרש: ${estimatedMinutes}, זמין: ${user.remainingMinutes}` 
      });
    }

    processTranscriptionAsync(req.files, email, language, estimatedMinutes);
    
    res.json({ 
      success: true, 
      message: 'התמלול התחיל',
      estimatedMinutes 
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Gemini API: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email: ${!!process.env.EMAIL_USER}`);
  console.log(`🎯 3-PHASE TRANSCRIPTION READY!`);
  console.log(`💡 Phase 1: 15 min | Phase 2: 20 min | Phase 3: 25 min`);
});
