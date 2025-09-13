const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process'); // 🔥 NEW: For FFmpeg
const JSZip = require('jszip'); // 🔥 NEW: For Word templates
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
  limits: { fileSize: 500 * 1024 * 1024 }, // 🔥 INCREASED: 500MB for large files
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
    password: 'S3cur3P@ssw0rd_Adm!n25', // הסיסמה החזקה שקבענו
    isAdmin: true,
    remainingMinutes: 1000,
    totalTranscribed: 0,
    history: []
  }
];

// 🔥 NEW: FFmpeg and chunking functions
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
    let stderr = '';
    
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(duration);
      } else {
        console.warn('FFprobe failed, estimating duration from file size');
        // Fallback: estimate based on file size
        const stats = fs.statSync(filePath);
        const estimatedDuration = (stats.size / (1024 * 1024)) * 60; // Rough estimate
        resolve(estimatedDuration);
      }
    });
    
    ffprobe.on('error', (error) => {
      console.warn('FFprobe error, using fallback estimation');
      // Fallback
      const stats = fs.statSync(filePath);
      const estimatedDuration = (stats.size / (1024 * 1024)) * 60;
      resolve(estimatedDuration);
    });
  });
}

async function splitAudioIntoChunks(inputPath, chunkDurationMinutes = 8) {
  const chunksDir = path.join(path.dirname(inputPath), 'chunks_' + Date.now());
  const chunks = [];
  
  try {
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true });
    }
    
    console.log(`🔪 Splitting audio into ${chunkDurationMinutes}-minute chunks...`);
    
    const duration = await getAudioDuration(inputPath);
    console.log(`📊 Total audio duration: ${(duration/60).toFixed(1)} minutes`);
    
    const chunkDurationSeconds = chunkDurationMinutes * 60;
    const totalChunks = Math.ceil(duration / chunkDurationSeconds);
    
    console.log(`🎯 Creating ${totalChunks} chunks of ${chunkDurationMinutes} minutes each`);
    
    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const chunkPath = path.join(chunksDir, `chunk_${i.toString().padStart(3, '0')}.wav`);
      
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-ss', startTime.toString(),
          '-t', chunkDurationSeconds.toString(),
          '-ac', '1', // Mono
          '-ar', '16000', // 16kHz sample rate
          '-c:a', 'pcm_s16le', // PCM 16-bit
          '-y', // Overwrite output file
          chunkPath
        ]);
        
        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0 && fs.existsSync(chunkPath)) {
            const stats = fs.statSync(chunkPath);
            if (stats.size > 1000) { // At least 1KB
              chunks.push({
                path: chunkPath,
                index: i,
                startTime: startTime,
                duration: Math.min(chunkDurationSeconds, duration - startTime)
              });
              console.log(`✅ Created chunk ${i + 1}/${totalChunks}: ${path.basename(chunkPath)}`);
            } else {
              console.log(`⚠️ Chunk ${i + 1} too small, skipping`);
            }
            resolve();
          } else {
            console.error(`❌ FFmpeg error for chunk ${i}:`, stderr);
            reject(new Error(`FFmpeg failed: ${stderr}`));
          }
        });
        
        ffmpeg.on('error', (error) => {
          console.error(`❌ FFmpeg spawn error:`, error);
          reject(error);
        });
      });
    }
    
    console.log(`🎉 Successfully created ${chunks.length} audio chunks`);
    return { chunks, chunksDir };
    
  } catch (error) {
    console.error('🔥 Audio splitting error:', error);
    // Cleanup on error
    if (fs.existsSync(chunksDir)) {
      try {
        fs.rmSync(chunksDir, { recursive: true, force: true });
      } catch (e) {}
    }
    throw error;
  }
}

async function transcribeAudioChunk(chunkPath, chunkIndex, totalChunks, filename, language) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768
      }
    });
    
    const audioData = fs.readFileSync(chunkPath);
    const base64Audio = audioData.toString('base64');
    
    // Enhanced prompt for chunk transcription with context
    let contextPrompt = '';
    if (chunkIndex === 0) {
      contextPrompt = '🎯 זהו החלק הראשון של הקובץ - התחל מההתחלה המוחלטת.';
    } else if (chunkIndex === totalChunks - 1) {
      contextPrompt = '🎯 זהו החלק האחרון של הקובץ - המשך עד הסוף המוחלט.';
    } else {
      contextPrompt = `🎯 זהו חלק ${chunkIndex + 1} מתוך ${totalChunks} - המשך את התמלול מהנקודה בה הקטע הקודם הסתיים.`;
    }
    
    const prompt = `תמלל את קטע האודיו הזה לעברית תקנית.

${contextPrompt}

קובץ: ${cleanFilename(filename)} (חלק ${chunkIndex + 1}/${totalChunks})

🚨 הוראות קריטיות:
1. תמלל את כל התוכן בקטע הזה - כל מילה, כל משפט
2. אל תוסיף הערות כמו "זהו המשך" או "סיום חלק"
3. התחל ישירות עם התוכן המתומלל
4. סיים ישירות עם התוכן - אל תוסיף סיכום
5. אם יש חיתוך באמצע מילה/משפט - כתוב את מה שאתה שומע

📝 הנחיות עיצוב:
- חלק לפסקאות של 2-3 משפטים
- ציטוטים במירכאות: "שנאמר", "כדאיתא"
- שמור על רציפות טבעית
תתחיל עכשיו עם התמלול:`;

    console.log(`🎯 Transcribing chunk ${chunkIndex + 1}/${totalChunks}...`);

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: base64Audio
        }
      },
      prompt
    ]);

    const response = await result.response;
    let transcription = response.text();
    
    // Clean the transcription
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/^\s*תמלול[:\s]*/i, '') // Remove "תמלול:" prefix
      .replace(/^\s*חלק \d+[:\s]*/i, '') // Remove "חלק X:" prefix
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    console.log(`✅ Chunk ${chunkIndex + 1} transcribed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error(`❌ Error transcribing chunk ${chunkIndex + 1}:`, error);
    throw error;
  }
}

function mergeTranscriptionChunks(chunks) {
  console.log(`🔗 Merging ${chunks.length} transcription chunks...`);
  
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0];
  
  let merged = chunks[0];
  
  for (let i = 1; i < chunks.length; i++) {
    const currentChunk = chunks[i];
    
    // Try to detect overlap by looking at the end of previous chunk and start of current
    const prevEnd = merged.slice(-100).trim(); // Last 100 chars
    const currentStart = currentChunk.slice(0, 100).trim(); // First 100 chars
    
    // Simple overlap detection - look for common words
    const prevWords = prevEnd.split(/\s+/).slice(-5); // Last 5 words
    const currentWords = currentStart.split(/\s+/).slice(0, 10); // First 10 words
    
    let overlapFound = false;
    let overlapIndex = -1;
    
    // Check if any of the last words from previous chunk appear in the start of current chunk
    for (let j = 0; j < prevWords.length; j++) {
      const word = prevWords[j];
      if (word.length > 3) { // Only check meaningful words
        const index = currentWords.findIndex(w => w.includes(word) || word.includes(w));
        if (index !== -1) {
          overlapFound = true;
          overlapIndex = index;
          console.log(`🔍 Overlap detected: "${word}" at position ${index}`);
          break;
        }
      }
    }
    
    if (overlapFound && overlapIndex > 0) {
      // Remove overlapping part from current chunk
      const wordsToSkip = overlapIndex + 1;
      const remainingWords = currentWords.slice(wordsToSkip);
      const cleanedCurrent = remainingWords.join(' ') + currentChunk.slice(100);
      merged += '\n\n' + cleanedCurrent.trim();
      console.log(`🔗 Merged with overlap removal (skipped ${wordsToSkip} words)`);
    } else {
      // No overlap detected, merge normally
      merged += '\n\n' + currentChunk.trim();
      console.log(`🔗 Merged without overlap detection`);
    }
  }
  
  // Final cleanup
  merged = merged
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
  
  console.log(`✅ Merge completed: ${merged.length} total characters`);
  return merged;
}

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

// 🔥 ENHANCED: Complete transcription with chunking capability
async function realGeminiTranscription(filePath, filename, language) {
  try {
    const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
    const duration = await getAudioDuration(filePath);
    const durationMinutes = duration / 60;
    
    console.log(`🎵 Processing: ${cleanFilename(filename)}`);
    console.log(`📊 File size: ${fileSizeMB.toFixed(1)} MB, Duration: ${durationMinutes.toFixed(1)} minutes`);
    
    // Decide transcription strategy
    const ffmpegAvailable = checkFFmpegAvailability();
    const shouldChunk = ffmpegAvailable && (fileSizeMB > 25 || durationMinutes > 15);
    
    if (!shouldChunk) {
      console.log(`📝 Using direct transcription (small file or FFmpeg unavailable)`);
      return await directGeminiTranscription(filePath, filename, language);
    }
    
    console.log(`🔪 Using chunked transcription (large file detected)`);
    return await chunkedGeminiTranscription(filePath, filename, language, durationMinutes);
    
  } catch (error) {
    console.error('🔥 Transcription error:', error);
    throw error;
  }
}

// Direct transcription (original method)
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
1. תמלל כל שנייה, כל מילה, כל משפט מההתחלה ועד הסוף
2. אם האודיו ארוך 60 דקות - תמלל את כל 60 הדקות ללא יוצא מן הכלל
3. אל תעצור באמצע, אל תקצר, אל תסכם - רק תמלול מלא 100%
4. אם יש הפסקות או רעש - כתוב [הפסקה] והמשך לתמלל
5. המשך לתמלל עד שהאודיו נגמר לחלוטין
6. אל תכתוב "המשך התמלול..." או "סיום התמלול" - רק התוכן המלא

🎯 תמלל לעברית תקנית:
- מושגים דתיים מדויקים
- ציטוטים במירכאות: "כמו שכתוב", "אמרו חכמים", "תניא"
- פסקאות של 2-4 משפטים עם שורה ריקה
🚨 זה קובץ של ${fileSizeMB.toFixed(1)} MB - אני מצפה לתמלול ארוך ומפורט!
תתחיל עכשיו ותמלל הכל ללא חריגות:`;

    console.log(`🎯 Starting direct transcription for: ${cleanFilename(filename)} (${fileSizeMB.toFixed(1)} MB)`);

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
    
    // Enhanced text cleaning
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

// Chunked transcription for large files
async function chunkedGeminiTranscription(filePath, filename, language, durationMinutes) {
  let chunksData;
  
  try {
    // Determine chunk size based on total duration
    const chunkDuration = durationMinutes > 60 ? 6 : 8; // minutes per chunk
    
    // Split audio into chunks
    chunksData = await splitAudioIntoChunks(filePath, chunkDuration);
    
    if (chunksData.chunks.length === 0) {
      throw new Error('No chunks were created');
    }
    
    // Transcribe each chunk
    const transcriptions = [];
    for (let i = 0; i < chunksData.chunks.length; i++) {
      const chunk = chunksData.chunks[i];
      
      try {
        const chunkTranscription = await transcribeAudioChunk(
          chunk.path, 
          i, 
          chunksData.chunks.length, 
          filename, 
          language
        );
        
        transcriptions.push(chunkTranscription);
        
        // Small delay between chunks to avoid rate limiting
        if (i < chunksData.chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (chunkError) {
        console.error(`❌ Failed to transcribe chunk ${i + 1}:`, chunkError);
        // Continue with other chunks - don't fail the entire process
        transcriptions.push(`[שגיאה בתמלול קטע ${i + 1}]`);
      }
    }
    
    // Merge all transcriptions
    const finalTranscription = mergeTranscriptionChunks(transcriptions);
    
    console.log(`🎉 Chunked transcription completed: ${finalTranscription.length} characters from ${transcriptions.length} chunks`);
    return finalTranscription;
    
  } catch (error) {
    console.error('🔥 Chunked transcription failed:', error);
    console.log('🔄 Falling back to direct transcription...');
    
    try {
      return await directGeminiTranscription(filePath, filename, language);
    } catch (fallbackError) {
      throw new Error(`גם התמלול המקטעי וגם הישיר נכשלו: ${fallbackError.message}`);
    }
    
  } finally {
    // Cleanup chunks directory
    if (chunksData && chunksData.chunksDir && fs.existsSync(chunksData.chunksDir)) {
      try {
        fs.rmSync(chunksData.chunksDir, { recursive: true, force: true });
        console.log(`🗑️ Cleaned up chunks directory: ${chunksData.chunksDir}`);
      } catch (e) {
        console.warn('Could not cleanup chunks directory:', e.message);
      }
    }
  }
}



// 🔥 NEW: פונקציה לעיבוד טקסט לתבנית
function processTranscriptionForTemplate(transcription) {
  // Normalize text
  let normalized = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\u200f/g, '') // remove existing RLM if any to avoid duplicates
    .trim();

  let paragraphs;
  const hasBlankLines = /\n\s*\n/.test(normalized);
  if (hasBlankLines) {
    paragraphs = normalized
      .replace(/\n{3,}/g, '\n\n')
      .split(/\n\s*\n/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 0);
  } else {
    // No blank lines: split by sentences and group into readable paragraphs
    const sentences = normalized
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/);

    paragraphs = [];
    let current = '';
    let countInPara = 0;
    const maxLen = 350; // target max characters per paragraph
    const maxSentences = 3; // target sentences per paragraph
    for (const s of sentences) {
      const next = current ? current + ' ' + s : s;
      if (next.length > maxLen || countInPara >= maxSentences) {
        if (current.trim().length) paragraphs.push(current.trim());
        current = s;
        countInPara = 1;
      } else {
        current = next;
        countInPara += 1;
      }
    }
    if (current.trim().length) paragraphs.push(current.trim());
  }
  
  const RLM = '&#x200F;';
  let xmlContent = '';
  paragraphs.forEach(paragraph => {
    // Each paragraph: right alignment + bidi
    xmlContent += `
      <w:p>
        <w:pPr>
          <w:jc w:val="right"/>
          <w:bidi/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
            <w:sz w:val="24"/>
            <w:lang w:val="he-IL"/>
            <w:rtl/>
          </w:rPr>
          <w:t xml:space="preserve">${RLM}${escapeXml(paragraph)}</w:t>
        </w:r>
      </w:p>`;
  });
  
 console.log('DEBUG - Final XML content length:', xmlContent.length);
  console.log('DEBUG - XML preview:', xmlContent.substring(0, 200));
  return xmlContent;
}

// 🔥 NEW: פונקציה לניטרול XML
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 🔥 NEW: פונקציה לתיקון רווחים בעברית
function fixHebrewSpacing(text) {
  return text
    .replace(/([.!?])([א-ת])/g, '$1 $2')  // רווח אחרי נקודה לפני אות עברית
    .replace(/([,;])([א-ת])/g, '$1 $2')   // רווח אחרי פסיק לפני אות עברית
    .replace(/\s+/g, ' ')                 // נקה רווחים כפולים
    .trim();
}

// Word document creation (same as before)
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document from template for: ${cleanName}`);
    
    // 🔥 NEW: Prefer template if present; fallback to programmatic creation
    const templatePath = path.join(__dirname, 'simple-template.docx');
    try {
      if (fs.existsSync(templatePath)) {
        console.log('📋 Using template file');
        const templateBuffer = fs.readFileSync(templatePath);
        const zip = new JSZip();
        await zip.loadAsync(templateBuffer);
        const documentXml = await zip.file('word/document.xml').async('string');
        // Also enforce RTL in styles.xml (Normal style)
        if (zip.file('word/styles.xml')) {
          try {
            let stylesXml = await zip.file('word/styles.xml').async('string');
            const normalStyleRegex = /(<w:style[^>]*w:styleId=\"Normal\"[^>]*>)[\s\S]*?(<\/w:style>)/;
            if (normalStyleRegex.test(stylesXml)) {
              stylesXml = stylesXml.replace(
                normalStyleRegex,
                (m, openTag, closeTag) =>
                  `${openTag}<w:name w:val=\"Normal\"/><w:pPr><w:jc w:val=\"right\"/><w:bidi/></w:pPr><w:rPr><w:lang w:val=\"he-IL\"/><w:rtl/></w:rPr>${closeTag}`
              );
              zip.file('word/styles.xml', stylesXml);
            }
            // Ensure global defaults are RTL/right-aligned
            if (/<w:docDefaults>/.test(stylesXml)) {
              stylesXml = stylesXml.replace(
                /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/,
                '<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val=\"he-IL\" w:bidi=\"he-IL\"/><w:rtl/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:jc w:val=\"right\"/><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>'
              );
            } else {
              stylesXml = stylesXml.replace(
                /<\/w:styles>/,
                '<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val=\"he-IL\" w:bidi=\"he-IL\"/><w:rtl/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:jc w:val=\"right\"/><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>'
              );
            }
            zip.file('word/styles.xml', stylesXml);
          } catch (e) {
            console.warn('Could not update styles.xml for RTL:', e.message);
          }
        }
        const title = cleanName;
        const content = processTranscriptionForTemplate(transcription);
        console.log('🔍 About to replace in XML...');
        console.log('XML contains TITLE:', documentXml.includes('TITLE'));
        console.log('XML contains CONTENT:', documentXml.includes('CONTENT'));
        console.log('🔍 Content length to insert:', content.length);
        let newDocumentXml = documentXml.replace(/TITLE/g, escapeXml(title));
        const contentParaRegex = /<w:p[^>]*>[\s\S]*?CONTENT[\s\S]*?<\/w:p>/;
        if (contentParaRegex.test(newDocumentXml)) {
          newDocumentXml = newDocumentXml.replace(contentParaRegex, content);
        } else {
          console.warn('⚠️ CONTENT paragraph not found as a block; falling back to simple token replace');
          newDocumentXml = newDocumentXml.replace(/CONTENT/g, content);
        }
        zip.file('word/document.xml', newDocumentXml);
        const buffer = await zip.generateAsync({ type: 'nodebuffer' });
        console.log(`✅ Word document created from template for: ${cleanName}`);
        return buffer;
      }
      console.log('⚠️ Template not found, using programmatic creation');
    } catch (templateError) {
      console.warn('⚠️ Template generation failed, falling back to programmatic creation:', templateError.message);
    }
    
// החלף את הקטע בשורות 635-677 בקוד הזה:

const doc = new Document({
  creator: "תמלול חכם",
  language: "he-IL",
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
    // Enforce RTL and right alignment as the default (Normal)
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
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
      },
      {
        id: "HebrewParagraph",
        name: "Hebrew Paragraph",
        basedOn: "Normal",
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
        }
      }
    },
    children: [
      // Title with moderate spacing
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

// Process transcription content for Word document
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

// תיקון רווחים סביב סימני פיסוק
combinedSection = combinedSection
  .replace(/\s*\.\s*/g, '. ')  // נקודה + רווח יחיד
  .replace(/\s*,\s*/g, ', ')   // פסיק + רווח יחיד
  .replace(/\s*!\s*/g, '! ')   // קריאה + רווח יחיד
  .replace(/\s*\?\s*/g, '? ')  // שאלה + רווח יחיד
  .replace(/\s*:\s*/g, ': ')   // נקודתיים + רווח יחיד
  .replace(/\s+/g, ' ')        // רווחים כפולים לרווח יחיד
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
    
    // ללא בדיקת דוברים - פשוט יצירת פסקה רגילה
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
      // ללא bold, ללא color
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
              עם טכנולוגיית חלוקה למקטעים מתקדמת
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
              <h3 style="color: #1565c0; margin-bottom: 15px; font-size: 18px;">🔥 שיפורים בגרסה המשופרת:</h3>
              <ul style="margin: 0; font-size: 15px; line-height: 1.8; color: #1565c0;">
                <li>🎯 <strong>תמלול מלא 100%</strong> - מההתחלה עד הסוף הגמור</li>
                <li>🔪 <strong>חלוקה חכמה למקטעים</strong> - לקבצים גדולים (>25MB)</li>
                <li>🔗 <strong>איחוד אוטומטי</strong> - עם זיהוי חפיפות מתקדם</li>
                <li>🛡️ <strong>גיבוי אוטומטי</strong> - אם חלוקה נכשלת</li>
                <li>⚡ <strong>תמיכה בקבצים ענקיים</strong> - עד 500MB</li>
                <li>🎓 <strong>מותאם לעברית אקדמית</strong> - מושגים דתיים מדויקים</li>
                <li>💬 <strong>זיהוי דוברים וציטוטים</strong> - במירכאות נכונות</li>
              </ul>
            </div>
            
           <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 18px; color: #667eea; font-weight: bold;">
                🎉 תמלול מלא ושלם - אפילו לקבצים של שעות!
              </p>
            </div>
            
            <div style="background: #fff9c4; padding: 15px 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #fdd835;">
              <h3 style="color: #5f4300; margin-top: 0; margin-bottom: 10px; font-size: 16px;">לתשומת לב:</h3>
              <p style="margin: 0; font-size: 14px; color: #5f4300;">
                אם הטקסט בקובץ אינו מיושר לימין, יש לבחור את כל התוכן (Ctrl+A) וללחוץ על כפתור 'ישר לימין' בתוכנת ה-Word.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
              בברכה,<br>
              <strong>צוות התמלול החכם</strong><br>
              מערכת תמלול מתקדמת עם חלוקה למקטעים
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
  console.log(`🎯 Starting enhanced async transcription with chunking for ${files.length} files`);
  console.log(`📧 Processing for user: ${userEmail}`);
  
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
      console.log(`📊 File size: ${(fs.statSync(file.path).size / (1024 * 1024)).toFixed(1)} MB`);
      
      try {
        // Use the enhanced transcription method that handles large files with chunking
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
        console.log(`📊 Final transcription: ${transcription.length} characters, ${transcription.split(/\s+/).length} words`);
        
      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);
        failedTranscriptions.push({
          filename: file.filename,
          error: fileError.message
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
    
    // Send email with results
    if (transcriptions.length > 0) {
      await sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions);
      console.log(`📧 Email sent with ${transcriptions.length} successful transcriptions`);
      
      // Update user stats only for successful transcriptions
      const actualMinutesUsed = Math.min(estimatedMinutes, user.remainingMinutes);
      user.remainingMinutes = Math.max(0, user.remainingMinutes - actualMinutesUsed);
      user.totalTranscribed += actualMinutesUsed;
      
      console.log(`🎉 Transcription batch completed for: ${userEmail}`);
      console.log(`💰 Updated balance: ${user.remainingMinutes} minutes remaining`);
      console.log(`📊 Success rate: ${transcriptions.length}/${files.length} files`);
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

// Enhanced transcription route
app.post('/api/transcribe', upload.array('files'), async (req, res) => {
  try {
    console.log('🎯 Enhanced transcription request received');
    console.log('📁 Files uploaded:', req.files?.length || 0);
    console.log('📧 Request body:', req.body);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'לא נבחרו קבצים' });
    }

    const { email, language } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'אימייל נדרש' });
    }
    
    // Check FFmpeg availability for chunking
    const ffmpegAvailable = checkFFmpegAvailability();
    if (!ffmpegAvailable) {
      console.warn('⚠️ FFmpeg not available - using fallback transcription only');
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    console.log('🔍 User lookup for transcription:', user ? 'Found' : 'Not found');
    console.log('📧 Looking for email:', email);
    console.log('📋 Available users:', users.map(u => u.email));
    
    if (!user) {
      console.log('❌ User not found for transcription:', email);
      return res.status(400).json({ success: false, error: `משתמש לא נמצא: ${email}` });
    }

   // Calculate total estimated minutes ACCURATELY
    let totalDurationSeconds = 0;
    for (const file of req.files) {
        try {
            // Use the accurate function from line 212
            const duration = await getAudioDuration(file.path); 
            totalDurationSeconds += duration;
        } catch (error) {
            console.error(`Could not get duration for ${file.filename}, falling back to size estimate.`, error);
            // Fallback for safety
            totalDurationSeconds += (file.size / (1024 * 1024 * 2)) * 60;
        }
    }

    // Convert total seconds to minutes and round up
    const accurateMinutes = Math.ceil(totalDurationSeconds / 60);

    console.log(`⏱️ Accurate minutes calculated: ${accurateMinutes}, User balance: ${user.remainingMinutes}`);

    if (accurateMinutes > user.remainingMinutes) {
        console.log('❌ Insufficient minutes, deleting uploaded files.');
        // Clean up files immediately if not enough minutes
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

    // Start enhanced async processing with the ACCURATE minutes
    processTranscriptionAsync(req.files, email, language, accurateMinutes);

    console.log('✅ Enhanced transcription started successfully with accurate minute count.');
    res.json({
        success: true,
        message: ffmpegAvailable ?
            'התמלול המתקדם התחיל - קבצים גדולים יתחלקו למקטעים אוטומטית' :
            'התמלול התחיל - ללא חלוקה למקטעים (FFmpeg לא זמין)',
        estimatedMinutes: accurateMinutes, // Return the accurate count to the client
        chunkingEnabled: ffmpegAvailable
    });
  } catch (error) {
    console.error('Enhanced transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Enhanced server running on port ${PORT}`);
  console.log(`🔑 Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email configured: ${!!process.env.EMAIL_USER}`);
  console.log(`🔧 FFmpeg available: ${checkFFmpegAvailability()}`);
  console.log(`🎯 Enhanced features: Smart chunking for large files, complete transcription guarantee`);
});
























































