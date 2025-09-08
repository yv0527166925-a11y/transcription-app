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

// Enhanced file storage with proper UTF-8 encoding
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
    
    console.log(`📁 Original filename: "${file.originalname}"`);
    
    // Try to preserve original Hebrew filename
    let safeName = file.originalname;
    
    // Clean invalid characters but keep Hebrew
    safeName = safeName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    
    const finalName = `${timestamp}_${safeName}`;
    console.log(`📁 Final stored filename: "${finalName}"`);
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

// Helper function to clean filename for display
function cleanFilename(filename) {
  console.log(`🔍 Original filename: "${filename}"`);
  
  // Remove timestamp prefix
  let withoutTimestamp = filename.replace(/^\d+_/, '');
  console.log(`📝 After removing timestamp: "${withoutTimestamp}"`);
  
  // Remove file extension
  let cleaned = withoutTimestamp.replace(/\.[^/.]+$/, '');
  
  // Clean remaining weird characters but keep Hebrew
  cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  
  // If we still don't have good text, use a generic name
  if (!cleaned || cleaned.length < 2) {
    cleaned = 'קובץ_אודיו';
  }
  
  console.log(`✅ Final cleaned filename: "${cleaned}"`);
  return cleaned;
}

// 🔥 SUPER STRONG: Ultimate transcription with multiple strategies
async function transcribeWithMultipleAttempts(filePath, filename, language) {
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  console.log(`🎯 Starting transcription: ${cleanFilename(filename)} (${fileSizeMB.toFixed(1)} MB)`);
  
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

  // 🔥 ULTIMATE PROMPTS: Multiple approaches for complete transcription
  const prompts = [
    // Prompt 1: Super aggressive complete transcription
    `🚨 חובה מוחלטת: תמלל את כל הקובץ האודיו הזה מהתחלה עד הסוף הגמור!

קובץ: ${cleanFilename(filename)} (${fileSizeMB.toFixed(1)} MB)

🔥🔥🔥 הוראות קריטיות - אסור לך להתעלם מהן:
1. תמלל כל שנייה, כל מילה, כל משפט מההתחלה ועד הסוף
2. אם האודיו ארוך 45 דקות - תמלל את כל 45 הדקות ללא יוצא מן הכלל
3. אל תעצור באמצע, אל תקצר, אל תסכם - רק תמלול מלא 100%
4. אם יש הפסקות או רעש - כתוב [הפסקה] והמשך לתמלל
5. המשך לתמלל עד שהאודיו נגמר לחלוטין
6. אל תכתוב "המשך התמלול..." או "סיום התמלול" - רק התוכן המלא

🎯 תמלל לעברית תקנית:
- מושגים דתיים מדויקים
- ציטוטים במירכאות: "כמו שכתוב", "אמרו חכמים", "תניא"
- זיהוי דוברים: "רב:", "שואל:", "תלמיד:"
- פסקאות של 2-4 משפטים עם שורה ריקה

🚨 זה קובץ של ${fileSizeMB.toFixed(1)} MB - אני מצפה לתמלול ארוך ומפורט!
תתחיל עכשיו ותמלל הכל ללא חריגות:`,

    // Prompt 2: Professional transcriptionist approach
    `אתה מתמלל מקצועי מומחה. תמלל את הקובץ הזה במלואו ובמדויק:

📋 פרטי הקובץ:
- שם: ${cleanFilename(filename)}
- גודל: ${fileSizeMB.toFixed(1)} MB
- משימה: תמלול מלא ושלם

💼 כמתמלל מקצועי, חובתך:
1. לתמלל כל מילה מהתחלה עד הסוף
2. לא לדלג על שום חלק
3. לא לקצר או לסכם
4. לשמור על דיוק מקסימלי
5. לעצב את הטקסט בצורה מקצועית

📝 הנחיות עיצוב:
- פסקאות קצרות ונקיות
- זיהוי דוברים במידת הצורך
- ציטוטים במירכאות
- שפה עברית תקנית

התחל את התמלול המלא כעת:`,

    // Prompt 3: Step-by-step approach
    `תמלל את הקובץ הזה שלב אחר שלב:

🎯 הוראות עבודה:
1. האזן לכל הקובץ מהתחלה עד הסוף
2. תמלל כל מה שאתה שומע בדיוק
3. אל תדלג על שום חלק
4. כתוב הכל ברצף

📊 פרטי הקובץ:
- ${cleanFilename(filename)}
- ${fileSizeMB.toFixed(1)} MB
- משוער: ${(fileSizeMB * 0.5).toFixed(1)} דקות

בצע תמלול מלא עכשיו:`
  ];

  // Try multiple prompts with progressive timeouts
  for (let promptIndex = 0; promptIndex < prompts.length; promptIndex++) {
    console.log(`🔄 Trying transcription approach ${promptIndex + 1}/${prompts.length}`);
    
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        console.log(`   🎯 Attempt ${attempt + 1}/${maxAttempts}`);
        
        // Progressive timeout: longer for each attempt and each prompt
        const baseTimeout = 180000; // 3 minutes
        const timeoutMs = baseTimeout + (promptIndex * 60000) + (attempt * 60000) + (fileSizeMB * 10000);
        
        const result = await Promise.race([
          model.generateContent([
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio
              }
            },
            prompts[promptIndex]
          ]),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout after ${timeoutMs/1000} seconds`)), timeoutMs)
          )
        ]);
        
        const response = await result.response;
        let transcription = response.text();
        
        // Clean transcription
        transcription = transcription
          .replace(/\r\n/g, '\n')
          .replace(/\n{4,}/g, '\n\n\n')
          .replace(/^\s+|\s+$/gm, '')
          .trim();
        
        // Validate transcription quality
        const wordCount = transcription.split(/\s+/).length;
        const expectedMinWords = Math.max(50, fileSizeMB * 15); // 15 words per MB minimum
        
        console.log(`📊 Transcription result: ${transcription.length} chars, ${wordCount} words`);
        console.log(`📊 Expected minimum: ${expectedMinWords} words`);
        
        if (transcription.length < 50) {
          throw new Error('התמלול קצר מדי');
        }
        
        if (wordCount < expectedMinWords * 0.2) {
          console.warn(`⚠️ Transcription seems short, trying next approach...`);
          throw new Error('התמלול נראה קצר מדי');
        }
        
        console.log(`✅ Successful transcription with approach ${promptIndex + 1}: ${transcription.length} characters`);
        return transcription;
        
      } catch (error) {
        console.log(`   ❌ Attempt ${attempt + 1} failed: ${error.message}`);
        
        if (attempt < maxAttempts - 1) {
          const waitTime = 5000 * (attempt + 1); // 5s, 10s, 15s
          console.log(`   ⏳ Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
  }
  
  throw new Error('כל הניסיונות לתמלול נכשלו');
}

// 🔧 Balanced Word document creation
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document for: ${cleanName}`);
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 2160,    // 1.5 inches
              right: 1800,  // 1.25 inches  
              bottom: 2160,
              left: 1800
            }
          }
        },
        children: [
          // Title
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
          
          // File info
          new Paragraph({
            children: [
              new TextRun({
                text: `שם הקובץ: ${cleanName}`,
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
          
          // Separator
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
          
          // Content
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

// Process transcription content with good spacing
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

// Special function for email filename - extra safe
function createSafeEmailFilename(originalFilename) {
  const cleaned = cleanFilename(originalFilename);
  
  // For email attachment, be extra safe with characters
  let safe = cleaned
    .replace(/[^\u0590-\u05FF\u0041-\u005A\u0061-\u007A\u0030-\u0039\u0020]/g, '_') // Only Hebrew, English, numbers, spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  
  if (!safe || safe.length < 2) {
    safe = 'תמלול_אודיו';
  }
  
  console.log(`📧 Safe email filename: "${safe}"`);
  return safe;
}

// Enhanced email
async function sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions = []) {
  try {
    console.log(`📧 Preparing email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => {
      const safeName = createSafeEmailFilename(trans.filename);
      return {
        filename: `תמלול_מלא_${safeName}.docx`,
        content: trans.wordDoc,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    });

    const successList = transcriptions.map(t => {
      const cleanName = cleanFilename(t.filename);
      const wordCount = t.transcription.split(/\s+/).length;
      return `<li>📄 <strong>${cleanName}</strong> <small>(${wordCount} מילים)</small></li>`;
    }).join('');

    let failureSection = '';
    if (failedTranscriptions.length > 0) {
      const failureList = failedTranscriptions.map(f => {
        const cleanName = cleanFilename(f.filename);
        return `<li>❌ <strong>${cleanName}</strong></li>`;
      }).join('');
      
      failureSection = `
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #ffc107;">
          <h3 style="color: #856404; margin-bottom: 15px;">⚠️ קבצים שלא הצליחו:</h3>
          <ul>${failureList}</ul>
        </div>
      `;
    }

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
            
            ${failureSection}
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #2196f3;">
              <h3 style="color: #1565c0;">🔥 מערכת תמלול מתקדמת:</h3>
              <ul style="color: #1565c0;">
                <li>🎯 <strong>תמלול מלא 100%</strong> - מההתחלה עד הסוף הגמור</li>
                <li>🔄 <strong>מספר גישות תמלול</strong> - לוודא שלמות מקסימלית</li>
                <li>✨ <strong>Gemini 2.5 Pro מתקדם</strong> - דיוק מקסימלי</li>
                <li>📖 <strong>עיצוב Word מקצועי</strong> - נוח לקריאה ולעריכה</li>
                <li>🎓 <strong>מותאם לעברית</strong> - מושגים דתיים מדויקים</li>
                <li>🔤 <strong>שמות קבצים עבריים</strong> - קידוד נכון ובטוח</li>
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
  console.log(`🎯 Starting advanced transcription for ${files.length} files`);
  console.log(`📧 Processing for user: ${userEmail}`);
  
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
      
      try {
        const transcription = await transcribeWithMultipleAttempts(file.path, file.filename, language);
        const wordDoc = await createWordDocument(transcription, file.filename, estimatedMinutes);
        
        transcriptions.push({
          filename: file.filename,
          transcription,
          wordDoc
        });
        
        console.log(`✅ Successfully processed: ${cleanFilename(file.filename)}`);
        console.log(`📊 Final transcription: ${transcription.length} characters, ${transcription.split(/\s+/).length} words`);
        
      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
        
        transcriptions.push({
          filename: file.filename,
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
      
      console.log(`🎉 Advanced transcription completed for: ${userEmail}`);
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
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'אימייל נדרש' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return res.status(400).json({ success: false, error: `משתמש לא נמצא: ${email}` });
    }

    // Calculate total estimated minutes
    const estimatedMinutes = req.files.reduce((total, file) => {
      return total + Math.ceil(file.size / (1024 * 1024 * 2));
    }, 0);

    if (estimatedMinutes > user.remainingMinutes) {
      return res.status(400).json({ 
        success: false, 
        error: `אין מספיק דקות בחשבון. נדרש: ${estimatedMinutes}, זמין: ${user.remainingMinutes}` 
      });
    }

    // Start async processing
    processTranscriptionAsync(req.files, email, language, estimatedMinutes);
    
    console.log('✅ Transcription started successfully');
    res.json({ 
      success: true, 
      message: 'התמלול התחיל',
      estimatedMinutes 
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email configured: ${!!process.env.EMAIL_USER}`);
  console.log(`🎯 Advanced multi-attempt transcription system ready!`);
  console.log(`💡 Using multiple transcription strategies for maximum completeness`);
});
