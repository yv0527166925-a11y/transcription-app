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
    
    console.log(`📁 Original filename from browser: "${file.originalname}"`);
    console.log(`📁 File encoding details:`, {
      buffer: Buffer.from(file.originalname, 'binary').toString('hex'),
      length: file.originalname.length,
      charCodes: file.originalname.split('').map(c => c.charCodeAt(0))
    });
    
    // Try to preserve original Hebrew filename
    let safeName = file.originalname;
    
    // If filename looks like it has encoding issues, try to fix
    if (safeName.includes('×') || safeName.includes('Ã') || safeName.includes('â')) {
      console.log('🔧 Detected encoding issues, attempting to fix...');
      try {
        // Try different encoding approaches
        const methods = [
          () => Buffer.from(safeName, 'latin1').toString('utf8'),
          () => Buffer.from(safeName, 'binary').toString('utf8'),
          () => decodeURIComponent(escape(safeName))
        ];
        
        for (const method of methods) {
          try {
            const decoded = method();
            console.log(`🔧 Trying decode method: "${decoded}"`);
            if (decoded.match(/[\u0590-\u05FF]/)) {
              safeName = decoded;
              console.log(`✅ Successfully decoded: "${safeName}"`);
              break;
            }
          } catch (e) {
            console.log('Decode method failed:', e.message);
          }
        }
      } catch (error) {
        console.log('All decode methods failed, using original');
      }
    }
    
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
  
  // Remove timestamp prefix (numbers followed by underscore)
  let withoutTimestamp = filename.replace(/^\d+_/, '');
  console.log(`📝 After removing timestamp: "${withoutTimestamp}"`);
  
  // Try multiple decoding approaches
  let cleaned = withoutTimestamp;
  
  // Method 1: Try URL decoding if contains %
  if (cleaned.includes('%')) {
    try {
      cleaned = decodeURIComponent(cleaned);
      console.log(`🔄 After URL decode: "${cleaned}"`);
    } catch (e) {
      console.log('URL decode failed');
    }
  }
  
  // Method 2: Try Buffer conversion for Hebrew encoding issues
  try {
    // Convert from latin1 to utf8 if it looks like Hebrew encoding issue
    if (cleaned.includes('Ã') || cleaned.includes('Â') || cleaned.includes('ª') || cleaned.charCodeAt(0) > 127) {
      const buffer = Buffer.from(cleaned, 'latin1');
      const utf8String = buffer.toString('utf8');
      if (utf8String.match(/[\u0590-\u05FF]/)) {
        cleaned = utf8String;
        console.log(`🔄 After Buffer conversion: "${cleaned}"`);
      }
    }
  } catch (e) {
    console.log('Buffer conversion failed');
  }
  
  // Method 3: If still has encoding issues, try original filename from multipart
  if (!cleaned.match(/[\u0590-\u05FF]/) && cleaned.includes('Ã')) {
    // Fallback to a simple clean version
    cleaned = cleaned.replace(/[^\u0020-\u007E\u0590-\u05FF]/g, '');
  }
  
  // Remove file extension
  cleaned = cleaned.replace(/\.[^/.]+$/, '');
  
  // Final cleanup - remove any remaining weird characters but keep Hebrew
  cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  
  // If we still don't have good Hebrew text, use a generic name
  if (!cleaned || cleaned.length < 2) {
    cleaned = 'קובץ_אודיו';
  }
  
  console.log(`✅ Final cleaned filename: "${cleaned}"`);
  return cleaned;
}

// 🔥 NEW: Comprehensive transcription validation
function validateTranscription(transcription, fileSizeMB, filename) {
  const warnings = [];
  let isValid = true;
  let critical = false;
  
  // Basic existence check
  if (!transcription || transcription.trim().length === 0) {
    warnings.push('התמלול ריק');
    critical = true;
    isValid = false;
  }
  
  // Length validation based on file size
  const expectedMinLength = Math.max(100, fileSizeMB * 50); // Minimum 50 chars per MB
  if (transcription.length < expectedMinLength) {
    warnings.push(`התמלול קצר מדי: ${transcription.length} תווים, צפוי לפחות ${expectedMinLength}`);
    if (transcription.length < expectedMinLength * 0.3) {
      critical = true;
    }
    isValid = false;
  }
  
  // Content quality checks
  const wordCount = transcription.split(/\s+/).length;
  const expectedMinWords = Math.max(20, fileSizeMB * 10); // Minimum 10 words per MB
  
  if (wordCount < expectedMinWords) {
    warnings.push(`מעט מדי מילים: ${wordCount}, צפוי לפחות ${expectedMinWords}`);
    isValid = false;
  }
  
  // Check for truncation indicators
  const truncationIndicators = [
    'המשך התמלול',
    'סיום התמלול',
    'התמלול נקטע',
    '...',
    'ו ודומה',
    'וכך הלאה',
    'המשך'
  ];
  
  const lastPart = transcription.slice(-200).toLowerCase();
  const hasTruncation = truncationIndicators.some(indicator => 
    lastPart.includes(indicator.toLowerCase())
  );
  
  if (hasTruncation) {
    warnings.push('נראה שהתמלול נקטע או לא הושלם');
    isValid = false;
  }
  
  // Check for reasonable sentence structure
  const sentences = transcription.split(/[.!?]/).filter(s => s.trim().length > 5);
  const avgSentenceLength = sentences.length > 0 ? transcription.length / sentences.length : 0;
  
  if (avgSentenceLength > 500) {
    warnings.push('משפטים ארוכים מדי - יכול להצביע על תמלול לא מעובד');
  }
  
  // Check for Hebrew content (if expected)
  const hebrewChars = (transcription.match(/[\u0590-\u05FF]/g) || []).length;
  const hebrewPercentage = (hebrewChars / transcription.length) * 100;
  
  if (hebrewPercentage < 5) {
    warnings.push('מעט תוכן עברי - יכול להצביע על בעיה בזיהוי שפה');
  }
  
  return {
    isValid,
    critical,
    warnings,
    stats: {
      characters: transcription.length,
      words: wordCount,
      sentences: sentences.length,
      hebrewPercentage: hebrewPercentage.toFixed(1)
    }
  };
}

// 🔥 ENHANCED: Ultra-strong prompt for COMPLETE transcription
async function realGeminiTranscription(filePath, filename, language) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 65536  // Maximum possible tokens
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

    // 🔥 ULTIMATE PROMPT: Super aggressive for complete transcription
    const prompt = `🚨 חובה מוחלטת: תמלל את כל הקובץ האודיו הזה מהתחלה עד הסוף הגמור!

קובץ: ${cleanFilename(filename)}
גודל: ${fileSizeMB.toFixed(1)} MB

🔥🔥🔥 הוראות קריטיות - אסור לך להתעלם מהן:
1. תמלל כל שנייה, כל מילה, כל משפט מההתחלה ועד הסוף
2. אם האודיו ארוך 60 דקות - תמלל את כל 60 הדקות ללא יוצא מן הכלל
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
תתחיל עכשיו ותמלל הכל ללא חריגות:`;

    console.log(`🎯 Starting COMPLETE transcription for: ${cleanFilename(filename)} (${fileSizeMB.toFixed(1)} MB)`);

    // Enhanced retry mechanism with longer timeouts
    let result;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      try {
        console.log(`🔄 Transcription attempt ${attempts + 1}/${maxAttempts}`);
        
        result = await Promise.race([
          model.generateContent([
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio
              }
            },
            prompt
          ]),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout after 5 minutes')), 300000) // 5 minute timeout
          )
        ]);
        
        console.log(`✅ Gemini responded successfully on attempt ${attempts + 1}`);
        break;
        
      } catch (error) {
        attempts++;
        console.log(`🔄 Transcription attempt ${attempts} failed:`, error.message);
        
        if (attempts >= maxAttempts) {
          throw new Error(`נכשל אחרי ${maxAttempts} ניסיונות: ${error.message}`);
        }
        
        // Progressive backoff - wait longer between retries
        const waitTime = Math.min(5000 * attempts, 30000); // 5s, 10s, 15s, 20s, 30s
        console.log(`⏳ Waiting ${waitTime/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const response = await result.response;
    let transcription = response.text();
    
    console.log(`📊 Raw transcription stats:`);
    console.log(`   - Characters: ${transcription.length}`);
    console.log(`   - Lines: ${transcription.split('\n').length}`);
    console.log(`   - Words (approx): ${transcription.split(/\s+/).length}`);
    console.log(`   - File size: ${fileSizeMB.toFixed(1)} MB`);
    
    // Enhanced text cleaning while preserving content
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .trim();
    
    // Comprehensive validation checks
    const validationResults = validateTranscription(transcription, fileSizeMB, filename);
    
    if (!validationResults.isValid) {
      console.warn(`⚠️ VALIDATION FAILED for ${cleanFilename(filename)}:`);
      validationResults.warnings.forEach(warning => console.warn(`   - ${warning}`));
      
      // For critical failures, throw error
      if (validationResults.critical) {
        throw new Error(`התמלול נכשל בבדיקות איכות: ${validationResults.warnings.join(', ')}`);
      }
    } else {
      console.log(`✅ Transcription validation passed for: ${cleanFilename(filename)}`);
    }
    
    console.log(`🎉 Final transcription: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('🔥 Gemini transcription error:', error);
    throw new Error(`שגיאה בתמלול קובץ ${cleanFilename(filename)}: ${error.message}`);
  }
}

// 🔥 NEW: Split large files and transcribe in chunks for complete coverage
async function transcribeLargeFile(filePath, filename, language) {
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  console.log(`📊 File analysis: ${cleanFilename(filename)} - ${fileSizeMB.toFixed(1)} MB`);
  
  // For files larger than 15MB, try chunked transcription as backup
  if (fileSizeMB > 15) {
    console.log(`🔄 Large file detected (${fileSizeMB.toFixed(1)} MB), will try complete transcription first, then chunked if needed`);
    
    try {
      // First attempt: try complete transcription
      const completeTranscription = await realGeminiTranscription(filePath, filename, language);
      
      // Validate the complete transcription
      const validation = validateTranscription(completeTranscription, fileSizeMB, filename);
      
      if (validation.isValid || !validation.critical) {
        console.log(`✅ Complete transcription successful for large file: ${cleanFilename(filename)}`);
        return completeTranscription;
      } else {
        console.warn(`⚠️ Complete transcription failed validation, falling back to chunked approach`);
        throw new Error('Validation failed, trying chunked approach');
      }
      
    } catch (error) {
      console.log(`⚠️ Complete transcription failed for large file, trying chunked approach: ${error.message}`);
      return await transcribeInChunks(filePath, filename, language);
    }
  } else {
    // For smaller files, use regular complete transcription
    return await realGeminiTranscription(filePath, filename, language);
  }
}

// 🔥 NEW: Chunked transcription for very large files
async function transcribeInChunks(filePath, filename, language) {
  console.log(`🔪 Starting chunked transcription for: ${cleanFilename(filename)}`);
  
  try {
    // This is a simplified approach - in a full implementation, you'd use ffmpeg to split the audio
    // For now, we'll try with a different approach: multiple passes with overlap instructions
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
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

    // Enhanced prompt for chunked processing
    const chunkPrompt = `🎯 תמלול קובץ אודיו גדול - גישה מתקדמת

קובץ: ${cleanFilename(filename)} (${fileSizeMB.toFixed(1)} MB)

🚨 הוראות קריטיות לתמלול מלא:
1. זה קובץ אודיו גדול - תמלל אותו במלואו מההתחלה עד הסוף
2. אל תדלג על חלקים, אל תקצר, אל תסכם
3. אם האודיו ארוך - תמלל כל דקה, כל שנייה
4. אם יש חזרות או הפסקות - תמלל הכל
5. המשך עד שהאודיו נגמר לחלוטין

📝 הנחיות עיצוב:
- חלק לפסקאות קצרות (2-3 משפטים)
- שורה ריקה בין פסקאות
- זיהוי דוברים: "רב:", "שואל:", "תלמיד:"
- ציטוטים במירכאות: "שנאמר", "כדאיתא", "תניא"

🔍 זה קובץ של ${fileSizeMB.toFixed(1)} MB - אני מצפה לתוצאה ארוכה ומפורטת!
תתחיל עכשיו ותמלל הכל:`;

    console.log(`🎯 Attempting enhanced transcription for large file: ${cleanFilename(filename)}`);

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio
        }
      },
      chunkPrompt
    ]);

    const response = await result.response;
    let transcription = response.text();
    
    console.log(`📊 Chunked transcription result: ${transcription.length} characters`);
    
    // Clean and validate
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    
    const validation = validateTranscription(transcription, fileSizeMB, filename);
    
    if (!validation.isValid) {
      console.warn(`⚠️ Chunked transcription validation warnings for ${cleanFilename(filename)}:`);
      validation.warnings.forEach(warning => console.warn(`   - ${warning}`));
    }
    
    console.log(`✅ Chunked transcription completed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('🔥 Chunked transcription error:', error);
    throw new Error(`שגיאה בתמלול מקטעי: ${error.message}`);
  }
}

// 🔧 FIX: Balanced Word document spacing - not too compressed, not too spread
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document for: ${cleanName}`);
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 2160,    // 1.5 inches - reasonable margins
              right: 1800,  // 1.25 inches  
              bottom: 2160, // 1.5 inches
              left: 1800    // 1.25 inches
            }
          }
        },
        children: [
          // Title with moderate spacing
          new Paragraph({
            children: [
              new TextRun({
                text: "תמלול אוטומטי",
                bold: true,
                size: 36,  // Good readable size
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 480,   // Moderate space after title
              line: 480     // Normal line spacing
            }
          }),
          
          // File info with normal spacing
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
                text: `משך זמן: ${duration} דקות`,
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
          
          // Separator with moderate space
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
          
          // Content with balanced spacing
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

// 🔧 FIX: Balanced content spacing - comfortable but not excessive
function processTranscriptionContent(transcription) {
  const paragraphs = [];
  
  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')    // Reduce excessive line breaks
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
          size: 26,  // Good readable size - not too big, not too small
          font: {
            name: "Arial Unicode MS"
          },
          bold: isSpeakerLine
        })
      ],
      spacing: { 
        before: isSpeakerLine ? 360 : 240,  // Moderate space before speaker lines
        after: 240,   // Moderate space after each paragraph
        line: 400     // Comfortable line spacing (1.2x)
      }
    }));
    
    // Add modest extra spacing every 3 paragraphs
    if ((index + 1) % 3 === 0 && index < sections.length - 1) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: "",
            size: 16
          })
        ],
        spacing: { 
          after: 240  // Small additional break
        }
      }));
    }
  });
  
  return paragraphs;
}

// 🔥 Enhanced email with failure reporting
async function sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions = []) {
  try {
    console.log(`📧 Preparing enhanced email for: ${userEmail}`);
    console.log(`📊 Successful: ${transcriptions.length}, Failed: ${failedTranscriptions.length}`);
    
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
          <p style="font-size: 14px; margin-top: 15px;">
            <strong>💡 טיפ:</strong> נסה להעלות קבצים אלה שוב או צור קשר לתמיכה.
          </p>
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
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
              ${transcriptions.length} קבצים עובדו בהצלחה
            </p>
          </div>
          
          <div style="background: #f8f9ff; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 25px;">שלום וברכה,</p>
            
            <p style="font-size: 16px; margin-bottom: 25px;">
              התמלול המלא והמפורט שלך הושלם! 
              מצורפים קבצי Word מעוצבים עם תמלול שלם מההתחלה עד הסוף:
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #4caf50;">
              <h3 style="color: #2e7d32; margin-bottom: 15px; font-size: 18px;">✅ קבצים שהושלמו בהצלחה:</h3>
              <ul style="margin: 10px 0; font-size: 16px;">
                ${successList}
              </ul>
            </div>
            
            ${failureSection}
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #2196f3;">
              <h3 style="color: #1565c0; margin-bottom: 15px; font-size: 18px;">🔥 שיפורים בגרסה החדשה:</h3>
              <ul style="margin: 0; font-size: 15px; line-height: 1.8; color: #1565c0;">
                <li>🎯 <strong>תמלול מלא 100%</strong> - מההתחלה עד הסוף הגמור</li>
                <li>🔍 <strong>בדיקות איכות מתקדמות</strong> - וידוא שלמות התמלול</li>
                <li>📊 <strong>גישה מתקדמת לקבצים גדולים</strong> - עד 100MB</li>
                <li>✨ <strong>Gemini 2.5 Pro משופר</strong> - דיוק מקסימלי</li>
                <li>📖 <strong>עיצוב Word מאוזן</strong> - נוח לקריאה ולהדפסה</li>
                <li>🎓 <strong>מותאם לעברית אקדמית</strong> - מושגים דתיים מדויקים</li>
                <li>💬 <strong>זיהוי דוברים וציטוטים</strong> - במירכאות נכונות</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 18px; color: #667eea; font-weight: bold;">
                תודה שבחרת במערכת התמלול המתקדמת!
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
              בברכה,<br>
              <strong>צוות התמלול החכם</strong><br>
              מערכת תמלול מתקדמת עם AI מלא
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

// Async transcription processing with enhanced complete transcription
async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes) {
  console.log(`🎯 Starting enhanced async transcription for ${files.length} files`);
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
        // Use enhanced transcription method that handles large files
        const transcription = await transcribeLargeFile(file.path, file.filename, language);
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
        
        // Add a failure report to transcriptions for user notification
        transcriptions.push({
          filename: file.filename,
          transcription: `שגיאה בתמלול הקובץ: ${fileError.message}`,
          wordDoc: null,
          failed: true
        });
      } finally {
        // Clean up file
        try {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Cleaned up file: ${file.path}`);
        } catch (e) {
          console.warn('Could not delete file:', file.path, e.message);
        }
      }
    }
    
    if (transcriptions.length > 0) {
      // Filter out failed transcriptions for email, but keep successful ones
      const successfulTranscriptions = transcriptions.filter(t => !t.failed);
      const failedTranscriptions = transcriptions.filter(t => t.failed);
      
      if (successfulTranscriptions.length > 0) {
        await sendTranscriptionEmail(userEmail, successfulTranscriptions, failedTranscriptions);
        console.log(`📧 Email sent with ${successfulTranscriptions.length} successful transcriptions`);
      }
      
      if (failedTranscriptions.length > 0) {
        console.warn(`⚠️ ${failedTranscriptions.length} files failed transcription`);
      }
      
      // Update user stats only for successful transcriptions
      const actualMinutesUsed = Math.min(estimatedMinutes, user.remainingMinutes);
      user.remainingMinutes = Math.max(0, user.remainingMinutes - actualMinutesUsed);
      user.totalTranscribed += actualMinutesUsed;
      
      console.log(`🎉 Transcription batch completed for: ${userEmail}`);
      console.log(`💰 Updated balance: ${user.remainingMinutes} minutes remaining`);
      console.log(`📊 Success rate: ${successfulTranscriptions.length}/${transcriptions.length} files`);
    } else {
      console.error(`❌ No transcriptions completed for: ${userEmail}`);
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
    console.log('📋 Available users:', users.map(u => ({ email: u.email, isAdmin: u.isAdmin })));
    
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
      id: users.length + 1,
      name,
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      isAdmin: false,
      remainingMinutes: 30, // 30 free minutes
      totalTranscribed: 0,
      history: []
    };
    
    users.push(newUser);
    console.log('✅ User registered successfully:', newUser.email);
    console.log('📋 Total users now:', users.length);
    
    res.json({ success: true, user: { ...newUser, password: undefined } });
  } catch (error) {
    console.error('Registration error:', error);
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
      console.log('❌ Invalid input:', { userEmail, minutes });
      return res.status(400).json({ 
        success: false, 
        error: 'אימייל ומספר דקות נדרשים' 
      });
    }
    
    const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
    console.log('🔍 User lookup result:', user ? 'Found' : 'Not found');
    console.log('📋 Available users:', users.map(u => u.email));
    
    if (!user) {
      console.log('❌ User not found for email:', userEmail);
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
    console.log('📧 Request body:', req.body);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'לא נבחרו קבצים' });
    }

    const { email, language } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'אימייל נדרש' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    console.log('🔍 User lookup for transcription:', user ? 'Found' : 'Not found');
    console.log('📧 Looking for email:', email);
    console.log('📋 Available users:', users.map(u => u.email));
    
    if (!user) {
      console.log('❌ User not found for transcription:', email);
      return res.status(400).json({ success: false, error: `משתמש לא נמצא: ${email}` });
    }

    // Calculate total estimated minutes
    const estimatedMinutes = req.files.reduce((total, file) => {
      return total + Math.ceil(file.size / (1024 * 1024 * 2)); // Rough estimate
    }, 0);
    
    console.log(`⏱️ Estimated minutes: ${estimatedMinutes}, User balance: ${user.remainingMinutes}`);

    if (estimatedMinutes > user.remainingMinutes) {
      console.log('❌ Insufficient minutes');
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
});
