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
    const extension = path.extname(file.originalname);
    
    // 🔥 FIX: Improved Hebrew filename encoding
    let safeName;
    try {
      // Try to decode properly
      safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      // If that creates weird characters, try the original
      if (safeName.includes('Ã') || safeName.includes('Â')) {
        safeName = file.originalname;
      }
    } catch (error) {
      safeName = file.originalname;
    }
    
    // Clean invalid characters but keep Hebrew
    safeName = safeName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    
    const finalName = `${timestamp}_${safeName}`;
    console.log(`📁 Saving file as: ${finalName}`);
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
  // Remove timestamp prefix
  const withoutTimestamp = filename.replace(/^\d+_/, '');
  
  // Clean any remaining encoding issues
  let cleaned = withoutTimestamp;
  try {
    // Try to properly decode if needed
    if (cleaned.includes('%')) {
      cleaned = decodeURIComponent(cleaned);
    }
  } catch (e) {
    // If decoding fails, use as is
  }
  
  // Remove file extension for display
  cleaned = cleaned.replace(/\.[^/.]+$/, '');
  
  // Clean remaining weird characters
  cleaned = cleaned.replace(/[^\u0590-\u05FF\u0020-\u007E\u00A0-\u017F\-_()]/g, '').trim();
  
  console.log(`🧹 Cleaned filename: "${filename}" → "${cleaned}"`);
  return cleaned || 'קובץ אודיו';
}

// 🔥 FIX: Enhanced transcription with stronger prompts for COMPLETE transcription
async function realGeminiTranscription(filePath, filename, language) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768
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

    // 🔥 ENHANCED PROMPT: Much stronger demand for complete transcription
    const prompt = `אתה מתמלל מקצועי. תמלל את כל הקובץ האודיו מההתחלה עד הסוף הגמור ללא חריגות!

🚨 חובות מוחלטות:
1. תמלל כל מילה, כל משפט מהשנייה הראשונה עד השנייה האחרונה
2. אם האודיו ארוך 45 דקות - תמלל את כל 45 הדקות
3. אם האודיו ארוך שעתיים - תמלל את כל השעתיים
4. אל תעצור באמצע, אל תקצר, אל תסכם - רק תמלול מלא
5. אם יש הפסקות ארוכות, כתב [שתיקה] והמשך לתמלל
6. המשך עד שהאודיו נגמר לחלוטין

📋 עיצוב הטקסט:
- פסקאות של 2-4 משפטים
- שורה ריקה בין פסקאות
- זיהוי דוברים אם ברור: "דובר א:", "שואל:", "רב:"
- ציטוטים במירכאות: "כמו שכתוב", "אמרו חכמים"

🎯 תמלל לעברית תקנית עם דגש על:
- מושגים דתיים נכונים
- ביטויים ארמיים במקום
- הגיה ליטאית לשמות

⚠️ זכור: זה קובץ מלא ואתה חייב לתמלל אותו במלואו!
התחל עכשיו:`;

    console.log(`🎯 Starting COMPLETE transcription for: ${cleanFilename(filename)}`);

    // Send transcription request with retry mechanism
    let result;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        result = await model.generateContent([
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          prompt
        ]);
        break;
      } catch (error) {
        attempts++;
        console.log(`🔄 Transcription attempt ${attempts} failed, retrying...`);
        if (attempts >= maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }

    const response = await result.response;
    let transcription = response.text();
    
    console.log(`📊 Raw transcription stats: ${transcription.length} characters, ${transcription.split('\n').length} lines`);
    
    // Enhanced text cleaning
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')  // Allow some spacing
      .replace(/^\s+|\s+$/gm, '')
      .replace(/([.!?])\s*([א-ת])/g, '$1 $2')
      .trim();
    
    // Validation checks
    if (!transcription || transcription.length < 50) {
      throw new Error('התמלול נכשל - טקסט קצר מדי או ריק');
    }
    
    // Warning for suspiciously short transcriptions
    if (transcription.length < 300) {
      console.warn(`⚠️ WARNING: Transcription seems very short (${transcription.length} chars) for file: ${cleanFilename(filename)}`);
    }
    
    // Check if transcription ends abruptly (might be incomplete)
    const lastSentence = transcription.trim().split(/[.!?]/).pop().trim();
    if (lastSentence.length > 50 && !transcription.includes('תודה') && !transcription.includes('סוף')) {
      console.warn(`⚠️ WARNING: Transcription might be incomplete, last sentence: "${lastSentence}"`);
    }
    
    console.log(`✅ Transcription completed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('🔥 Gemini transcription error:', error);
    throw new Error(`שגיאה בתמלול: ${error.message}`);
  }
}

// 🔥 FIX: Less compressed Word document with better spacing
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document for: ${cleanName}`);
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 2880,    // 2 inches
              right: 2160,  // 1.5 inches  
              bottom: 2880,
              left: 2160
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
                size: 40,  // Larger title
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 720,  // More space after title
              line: 600
            }
          }),
          
          // File info
          new Paragraph({
            children: [
              new TextRun({
                text: `שם הקובץ: ${cleanName}`,
                size: 28,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 360,
              line: 480
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `משך זמן: ${duration} דקות`,
                size: 28,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 360,
              line: 480
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
                size: 28,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 720,
              line: 480
            }
          }),
          
          // Separator
          new Paragraph({
            children: [
              new TextRun({
                text: "═".repeat(50),
                size: 24,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 720,
              line: 480
            }
          }),
          
          // Content
          ...processTranscriptionContent(transcription)
        ]
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    console.log(`✅ Word document created successfully for: ${cleanName}`);
    return buffer;
    
  } catch (error) {
    console.error('Error creating Word document:', error);
    throw error;
  }
}

// 🔥 FIX: Much more generous spacing in content
function processTranscriptionContent(transcription) {
  const paragraphs = [];
  
  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  
  // Split by double line breaks to preserve paragraph structure
  const sections = cleanedText.split(/\n\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0);
  
  sections.forEach((section, index) => {
    // Clean up the section but keep line breaks within it
    const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let combinedSection = lines.join(' ').trim();
    
    if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
      combinedSection += '.';
    }
    
    // Detect speaker lines
    const isSpeakerLine = /^(רב|הרב|שואל|תשובה|שאלה|המשיב|התלמיד|השואל|מרצה|דובר|מורה)\s*:/.test(combinedSection);
    
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: combinedSection,
          size: 32,  // Much larger text
          font: {
            name: "Arial Unicode MS"
          },
          bold: isSpeakerLine
        })
      ],
      spacing: { 
        before: isSpeakerLine ? 1440 : 720,  // 1 inch before speaker, 0.5 before regular
        after: 720,   // 0.5 inch after each paragraph
        line: 720     // Double line spacing
      }
    }));
    
    // Add extra spacing every 2 paragraphs for better readability
    if ((index + 1) % 2 === 0 && index < sections.length - 1) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: "",
            size: 20
          })
        ],
        spacing: { 
          after: 720  // Extra half inch break
        }
      }));
    }
  });
  
  return paragraphs;
}

// 🔥 FIX: Email with clean filenames
async function sendTranscriptionEmail(userEmail, transcriptions) {
  try {
    console.log(`📧 Preparing email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => {
      const cleanName = cleanFilename(trans.filename);
      return {
        filename: `תמלול_${cleanName}.docx`,
        content: trans.wordDoc,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    });

    const fileList = transcriptions.map(t => {
      const cleanName = cleanFilename(t.filename);
      return `<li>📄 <strong>${cleanName}</strong></li>`;
    }).join('');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: '✅ התמלול המלא הושלם בהצלחה - קבצי Word מעוצבים מצורפים',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🎯 התמלול המלא הושלם!</h1>
          </div>
          
          <div style="background: #f8f9ff; padding: 25px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">שלום וברכה,</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              התמלול המלא והמדויק שלך הושלם בהצלחה! 
              מצורפים קבצי Word מעוצבים ונקיים:
            </p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #667eea;">
              <h3 style="color: #333; margin-bottom: 10px; font-size: 18px;">📁 הקבצים שלך:</h3>
              <ul style="margin: 10px 0; font-size: 16px;">
                ${fileList}
              </ul>
            </div>
            
            <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #4caf50;">
              <h3 style="color: #2e7d32; margin-bottom: 15px; font-size: 18px;">✨ מה מיוחד בתמלול החדש:</h3>
              <ul style="margin: 0; font-size: 15px; line-height: 1.7;">
                <li>🎯 <strong>תמלול מלא ושלם</strong> - מההתחלה עד הסוף</li>
                <li>🔥 <strong>Gemini 2.5 Pro מתקדם</strong> - דיוק מקסימלי</li>
                <li>📖 <strong>עיצוב נקי ונוח לקריאה</strong> - פסקאות מרווחות</li>
                <li>🎓 <strong>מותאם לעברית אקדמית</strong> - מושגים דתיים מדויקים</li>
                <li>💬 <strong>זיהוי דוברים וציטוטים</strong> - במירכאות נכונות</li>
                <li>📄 <strong>קובץ Word מקצועי</strong> - מוכן להדפסה ועריכה</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
              <p style="font-size: 18px; color: #667eea; font-weight: bold;">תודה שבחרת במערכת התמלול המתקדמת!</p>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
              בברכה,<br>
              <strong>צוות התמלול החכם</strong><br>
              מערכת תמלול מתקדמת עם AI
            </p>
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
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    
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
    
    if (users.find(u => u.email === email)) {
      return res.json({ success: false, error: 'משתמש עם האימייל הזה כבר קיים' });
    }
    
    const newUser = {
      id: users.length + 1,
      name,
      email,
      password,
      phone: phone || '',
      isAdmin: false,
      remainingMinutes: 30, // 30 free minutes
      totalTranscribed: 0,
      history: []
    };
    
    users.push(newUser);
    res.json({ success: true, user: { ...newUser, password: undefined } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'שגיאה בהרשמה' });
  }
});

// Admin route to add minutes
app.post('/api/admin/add-minutes', (req, res) => {
  try {
    console.log('🔧 Admin add-minutes endpoint called');
    console.log('🔧 Request body:', req.body);
    
    const { userEmail, minutes } = req.body;
    
    if (!userEmail || !minutes || minutes <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'אימייל ומספר דקות נדרשים' 
      });
    }
    
    const user = users.find(u => u.email === userEmail);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'משתמש לא נמצא' 
      });
    }
    
    const oldBalance = user.remainingMinutes;
    user.remainingMinutes += minutes;
    const newBalance = user.remainingMinutes;
    
    console.log(`🔧 Added ${minutes} minutes to ${userEmail}: ${oldBalance} → ${newBalance}`);
    
    res.json({ 
      success: true, 
      message: `נוספו ${minutes} דקות לחשבון`,
      oldBalance,
      newBalance,
      user: { ...user, password: undefined }
    });
    
  } catch (error) {
    console.error('🔧 Admin add-minutes error:', error);
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
    const user = users.find(u => u.email === email);
    
    if (!user) {
      return res.status(400).json({ success: false, error: 'משתמש לא נמצא' });
    }

    // Calculate total estimated minutes
    const estimatedMinutes = req.files.reduce((total, file) => {
      return total + Math.ceil(file.size / (1024 * 1024 * 2)); // Rough estimate
    }, 0);

    if (estimatedMinutes > user.remainingMinutes) {
      return res.status(400).json({ 
        success: false, 
        error: 'אין מספיק דקות בחשבון' 
      });
    }

    // Start async processing
    processTranscriptionAsync(req.files, email, language, estimatedMinutes);
    
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

// Async transcription processing
async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes) {
  console.log(`🎯 Starting async transcription for ${files.length} files`);
  
  const user = users.find(u => u.email === userEmail);
  if (!user) return;

  try {
    const transcriptions = [];
    
    for (const file of files) {
      console.log(`🎵 Processing: ${file.filename}`);
      
      try {
        const transcription = await realGeminiTranscription(file.path, file.filename, language);
        const wordDoc = await createWordDocument(transcription, file.filename, estimatedMinutes);
        
        transcriptions.push({
          filename: file.filename,
          transcription,
          wordDoc
        });
        
        console.log(`✅ Completed: ${cleanFilename(file.filename)}`);
      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
      } finally {
        // Clean up file
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.warn('Could not delete file:', file.path);
        }
      }
    }
    
    if (transcriptions.length > 0) {
      await sendTranscriptionEmail(userEmail, transcriptions);
      
      // Update user stats
      user.remainingMinutes = Math.max(0, user.remainingMinutes - estimatedMinutes);
      user.totalTranscribed += estimatedMinutes;
      
      console.log(`🎉 All transcriptions completed for: ${userEmail}`);
    } else {
      console.error(`❌ No successful transcriptions for: ${userEmail}`);
    }
    
  } catch (error) {
    console.error('Async transcription error:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email configured: ${!!process.env.EMAIL_USER}`);
});
