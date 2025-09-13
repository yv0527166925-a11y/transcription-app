const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process');
const JSZip = require('jszip');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Email transporter
const transporter = nodemailer.createTransporter({
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

// 🔥 PERSISTENT DATA SYSTEM
const DATA_DIR = 'data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Create data directories if they don't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Created data directory');
}

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('📁 Created backup directory');
}

// Directory for storing completed transcriptions
const transcriptionsDir = 'completed_transcriptions';
if (!fs.existsSync(transcriptionsDir)) {
  fs.mkdirSync(transcriptionsDir, { recursive: true });
}

// Default users (only used if no users.json exists)
const defaultUsers = [
  {
    id: 1,
    name: 'מנהל המערכת',
    email: 'admin@example.com',
    password: 'S3cur3P@ssw0rd_Adm!n25',
    isAdmin: true,
    remainingMinutes: 1000,
    totalTranscribed: 450,
    registrationDate: '2024-01-15',
    lastActivity: new Date().toISOString(),
    phone: '050-1234567',
    history: [
      {
        id: 1,
        date: '15/01/2024',
        fileName: 'ישיבת_צוות_ינואר',
        duration: 45,
        language: 'he',
        status: 'completed',
        downloadUrl: '#',
        downloadId: null,
        timestamp: '2024-01-15T10:30:00Z',
        wordCount: 2340
      }
    ]
  },
  {
    id: 2,
    name: 'יוסי כהן',
    email: 'test@example.com',
    password: 'test123',
    isAdmin: false,
    remainingMinutes: 150,
    totalTranscribed: 75,
    registrationDate: '2024-02-01',
    lastActivity: new Date().toISOString(),
    phone: '052-9876543',
    history: [
      {
        id: 3,
        date: '01/02/2024',
        fileName: 'שיעור_תלמוד_ראשון',
        duration: 60,
        language: 'he',
        status: 'completed',
        downloadUrl: '#',
        downloadId: null,
        timestamp: '2024-02-01T16:00:00Z',
        wordCount: 3200
      }
    ]
  }
];

// Load users from JSON file
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const loadedUsers = JSON.parse(data);
      console.log(`✅ Loaded ${loadedUsers.length} users from file`);
      return loadedUsers;
    } else {
      console.log('📄 No users file found, creating with default users');
      saveUsers(defaultUsers);
      return [...defaultUsers];
    }
  } catch (error) {
    console.error('❌ Error loading users:', error);
    console.log('🔄 Using default users as fallback');
    return [...defaultUsers];
  }
}

// Save users to JSON file with backup
function saveUsers(usersToSave) {
  try {
    // Create backup before saving
    if (fs.existsSync(USERS_FILE)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUP_DIR, `users_backup_${timestamp}.json`);
      fs.copyFileSync(USERS_FILE, backupFile);
      
      // Keep only last 10 backups
      cleanupOldBackups();
    }
    
    // Save current data
    const dataToSave = JSON.stringify(usersToSave, null, 2);
    fs.writeFileSync(USERS_FILE, dataToSave, 'utf8');
    console.log(`💾 Saved ${usersToSave.length} users to file`);
    
  } catch (error) {
    console.error('❌ Error saving users:', error);
  }
}

// Auto-save every 5 minutes
function startAutoSave() {
  setInterval(() => {
    saveUsers(users);
    console.log('🔄 Auto-saved users data');
  }, 5 * 60 * 1000);
}

// Cleanup old backup files (keep only last 10)
function cleanupOldBackups() {
  try {
    const backupFiles = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('users_backup_'))
      .sort()
      .reverse();
    
    if (backupFiles.length > 10) {
      const filesToDelete = backupFiles.slice(10);
      filesToDelete.forEach(file => {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
        console.log(`🗑️ Deleted old backup: ${file}`);
      });
    }
  } catch (error) {
    console.error('Error cleaning backups:', error);
  }
}

// Safe user addition function
function addUser(newUser) {
  const maxId = users.reduce((max, user) => Math.max(max, user.id || 0), 0);
  newUser.id = maxId + 1;
  newUser.registrationDate = new Date().toLocaleDateString('he-IL');
  newUser.lastActivity = new Date().toISOString();
  
  users.push(newUser);
  saveUsers(users);
  console.log(`➕ Added new user: ${newUser.email}`);
  return newUser;
}

// Initialize users from file
let users = loadUsers();

// Start auto-save system
startAutoSave();

console.log('🔄 Persistent data system initialized');
console.log(`👥 Current users: ${users.length}`);

// Graceful shutdown - save data before exit
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  saveUsers(users);
  console.log('💾 Final data save completed');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, saving data...');
  saveUsers(users);
  console.log('💾 Final data save completed');
  process.exit(0);
});

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
    let safeName = file.originalname;
    
    // Clean invalid characters but keep Hebrew
    safeName = safeName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    
    const finalName = `${timestamp}_${safeName}`;
    cb(null, finalName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp3|mp4|wav|m4a|mov|avi|mkv|flac|aac|ogg)$/i;
    if (allowedTypes.test(file.originalname) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('סוג קובץ לא נתמך'), false);
    }
  }
});

// Enhanced function to save transcription files for download
function saveTranscriptionForDownload(wordDoc, filename, userEmail) {
  try {
    const cleanName = cleanFilename(filename);
    const timestamp = Date.now();
    const savedFilename = `${timestamp}_${userEmail.replace('@', '_at_')}_${cleanName}.docx`;
    const savedPath = path.join(transcriptionsDir, savedFilename);
    
    fs.writeFileSync(savedPath, wordDoc);
    console.log(`💾 Saved transcription for download: ${savedFilename}`);
    
    return {
      downloadId: savedFilename,
      downloadUrl: `/api/download/${savedFilename}`,
      savedPath: savedPath
    };
  } catch (error) {
    console.error('Error saving transcription for download:', error);
    return null;
  }
}

// FFmpeg functions (existing code)
function checkFFmpegAvailability() {
  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });
    console.log('✅ FFmpeg is available - enhanced chunking enabled');
    return true;
  } catch (error) {
    console.warn('⚠️ FFmpeg not available - using direct transcription only');
    return false;
  }
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath
    ]);
    
    let stdout = '';
    
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(duration);
      } else {
        const stats = fs.statSync(filePath);
        const estimatedDuration = (stats.size / (1024 * 1024)) * 60;
        resolve(estimatedDuration);
      }
    });
    
    ffprobe.on('error', (error) => {
      const stats = fs.statSync(filePath);
      const estimatedDuration = (stats.size / (1024 * 1024)) * 60;
      resolve(estimatedDuration);
    });
  });
}

// Clean filename function
function cleanFilename(filename) {
  let cleaned = filename.replace(/^\d+_/, '');
  
  if (cleaned.includes('%')) {
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch (e) {}
  }
  
  try {
    if (cleaned.includes('Ã') || cleaned.includes('Â') || cleaned.includes('ª') || cleaned.charCodeAt(0) > 127) {
      const buffer = Buffer.from(cleaned, 'latin1');
      const utf8String = buffer.toString('utf8');
      if (utf8String.match(/[\u0590-\u05FF]/)) {
        cleaned = utf8String;
      }
    }
  } catch (e) {}
  
  cleaned = cleaned.replace(/\.[^/.]+$/, '');
  cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  
  if (!cleaned || cleaned.length < 2) {
    cleaned = 'קובץ_אודיו';
  }
  
  return cleaned;
}

// Enhanced Gemini transcription (existing functions)
async function realGeminiTranscription(filePath, filename, language) {
  try {
    const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
    const duration = await getAudioDuration(filePath);
    const durationMinutes = duration / 60;
    
    console.log(`🎵 Processing: ${cleanFilename(filename)}`);
    console.log(`📊 File size: ${fileSizeMB.toFixed(1)} MB, Duration: ${durationMinutes.toFixed(1)} minutes`);
    
    const ffmpegAvailable = checkFFmpegAvailability();
    const shouldChunk = ffmpegAvailable && (fileSizeMB > 25 || durationMinutes > 15);
    
    if (!shouldChunk) {
      console.log(`📝 Using direct transcription`);
      return await directGeminiTranscription(filePath, filename, language);
    }
    
    console.log(`🔪 Using chunked transcription`);
    return await chunkedGeminiTranscription(filePath, filename, language, durationMinutes);
    
  } catch (error) {
    console.error('🔥 Transcription error:', error);
    throw error;
  }
}

async function directGeminiTranscription(filePath, filename, language) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 65536
      }
    });
    
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    const fileSizeMB = audioData.length / (1024 * 1024);
    
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.m4a') mimeType = 'audio/mp4';
    else if (ext === '.mov') mimeType = 'video/quicktime';

    const prompt = `🚨 חובה מוחלטת: תמלל את כל הקובץ האודיו הזה מהתחלה עד הסוף הגמור!

קובץ: ${cleanFilename(filename)}
גודל: ${fileSizeMB.toFixed(1)} MB

🔥🔥🔥 הוראות קריטיות - אסור לך להתעלם מהן:

📚 פרטי הדובר והשיעור:
- הדובר: רב בעל מבטא ליטאי מובהק
- התוכן: השיעור כולל מושגים וציטוטים רבים בארמית

🎯 כללי תמלול מחייבים:
1. תיקון הגיית חולם: הדובר הוגה חולם (o) כ-"oi". תמלל בכתיב תקני:
   - "העוילום" → כתוב "העולם"
   - "יוידע" → כתוב "יודע"
   - "קוידש" → כתוב "קודש"
2. שימור מושגים בארמית: אל תתרגם ביטויים בארמית - תמלל בדיוק כפי שנאמרים
3. דיוק מוחלט: תמלל הכל ללא השמטות
4. תמלל כל שנייה, כל מילה, כל משפט מההתחלה ועד הסוף
5. אם האודיו ארוך 60 דקות - תמלל את כל 60 הדקות ללא יוצא מן הכלל
6. אל תעצור באמצע, אל תקצר, אל תסכם - רק תמלול מלא 100%
7. אם יש הפסקות או רעש - כתוב [הפסקה] והמשך לתמלל
8. המשך לתמלל עד שהאודיו נגמר לחלוטין

🎯 תמלל לעברית תקנית:
- מושגים דתיים מדויקים
- ציטוטים במירכאות: "כמו שכתוב", "אמרו חכמים", "תניא"
- פסקאות של 2-4 משפטים עם שורה ריקה

🚨 זה קובץ של ${fileSizeMB.toFixed(1)} MB - אני מצפה לתמלול ארוך ומפורט!
תתחיל עכשיו ותמלל הכל ללא חריגות:`;

    console.log(`🎯 Starting direct transcription for: ${cleanFilename(filename)}`);

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
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .trim();
    
    console.log(`✅ Direct transcription completed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('🔥 Direct transcription error:', error);
    throw error;
  }
}

// Word document creation
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document for: ${cleanName}`);

    const doc = new Document({
      creator: "תמלול חכם",
      language: "he-IL",
      defaultRunProperties: {
        font: "Times New Roman",
        size: 24,
        rtl: true
      },
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
              size: 24,
              rightToLeft: true,
              languageComplexScript: "he-IL"
            },
            paragraph: {
              alignment: AlignmentType.RIGHT,
              bidirectional: true
            }
          }
        },
        paragraphStyles: [
          {
            id: "HebrewParagraph",
            name: "Hebrew Paragraph",
            basedOn: "Normal",
            paragraph: {
              alignment: AlignmentType.RIGHT,
              bidirectional: true
            },
            run: {
              rightToLeft: true,
              languageComplexScript: "he-IL",
              font: "Arial"
            }
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: 2160,
              right: 1800,
              bottom: 2160,
              left: 1800
            },
            textDirection: "rtl"
          },
          rtlGutter: true,
          bidi: true,
          textDirection: "rtl"
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: cleanName,
                bold: true,
                size: 36,
                font: { name: "Arial" },
                rightToLeft: true,
                languageComplexScript: "he-IL"
              })
            ],
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            style: "HebrewParagraph",
            spacing: { 
              after: 480,
              line: 480
            }
          }),
          
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

    combinedSection = combinedSection
      .replace(/\s*\.\s*/g, '. ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*!\s*/g, '! ')
      .replace(/\s*\?\s*/g, '? ')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s+/g, ' ')
      .trim();

    if (combinedSection.length > 300) {
      const sentences = combinedSection.split(/(?<=[.!?])\s+/);
      let currentPara = '';
      
      for (const sentence of sentences) {
        if (currentPara.length + sentence.length > 300 && currentPara.length > 0) {
          paragraphs.push(new Paragraph({
            children: [
              new TextRun({
                text: currentPara.trim(),
                size: 24,
                font: { name: "Arial" },
                rightToLeft: true,
                languageComplexScript: "he-IL"
              })
            ],
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 120, line: 360 }
          }));
          currentPara = sentence + ' ';
        } else {
          currentPara += sentence + ' ';
        }
      }
      
      if (currentPara.trim()) {
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({
              text: currentPara.trim(),
              size: 24,
              font: { name: "Arial" },
              rightToLeft: true,
              languageComplexScript: "he-IL"
            })
          ],
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 120, line: 360 }
        }));
      }
      return;
    }
    
    if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
      combinedSection += '.';
    }
    
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: combinedSection,
          size: 24,
          font: { 
            name: "Arial"
          },
          rightToLeft: true,
          languageComplexScript: "he-IL"
        })
      ],
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      style: "HebrewParagraph",
      spacing: { 
        after: 120,
        line: 360
      }
    }));
  });
  
  return paragraphs;
}

// Enhanced email with failure reporting
async function sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions = []) {
  try {
    console.log(`📧 Preparing enhanced email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => {
      const cleanName = cleanFilename(trans.filename);
      return {
        filename: `תמלול_מלא_${cleanName}.docx`,
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
          <h3 style="color: #856404; margin-bottom: 15px; font-size: 18px;">⚠️ קבצים שלא הצליחו:</h3>
          <ul style="margin: 10px 0; font-size: 15px; color: #856404;">
            ${failureList}
          </ul>
        </div>
      `;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `✅ תמלול מלא הושלם - ${transcriptions.length} קבצי Word מעוצבים מצורפים`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 26px;">🎯 התמלול המלא הושלם בהצלחה!</h1>
          </div>
          
          <div style="background: #f8f9ff; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 25px;">שלום וברכה,</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #4caf50;">
              <h3 style="color: #2e7d32; margin-bottom: 15px; font-size: 18px;">✅ קבצים שהושלמו בהצלחה:</h3>
              <ul style="margin: 10px 0; font-size: 16px;">
                ${successList}
              </ul>
            </div>
            
            ${failureSection}
            
            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
              בברכה,<br>
              <strong>צוות התמלול החכם</strong>
            </p>
          </div>
        </div>
      `,
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Enhanced email sent successfully to: ${userEmail}`);
    
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
}

// Async transcription processing with persistent data
async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes) {
  console.log(`🎯 Starting enhanced async transcription with persistence for ${files.length} files`);
  
  const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
  if (!user) {
    console.error('❌ User not found during async processing:', userEmail);
    return;
  }

  try {
    const transcriptions = [];
    const failedTranscriptions = [];
    
    for (const file of files) {
      console.log(`🎵 Processing file: ${file.filename}`);
      
      try {
        const transcription = await realGeminiTranscription(file.path, file.filename, language);
        
        if (!transcription || transcription.trim().length < 50) {
          throw new Error('תמלול ריק או קצר מדי');
        }
        
        const wordDoc = await createWordDocument(transcription, file.filename, estimatedMinutes);
        
        transcriptions.push({
          filename: file.filename,
          transcription,
          wordDoc
        });
        
        console.log(`✅ Successfully processed: ${cleanFilename(file.filename)}`);
        
      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
        failedTranscriptions.push({
          filename: file.filename,
          error: fileError.message
        });
      } finally {
        try {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Cleaned up file: ${file.path}`);
        } catch (e) {
          console.warn('Could not delete file:', file.path, e.message);
        }
      }
    }
    
    if (transcriptions.length > 0) {
      await sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions);
      console.log(`📧 Email sent with ${transcriptions.length} successful transcriptions`);
      
      // 🔥 UPDATED: Save user data with persistent storage
      const actualMinutesUsed = Math.min(estimatedMinutes, user.remainingMinutes);
      user.remainingMinutes = Math.max(0, user.remainingMinutes - actualMinutesUsed);
      user.totalTranscribed += actualMinutesUsed;
      user.lastActivity = new Date().toISOString();
      
      // Add to history with download capability
      transcriptions.forEach((trans, index) => {
        const downloadInfo = saveTranscriptionForDownload(trans.wordDoc, trans.filename, userEmail);
        
        const historyItem = {
          id: Date.now() + Math.random() + index,
          date: new Date().toLocaleDateString('he-IL'),
          fileName: cleanFilename(trans.filename),
          duration: Math.ceil(estimatedMinutes / transcriptions.length),
          language: language || 'he',
          status: 'completed',
          downloadUrl: downloadInfo ? downloadInfo.downloadUrl : null,
          downloadId: downloadInfo ? downloadInfo.downloadId : null,
          timestamp: new Date().toISOString(),
          wordCount: trans.transcription.split(/\s+/).length
        };
        
        if (!user.history) {
          user.history = [];
        }
        
        user.history.push(historyItem);
        console.log(`📋 Added to history with download: ${historyItem.fileName}`);
      });
      
      // 🔥 SAVE IMMEDIATELY after processing
      saveUsers(users);
      console.log('💾 User data saved after transcription completion');
      
      console.log(`🎉 Transcription batch completed for: ${userEmail}`);
      console.log(`💰 Updated balance: ${user.remainingMinutes} minutes remaining`);
    } else {
      console.error(`❌ No transcriptions completed for: ${userEmail}`);
    }
    
  } catch (error) {
    console.error('Async transcription batch error:', error);
  }
}

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    ffmpegAvailable: checkFFmpegAvailability()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working!',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    emailConfigured: !!process.env.EMAIL_USER,
    ffmpegAvailable: checkFFmpegAvailability()
  });
});

// Enhanced login route with persistent data
app.post('/api/login', (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.json({ success: false, error: 'אימייל וסיסמה נדרשים' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (user) {
      user.lastActivity = new Date().toISOString();
      saveUsers(users);
      
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

// Enhanced registration route with persistent data
app.post('/api/register', (req, res) => {
  try {
    console.log('📝 Registration attempt:', req.body);
    
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password) {
      return res.json({ success: false, error: 'שם, אימייל וסיסמה נדרשים' });
    }
    
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      console.log('❌ User already exists:', email);
      return res.json({ success: false, error: 'משתמש עם האימייל הזה כבר קיים' });
    }
    
    const newUser = {
      name,
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      isAdmin: false,
      remainingMinutes: 30,
      totalTranscribed: 0,
      history: []
    };
    
    const addedUser = addUser(newUser);
    console.log('✅ User registered successfully:', addedUser.email);
    
    res.json({ success: true, user: { ...addedUser, password: undefined } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהרשמה' });
  }
});

// Enhanced admin add-minutes route
app.post('/api/admin/add-minutes', (req, res) => {
  try {
    console.log('🔧 Admin add-minutes endpoint called');
    
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
    user.lastActivity = new Date().toISOString();
    const newBalance = user.remainingMinutes;
    
    saveUsers(users);
    
    console.log(`✅ Added ${minutes} minutes to ${userEmail}: ${oldBalance} → ${newBalance}`);
    
    res.json({ 
      success: true, 
      message: `נוספו ${minutes} דקות לחשבון ${userEmail}`,
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

// Admin route to get all users
app.get('/api/admin/users', (req, res) => {
  try {
    console.log('🔧 Admin users list request');
    
    const usersList = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      remainingMinutes: user.remainingMinutes,
      totalTranscribed: user.totalTranscribed,
      registrationDate: user.registrationDate || 'לא זמין',
      lastActivity: user.lastActivity || 'לא זמין',
      historyCount: user.history ? user.history.length : 0,
      phone: user.phone || ''
    }));
    
    console.log(`📋 Returning ${usersList.length} users to admin panel`);
    
    res.json({ 
      success: true, 
      users: usersList,
      totalUsers: usersList.length,
      totalMinutesInSystem: usersList.reduce((sum, u) => sum + u.remainingMinutes, 0),
      totalTranscribedInSystem: usersList.reduce((sum, u) => sum + u.totalTranscribed, 0)
    });
    
  } catch (error) {
    console.error('🔧 Admin users list error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'שגיאה בטעינת רשימת המשתמשים' 
    });
  }
});

// Download route for transcription files
app.get('/api/download/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    const filePath = path.join(transcriptionsDir, fileId);
    
    console.log(`📥 Download request for: ${fileId}`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${fileId}`);
      return res.status(404).json({ success: false, error: 'קובץ לא נמצא' });
    }
    
    const parts = fileId.split('_');
    if (parts.length >= 3) {
      const originalParts = parts.slice(2);
      const originalName = originalParts.join('_');
      const displayName = `תמלול_${originalName}`;
      
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      
      console.log(`✅ Serving download: ${displayName}`);
      res.sendFile(path.resolve(filePath));
    } else {
      res.download(filePath, `תמלול_${fileId}`);
    }
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהורדת הקובץ' });
  }
});

// Data health check endpoint
app.get('/api/health/data', (req, res) => {
  try {
    const dataStatus = {
      usersFileExists: fs.existsSync(USERS_FILE),
      usersCount: users.length,
      dataDirectory: fs.existsSync(DATA_DIR),
      backupDirectory: fs.existsSync(BACKUP_DIR),
      lastSave: fs.existsSync(USERS_FILE) ? fs.statSync(USERS_FILE).mtime : null,
      backupCount: fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).length : 0,
      memoryUsersCount: users.length,
      transcriptionsDirectory: fs.existsSync(transcriptionsDir)
    };
    
    res.json({
      success: true,
      message: 'Data system is healthy',
      data: dataStatus,
      users: users.map(u => ({
        email: u.email,
        name: u.name,
        isAdmin: u.isAdmin,
        remainingMinutes: u.remainingMinutes,
        historyCount: u.history ? u.history.length : 0,
        lastActivity: u.lastActivity
      }))
    });
    
  } catch (error) {
    console.error('Data health check error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בבדיקת תקינות הנתונים',
      details: error.message
    });
  }
});

// Manual save endpoint
app.post('/api/admin/save-data', (req, res) => {
  try {
    saveUsers(users);
    res.json({
      success: true,
      message: 'הנתונים נשמרו בהצלחה',
      timestamp: new Date().toISOString(),
      usersCount: users.length
    });
    
  } catch (error) {
    console.error('Manual save error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בשמירת הנתונים',
      details: error.message
    });
  }
});

// Enhanced transcription route
app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
    console.log('🎯 Enhanced transcription request received');
    console.log('📁 Files uploaded:', req.files?.length || 0);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'לא נבחרו קבצים' });
    }

    const { email, language } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'אימייל נדרש' });
    }
    
    const ffmpegAvailable = checkFFmpegAvailability();
    if (!ffmpegAvailable) {
      console.warn('⚠️ FFmpeg not available - using fallback transcription only');
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      console.log('❌ User not found for transcription:', email);
      return res.status(400).json({ success: false, error: `משתמש לא נמצא: ${email}` });
    }

    // Calculate total estimated minutes ACCURATELY
    let totalDurationSeconds = 0;
    for (const file of req.files) {
        try {
            const duration = await getAudioDuration(file.path); 
            totalDurationSeconds += duration;
        } catch (error) {
            console.error(`Could not get duration for ${file.filename}, falling back to size estimate.`, error);
            totalDurationSeconds += (file.size / (1024 * 1024 * 2)) * 60;
        }
    }

    const accurateMinutes = Math.ceil(totalDurationSeconds / 60);

    console.log(`⏱️ Accurate minutes calculated: ${accurateMinutes}, User balance: ${user.remainingMinutes}`);

    if (accurateMinutes > user.remainingMinutes) {
        console.log('❌ Insufficient minutes, deleting uploaded files.');
        for (const file of req.files) {
            try {
                fs.unlinkSync(file.path);
            } catch (e) {
                console.warn(`Could not delete file ${file.path} after failed check.`)
            }
        }
        return res.status(400).json({
            success: false,
            error: `אין מספיק דקות בחשבון. נדרש: ${accurateMinutes}, זמין: ${user.remainingMinutes}`
        });
    }

    // Start enhanced async processing
    processTranscriptionAsync(req.files, email, language, accurateMinutes);

    console.log('✅ Enhanced transcription started successfully with accurate minute count.');
    res.json({
        success: true,
        message: ffmpegAvailable ?
            'התמלול המתקדם התחיל - קבצים גדולים יתחלקו למקטעים אוטומטית' :
            'התמלול התחיל - ללא חלוקה למקטעים (FFmpeg לא זמין)',
        estimatedMinutes: accurateMinutes,
        chunkingEnabled: ffmpegAvailable
    });
  } catch (error) {
    console.error('Enhanced transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enhanced startup message with data persistence info
app.listen(PORT, () => {
  console.log(`\n🚀 Enhanced server running on port ${PORT}`);
  console.log(`🔑 Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email configured: ${!!process.env.EMAIL_USER}`);
  console.log(`🔧 FFmpeg available: ${checkFFmpegAvailability()}`);
  console.log(`🎯 Enhanced features: Smart chunking for large files, complete transcription guarantee`);
  
  console.log(`\n💾 PERSISTENT DATA SYSTEM STATUS:`);
  console.log(`   📁 Data directory: ${DATA_DIR} ${fs.existsSync(DATA_DIR) ? '✅' : '❌'}`);
  console.log(`   📄 Users file: ${fs.existsSync(USERS_FILE) ? '✅' : '❌'}`);
  console.log(`   📂 Backup directory: ${fs.existsSync(BACKUP_DIR) ? '✅' : '❌'}`);
  console.log(`   👥 Users loaded: ${users.length}`);
  console.log(`   🔄 Auto-save: Every 5 minutes`);
  console.log(`   🛡️ Graceful shutdown: Enabled`);
  
  if (fs.existsSync(BACKUP_DIR)) {
    const backupCount = fs.readdirSync(BACKUP_DIR).length;
    console.log(`   📦 Available backups: ${backupCount}`);
  }
  
  console.log(`\n🔧 ADMIN ACCESS:`);
  const adminUser = users.find(u => u.isAdmin);
  if (adminUser) {
    console.log(`   👑 Admin email: ${adminUser.email}`);
    console.log(`   🔐 Admin login: ✅ Available`);
    console.log(`   🛠️ Data control panel: ✅ Enabled`);
  }
  
  console.log(`\n📊 CURRENT SYSTEM STATUS:`);
  const totalMinutes = users.reduce((sum, u) => sum + u.remainingMinutes, 0);
  const totalTranscribed = users.reduce((sum, u) => sum + u.totalTranscribed, 0);
  const totalHistory = users.reduce((sum, u) => sum + (u.history ? u.history.length : 0), 0);
  
  console.log(`   👥 Total users: ${users.length}`);
  console.log(`   ⏱️ Total available minutes: ${totalMinutes}`);
  console.log(`   📝 Total transcribed minutes: ${totalTranscribed}`);
  console.log(`   📋 Total history items: ${totalHistory}`);
  
  console.log(`\n🌟 SYSTEM READY! No more data loss on restart! 🎉\n`);
});
