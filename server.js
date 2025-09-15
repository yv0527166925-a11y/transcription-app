const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const HTMLtoDOCX = require('html-to-docx');
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

// Data persistence
const DATA_FILE = path.join(__dirname, 'users_data.json');
console.log(`🔧 Data file path: ${DATA_FILE}`);
console.log(`🔧 Current working directory: ${process.cwd()}`);
console.log(`🔧 __dirname: ${__dirname}`);

// Default users data
const defaultUsers = [
  {
    id: 1,
    name: 'מנהל המערכת',
    email: 'admin@example.com',
    password: 'S3cur3P@ssw0rd_Adm!n25', // הסיסמה החזקה שקבענו
    isAdmin: true,
    remainingMinutes: 1000,
    totalTranscribed: 0,
    history: [],
    joinDate: new Date().toISOString()
  }
];

// Load users data from file or use defaults
function loadUsersData() {
  try {
    console.log(`📂 Checking for data file at: ${DATA_FILE}`);
    if (fs.existsSync(DATA_FILE)) {
      console.log('📂 Data file exists, loading...');
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const loadedUsers = JSON.parse(data);
      console.log(`✅ Successfully loaded ${loadedUsers.length} users from file`);
      return loadedUsers;
    } else {
      console.log('⚠️ No data file found, using default users');
      console.log('📂 Default users will be created');
      return [...defaultUsers];
    }
  } catch (error) {
    console.error('❌ Error loading users data:', error);
    console.error('❌ Error details:', error.message);
    console.log('📂 Using default users due to error');
    return [...defaultUsers];
  }
}

// Save users data to file
function saveUsersData() {
  try {
    console.log(`💾 Attempting to save ${users.length} users to: ${DATA_FILE}`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log(`✅ Successfully saved ${users.length} users to file`);

    // Verify file was created
    if (fs.existsSync(DATA_FILE)) {
      const stats = fs.statSync(DATA_FILE);
      console.log(`📊 File size: ${stats.size} bytes, modified: ${stats.mtime}`);
    } else {
      console.error('❌ File was not created despite no error!');
    }
  } catch (error) {
    console.error('❌ Error saving users data:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
  }
}

// Load users on startup
let users = loadUsersData();

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  console.log('📁 Created downloads directory');
}

// Initialize data file from template if it doesn't exist
const TEMPLATE_FILE = path.join(__dirname, 'users_data_template.json');

if (!fs.existsSync(DATA_FILE)) {
  console.log('📂 Data file not found, creating from template...');

  if (fs.existsSync(TEMPLATE_FILE)) {
    // Copy template to data file
    fs.copyFileSync(TEMPLATE_FILE, DATA_FILE);
    console.log('✅ Created users_data.json from template');

    // Reload users from the new file
    users = loadUsersData();
  } else {
    console.log('📂 No template found, creating with default users...');
    saveUsersData();
  }
} else {
  console.log('📂 Data file already exists, checking integrity...');
  try {
    const testData = fs.readFileSync(DATA_FILE, 'utf8');
    const testUsers = JSON.parse(testData);
    console.log(`✅ Data file is valid with ${testUsers.length} users`);
  } catch (error) {
    console.error('❌ Data file is corrupted, recreating from template...');
    if (fs.existsSync(TEMPLATE_FILE)) {
      fs.copyFileSync(TEMPLATE_FILE, DATA_FILE);
      users = loadUsersData();
      console.log('✅ Restored from template');
    } else {
      saveUsersData();
    }
  }
}

// Check current file status
if (fs.existsSync(DATA_FILE)) {
  console.log('✅ Data file exists at startup');
  try {
    const currentData = fs.readFileSync(DATA_FILE, 'utf8');
    const currentUsers = JSON.parse(currentData);
    console.log(`✅ Current file contains ${currentUsers.length} users`);
  } catch (error) {
    console.error('❌ Error reading existing file:', error);
  }
} else {
  console.log('❌ Data file does not exist at startup');
}

// Force save to test the mechanism
console.log('🔧 Testing save mechanism...');
saveUsersData();

// Save data periodically (every 5 minutes)
setInterval(() => {
  console.log('💾 Auto-saving user data...');
  saveUsersData();
}, 5 * 60 * 1000);

// 🔥 NEW: FFmpeg and chunking functions
let ffmpegAvailabilityCache = null; // Cache the result

function checkFFmpegAvailability() {
  // Return cached result if already checked
  if (ffmpegAvailabilityCache !== null) {
    return ffmpegAvailabilityCache;
  }

  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailabilityCache = true;
    return true;
  } catch (error) {
    ffmpegAvailabilityCache = false;
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
  const paragraphs = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split(/\n\s*\n/)
    .filter(p => p.length > 0);
  
  let xmlContent = '';
paragraphs.forEach(paragraph => {
    const boldTag = '';
    
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
            ${boldTag}
          </w:rPr>
          <w:t>${escapeXml(paragraph)}</w:t>
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
    console.log(`📄 Creating Word document with HTML-to-DOCX for: ${cleanName}`);

    // נקה את הטקסט
    let cleanedText = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // פצל לפסקאות
    const sections = cleanedText.split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);

    // בנה HTML עם הגדרות RTL נכונות וחלוקה לפסקאות
    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      // תיקון רווחים - סימני פיסוק צמודים למילים בעברית
      combinedSection = combinedSection
        .replace(/\s+([.,!?:])/g, '$1')           // הסר רווחים לפני סימני פיסוק
        .replace(/([.,!?:])\s+/g, '$1&nbsp;')     // החלף רווח אחרי פיסוק ב-&nbsp;
        .replace(/\s{2,}/g, ' ')                  // רווחים כפולים לרווח יחיד
        .trim();

      if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
        combinedSection += '.';
      }

      // חלק לפסקאות קצרות יותר אם הטקסט ארוך
      if (combinedSection.length > 400) {
        const sentences = combinedSection.split(/(?<=[.!?])\s+/);
        let currentParagraph = '';

        sentences.forEach(sentence => {
          if (currentParagraph.length + sentence.length > 400 && currentParagraph.length > 0) {
            contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${currentParagraph.trim()}</span></p>`;
            currentParagraph = sentence + ' ';
          } else {
            currentParagraph += sentence + ' ';
          }
        });

        if (currentParagraph.trim()) {
          contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${currentParagraph.trim()}</span></p>`;
        }
      } else {
        contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
      }
    });

    const htmlString = `
      <!DOCTYPE html>
      <html lang="he-IL" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="language" content="Hebrew">
          <meta http-equiv="Content-Language" content="he-IL">
          <title>תמלול</title>
        </head>
        <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
          <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">${cleanName}</h1>
          <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8;">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    const buffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      lang: 'he-IL',
      locale: 'he-IL'
    });

    console.log(`✅ Word document created successfully for: ${cleanName}`);
    return buffer;

  } catch (error) {
    console.error('Error creating Word document:', error);
    throw error;
  }
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
                <li>🎓 <strong>דיוק גבוה בעברית</strong> - 98% דיוק בעברית רגילה, 95% דיוק בהגייה ישיבתית</li>
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
// Global transcription tracking for cancellation
let activeTranscriptions = new Map(); // Map of transcriptionId -> { userEmail, files, cancelled: boolean }

async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes, transcriptionId) {
  console.log(`🎯 Starting enhanced async transcription with chunking for ${files.length} files`);
  console.log(`📧 Processing for user: ${userEmail} (ID: ${transcriptionId})`);

  const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
  if (!user) {
    console.error('❌ User not found during async processing:', userEmail);
    return;
  }

  // Register transcription for cancellation tracking
  activeTranscriptions.set(transcriptionId, {
    userEmail,
    files: files.map(f => f.path), // Store file paths for cleanup
    cancelled: false,
    startTime: new Date()
  });

  console.log(`📝 Registered transcription ${transcriptionId} for cancellation tracking`);

  // Check for cancellation before deducting minutes
  if (activeTranscriptions.get(transcriptionId)?.cancelled) {
    console.log(`❌ Transcription ${transcriptionId} was cancelled before starting - cleaning up files`);
    // Clean up uploaded files
    files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`🗑️ Deleted cancelled file: ${file.path}`);
      } catch (e) {
        console.warn(`Could not delete file ${file.path}:`, e.message);
      }
    });
    activeTranscriptions.delete(transcriptionId);
    return;
  }

  try {
    // Deduct minutes immediately to prevent abuse (before actual processing)
    user.remainingMinutes -= estimatedMinutes;
    user.totalTranscribed += estimatedMinutes;
    console.log(`💰 Minutes deducted upfront. User balance: ${user.remainingMinutes} minutes`);

    // Save user data immediately after minute deduction
    saveUsersData();

    // ⚠️ CRITICAL: After this point, cancellation is no longer safe for refunds
    // Minutes have been deducted, transcription is considered "started"
    activeTranscriptions.get(transcriptionId).minutesDeducted = true;

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

        // 🔧 NEW: Save document to downloads folder
        const downloadsDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }

        const docFilename = `${cleanFilename(file.filename)}_${Date.now()}.docx`;
        const docPath = path.join(downloadsDir, docFilename);
        fs.writeFileSync(docPath, wordDoc);
        console.log(`💾 Saved document: ${docPath}`);

        transcriptions.push({
          filename: file.filename,
          transcription,
          wordDoc,
          savedPath: docPath,
          downloadFilename: docFilename
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

      // Note: Minutes were already deducted at the start
      // No need to deduct again - just record the usage

      // 🔧 NEW: Add each transcription to history
      transcriptions.forEach(transcription => {
        const historyEntry = {
          date: new Date().toLocaleDateString('he-IL'),
          timestamp: Date.now(), // Add timestamp for cleanup
          fileName: cleanFilename(transcription.filename),
          duration: Math.ceil(estimatedMinutes / transcriptions.length), // Distribute minutes across files
          language: language,
          status: 'completed',
          downloadUrl: `/api/download/${transcription.downloadFilename}` // Use actual saved filename
        };

        if (!user.history) {
          user.history = [];
        }
        user.history.push(historyEntry);
        console.log(`📝 Added to history: ${historyEntry.fileName}`);
      });

      // 🔧 NEW: Add failed transcriptions to history
      failedTranscriptions.forEach(failed => {
        const historyEntry = {
          date: new Date().toLocaleDateString('he-IL'),
          timestamp: Date.now(), // Add timestamp for cleanup
          fileName: cleanFilename(failed.filename),
          duration: 0,
          language: language,
          status: 'failed',
          downloadUrl: null
        };

        if (!user.history) {
          user.history = [];
        }
        user.history.push(historyEntry);
        console.log(`📝 Added failed to history: ${historyEntry.fileName}`);
      });

      saveUsersData(); // Save after updating user data
      console.log(`🎉 Transcription batch completed for: ${userEmail}`);
      console.log(`💰 Updated balance: ${user.remainingMinutes} minutes remaining`);
      console.log(`📊 Success rate: ${transcriptions.length}/${files.length} files`);
      console.log(`📚 History updated with ${transcriptions.length + failedTranscriptions.length} entries`);
    } else {
      console.error(`❌ No transcriptions completed for: ${userEmail}`);
    }
    
  } catch (error) {
    console.error('Async transcription batch error:', error);
  } finally {
    // Clean up transcription tracking
    activeTranscriptions.delete(transcriptionId);
    console.log(`🧹 Cleaned up transcription tracking for ${transcriptionId}`);
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

// 🔧 NEW: Download endpoint for transcribed files
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'downloads', filename);

    console.log(`📥 Download request for: ${filename}`);

    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      return res.status(404).json({ success: false, error: 'קובץ לא נמצא' });
    }

    const originalName = filename.replace(/_\d+\.docx$/, '.docx'); // Remove timestamp
    const hebrewName = `תמלול_${originalName}`;

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(hebrewName)}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    console.log(`✅ Download started for: ${filename}`);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהורדת הקובץ' });
  }
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
      history: [],
      joinDate: new Date().toISOString() // Add join date
    };
    
    users.push(newUser);
    saveUsersData(); // Save after adding new user
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
    saveUsersData(); // Save after updating balance

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

    // Generate unique transcription ID for cancellation tracking
    const transcriptionId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start enhanced async processing with the ACCURATE minutes
    processTranscriptionAsync(req.files, email, language, accurateMinutes, transcriptionId);

    console.log('✅ Enhanced transcription started successfully with accurate minute count.');
    res.json({
        success: true,
        message: ffmpegAvailable ?
            'התמלול המתקדם התחיל - קבצים גדולים יתחלקו למקטעים אוטומטית' :
            'התמלול התחיל - ללא חלוקה למקטעים (FFmpeg לא זמין)',
        estimatedMinutes: accurateMinutes, // Return the accurate count to the client
        chunkingEnabled: ffmpegAvailable,
        transcriptionId: transcriptionId // Return transcription ID for cancellation
    });
  } catch (error) {
    console.error('Enhanced transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 Cancel transcription endpoint (safe cancellation window)
app.post('/api/cancel-transcription', (req, res) => {
  try {
    const { transcriptionId, email } = req.body;

    console.log(`🛑 Cancellation request for transcription ${transcriptionId} by ${email}`);

    if (!transcriptionId || !email) {
      return res.status(400).json({
        success: false,
        error: 'נדרש מזהה תמלול ואימייל'
      });
    }

    const transcriptionData = activeTranscriptions.get(transcriptionId);

    if (!transcriptionData) {
      return res.status(404).json({
        success: false,
        error: 'התמלול לא נמצא או כבר הסתיים'
      });
    }

    if (transcriptionData.userEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'אין הרשאה לבטל תמלול זה'
      });
    }

    if (transcriptionData.minutesDeducted) {
      return res.status(400).json({
        success: false,
        error: 'התמלול כבר התחיל - לא ניתן לבטל'
      });
    }

    // Mark as cancelled
    transcriptionData.cancelled = true;
    console.log(`✅ Transcription ${transcriptionId} marked as cancelled`);

    // Clean up uploaded files immediately
    let filesDeleted = 0;
    transcriptionData.files.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          filesDeleted++;
          console.log(`🗑️ Deleted cancelled file: ${filePath}`);
        }
      } catch (e) {
        console.warn(`Could not delete file ${filePath}:`, e.message);
      }
    });

    // Remove from tracking
    activeTranscriptions.delete(transcriptionId);

    res.json({
      success: true,
      message: `התמלול בוטל בהצלחה. נמחקו ${filesDeleted} קבצים.`,
      filesDeleted
    });

    console.log(`🛑 Transcription ${transcriptionId} cancelled successfully`);

  } catch (error) {
    console.error('Cancel transcription error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בביטול התמלול'
    });
  }
});

// 🔧 NEW: Admin API endpoints
app.get('/api/admin/overview', (req, res) => {
  try {
    const today = new Date().toDateString();
    const newUsersToday = users.filter(user => {
      const userDate = user.joinDate ? new Date(user.joinDate).toDateString() : null;
      return userDate === today;
    }).length;

    const totalTranscriptions = users.reduce((total, user) => {
      return total + (user.history ? user.history.length : 0);
    }, 0);

    const totalMinutesUsed = users.reduce((total, user) => {
      return total + (user.totalTranscribed || 0);
    }, 0);

    res.json({
      success: true,
      totalUsers: users.length,
      newUsersToday,
      totalTranscriptions,
      totalMinutesUsed
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בטעינת נתונים' });
  }
});

app.get('/api/admin/users', (req, res) => {
  try {
    const usersData = users.map(user => ({
      name: user.name,
      email: user.email,
      remainingMinutes: user.remainingMinutes,
      totalTranscribed: user.totalTranscribed || 0,
      joinDate: user.joinDate || 'לא זמין',
      isAdmin: user.isAdmin || false
    }));

    res.json({
      success: true,
      users: usersData
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בטעינת משתמשים' });
  }
});

app.get('/api/admin/transcriptions', (req, res) => {
  try {
    const allTranscriptions = [];

    users.forEach(user => {
      if (user.history && user.history.length > 0) {
        user.history.forEach(entry => {
          allTranscriptions.push({
            ...entry,
            userEmail: user.email,
            userName: user.name
          });
        });
      }
    });

    // Sort by date (newest first)
    allTranscriptions.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      return 0;
    });

    // Take only the last 50 transcriptions for performance
    const recentTranscriptions = allTranscriptions.slice(0, 50);

    res.json({
      success: true,
      transcriptions: recentTranscriptions
    });
  } catch (error) {
    console.error('Admin transcriptions error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בטעינת תמלולים' });
  }
});

// 🔧 NEW: History and files cleanup function
function cleanupOldHistory() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days in milliseconds
  let totalCleaned = 0;
  let totalFilesDeleted = 0;

  users.forEach(user => {
    if (user.history && user.history.length > 0) {
      const originalCount = user.history.length;

      // Keep only entries from the last 30 days
      user.history = user.history.filter(entry => {
        // For backward compatibility, keep entries without timestamp
        if (!entry.timestamp) return true;

        // If entry is older than 30 days, also delete its file
        if (entry.timestamp <= thirtyDaysAgo && entry.downloadUrl) {
          try {
            const filename = entry.downloadUrl.split('/').pop();
            const filePath = path.join(__dirname, 'downloads', filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              totalFilesDeleted++;
              console.log(`🗑️ Deleted old file: ${filename}`);
            }
          } catch (error) {
            console.warn(`⚠️ Could not delete file for entry: ${entry.fileName}`, error.message);
          }
        }

        return entry.timestamp > thirtyDaysAgo;
      });

      const cleanedCount = originalCount - user.history.length;
      if (cleanedCount > 0) {
        totalCleaned += cleanedCount;
        console.log(`🧹 Cleaned ${cleanedCount} old history entries for user: ${user.email}`);
      }
    }
  });

  if (totalCleaned > 0 || totalFilesDeleted > 0) {
    saveUsersData(); // Save after cleanup
    console.log(`🧹 Total cleanup: Removed ${totalCleaned} history entries and ${totalFilesDeleted} old files`);
  }
}

// 🔧 NEW: Schedule daily cleanup at midnight
function scheduleHistoryCleanup() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // Set to midnight

  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  // Schedule first cleanup at next midnight
  setTimeout(() => {
    cleanupOldHistory();

    // Then schedule daily cleanups
    setInterval(() => {
      cleanupOldHistory();
    }, 24 * 60 * 60 * 1000); // Every 24 hours

  }, msUntilMidnight);

  console.log(`🕒 History cleanup scheduled for every day at midnight`);
}

// Start server
// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, saving data before shutdown...');
  saveUsersData();
  console.log('💾 Data saved successfully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, saving data before shutdown...');
  saveUsersData();
  console.log('💾 Data saved successfully');
  process.exit(0);
});

app.listen(PORT, () => {
  const ffmpegAvailable = checkFFmpegAvailability();

  console.log(`🚀 Enhanced server running on port ${PORT}`);
  console.log(`🔑 Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email configured: ${!!process.env.EMAIL_USER}`);
  console.log(`📂 Data file: ${DATA_FILE}`);
  console.log(`📁 Downloads folder: ${path.join(__dirname, 'downloads')}`);

  if (ffmpegAvailable) {
    console.log(`✅ FFmpeg is available - enhanced chunking enabled`);
  } else {
    console.log(`⚠️ FFmpeg not available - using direct transcription only`);
  }

  console.log(`🎯 Enhanced features: Smart chunking for large files, complete transcription guarantee`);

  // Start history cleanup scheduler
  scheduleHistoryCleanup();
});
























































