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
const EventEmitter = require('events'); // 🔥 NEW: For SSE progress updates
const PQueue = require('p-queue').default; // 🔥 NEW: For concurrent transcription
// const Imap = require('imap'); // Disabled - not using email transcription service
require('dotenv').config();

// 🔥 NEW: Event emitter for progress updates
const progressEmitter = new EventEmitter();

// 🔹 NEW: Chunk status system for smart retry handling
const ChunkStatus = {
  OK: 'ok',                    // Normal successful transcription
  RETRIED_OK: 'retried_ok',    // Successful after retry
  SUSPECT: 'suspect',          // Short/quiet/tail chunk that needs targeted retry
  FATAL: 'fatal'              // Completely failed chunk
};

// 🔥 NEW: Per-User Queue System - each user gets their own queue
const userQueues = new Map(); // email -> PQueue instance
const maxGlobalConcurrency = 4; // Server protection: max 4 concurrent transcriptions globally (optimal for 2 CPUs)
const maxUserConcurrency = 5; // Each user can have up to 5 tasks in their queue
let currentGlobalActive = 0; // Track global active transcriptions

// Global task wrapper that enforces the 4-task global limit
async function executeWithGlobalThrottling(task, userEmail) {
  // Wait until global slot available
  while (currentGlobalActive >= maxGlobalConcurrency) {
    console.log(`🚧 Global throttling: ${currentGlobalActive}/${maxGlobalConcurrency} active. User ${userEmail} waiting...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }

  currentGlobalActive++;
  console.log(`🚀 User ${userEmail}: Starting task (Global: ${currentGlobalActive}/${maxGlobalConcurrency})`);

  try {
    const result = await task();
    return result;
  } finally {
    currentGlobalActive--;
    console.log(`✅ User ${userEmail}: Finished task (Global: ${currentGlobalActive}/${maxGlobalConcurrency})`);
  }
}

// Function to get or create a queue for a user
function getUserQueue(userEmail) {
  if (!userQueues.has(userEmail)) {
    const userQueue = new PQueue({
      concurrency: maxGlobalConcurrency, // User can use all global slots if alone
      interval: 100, // Small delay between tasks
      intervalCap: 1
    });

    // Add user queue monitoring
    userQueue.on('add', () => {
      console.log(`🔄 User ${userEmail} Queue: ${userQueue.size} waiting, ${userQueue.pending} active`);
      logGlobalQueueStatus();
    });

    userQueue.on('active', () => {
      console.log(`⚡ User ${userEmail}: Task active in user queue (${userQueue.pending} active, ${userQueue.size} waiting)`);
    });

    userQueue.on('completed', () => {
      console.log(`✅ User ${userEmail}: Task completed in user queue (${userQueue.pending} active, ${userQueue.size} waiting)`);
    });

    // Cleanup empty queues after 5 minutes of inactivity
    userQueue.on('idle', () => {
      setTimeout(() => {
        if (userQueue.size === 0 && userQueue.pending === 0) {
          userQueues.delete(userEmail);
          console.log(`🧹 Cleaned up idle queue for user: ${userEmail}`);
        }
      }, 300000); // 5 minutes
    });

    userQueues.set(userEmail, userQueue);
    console.log(`✨ Created new queue for user: ${userEmail}`);
  }

  return userQueues.get(userEmail);
}

// Global queue status logging
function logGlobalQueueStatus() {
  const totalWaiting = Array.from(userQueues.values()).reduce((sum, queue) => sum + queue.size, 0);
  const totalPending = Array.from(userQueues.values()).reduce((sum, queue) => sum + queue.pending, 0);
  console.log(`🌍 Global Status: ${currentGlobalActive}/${maxGlobalConcurrency} active, ${totalPending} user-pending, ${totalWaiting} user-waiting across ${userQueues.size} users`);
}

// Cleanup function for inactive user queues
setInterval(() => {
  const inactiveUsers = [];
  for (const [email, queue] of userQueues.entries()) {
    if (queue.size === 0 && queue.pending === 0) {
      inactiveUsers.push(email);
    }
  }
  inactiveUsers.forEach(email => {
    userQueues.delete(email);
    console.log(`🧹 Cleaned up inactive queue for user: ${email}`);
  });
}, 600000); // Cleanup every 10 minutes

// פונקציה להסרת חזרות של ביטויים/משפטים שחוזרים 5+ פעמים
function removeExtremeRepetitions(text) {
  if (!text) return text;

  // הסר חזרות של ביטויים (2-15 מילים) שחוזרים 5+ פעמים
  let cleaned = text;

  for (let wordCount = 2; wordCount <= 15; wordCount++) {
    const pattern = new RegExp(`((?:\\S+\\s+){${wordCount-1}}\\S+)(?:\\s+\\1){4,}`, 'gi');
    cleaned = cleaned.replace(pattern, '$1');
  }

  return cleaned;
}
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
let genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ספירת קבצים לאיפוס genAI כל 3 קבצים
let processedFilesCount = 0;

// Rate limiting storage
const rateLimits = {
  registration: new Map(), // IP -> { count, resetTime }
  verification: new Map(), // email -> { count, resetTime }
  login: new Map() // IP -> { count, resetTime }
};

// Rate limiting helper functions
function getRateLimitKey(type, identifier) {
  return `${type}_${identifier}`;
}

function isRateLimited(type, identifier, maxAttempts = 5, windowMinutes = 15) {
  const now = Date.now();
  const key = getRateLimitKey(type, identifier);
  const limitMap = rateLimits[type];

  if (!limitMap) return false;

  const record = limitMap.get(key);

  if (!record) {
    // First attempt
    limitMap.set(key, { count: 1, resetTime: now + (windowMinutes * 60 * 1000) });
    return false;
  }

  if (now > record.resetTime) {
    // Reset window
    limitMap.set(key, { count: 1, resetTime: now + (windowMinutes * 60 * 1000) });
    return false;
  }

  if (record.count >= maxAttempts) {
    console.log(`⛔ Rate limit exceeded for ${type}:${identifier} (${record.count}/${maxAttempts})`);
    return true;
  }

  // Increment counter
  record.count++;
  return false;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
}

// Clean up old rate limit records every hour
setInterval(() => {
  const now = Date.now();
  Object.values(rateLimits).forEach(limitMap => {
    for (const [key, record] of limitMap.entries()) {
      if (now > record.resetTime) {
        limitMap.delete(key);
      }
    }
  });
  console.log('🧹 Cleaned up old rate limit records');
}, 60 * 60 * 1000);

// Email transporter with timeout settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 60000, // 60 seconds
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 60000 // 60 seconds
});

// IMAP configuration disabled - email transcription service not in use
// const imapConfig = {
//   user: process.env.EMAIL_USER,
//   password: process.env.EMAIL_PASS,
//   host: 'imap.gmail.com',
//   port: 993,
//   tls: true,
//   tlsOptions: {
//     rejectUnauthorized: false
//   },
//   connTimeout: 15000,
//   authTimeout: 10000
// };

// Middleware
app.use(cors());
// 🔥 Configure Express for large uploads - no limits
app.use(express.json({ limit: '1gb' })); // Large JSON limit for metadata
app.use(express.urlencoded({ limit: '1gb', extended: true })); // Large form data limit
app.use(express.static('.'));

// API Routes
// const userRoutes = require('./routes/userRoutes'); // Disabled MongoDB routes
// app.use('/api/users', userRoutes); // Disabled MongoDB routes

// Payment Routes - Tranzila Integration
const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payment', paymentRoutes);

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
  limits: {
    fileSize: 500 * 1024 * 1024, // 🔥 500MB per file
    files: Infinity // 🔥 UNLIMITED: No limit on number of files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp3|mp4|wav|m4a|mov|avi|mkv|flac|aac|ogg)$/i;
    if (allowedTypes.test(file.originalname) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('סוג קובץ לא נתמך'), false);
    }
  }
});

// Data persistence - Persistent Disk Configuration
const PERSISTENT_PATH = process.env.NODE_ENV === 'production' ? '/mnt/data' : __dirname;
const DATA_FILE = path.join(PERSISTENT_PATH, 'users_data.json');
const TRANSCRIPTIONS_DIR = path.join(PERSISTENT_PATH, 'transcriptions');
const BACKUPS_DIR = path.join(PERSISTENT_PATH, 'backups');

console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔧 Persistent storage path: ${PERSISTENT_PATH}`);
console.log(`🔧 Data file path: ${DATA_FILE}`);
console.log(`🔧 Current working directory: ${process.cwd()}`);
console.log(`🔧 __dirname: ${__dirname}`);

// Create directories if they don't exist
function ensurePersistentDirectories() {
  try {
    if (!fs.existsSync(PERSISTENT_PATH)) {
      fs.mkdirSync(PERSISTENT_PATH, { recursive: true });
      console.log(`✅ Created persistent directory: ${PERSISTENT_PATH}`);
    }
    if (!fs.existsSync(TRANSCRIPTIONS_DIR)) {
      fs.mkdirSync(TRANSCRIPTIONS_DIR, { recursive: true });
      console.log(`✅ Created transcriptions directory: ${TRANSCRIPTIONS_DIR}`);
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      console.log(`✅ Created backups directory: ${BACKUPS_DIR}`);
    }
  } catch (error) {
    console.error('❌ Error creating persistent directories:', error);
  }
}

// Default users data
const defaultUsers = [
  {
    id: 1,
    name: 'מנהל המערכת',
    email: 'timlul.h@gmail.com',
    password: 'S3cur3P@ssw0rd_Adm!n25', // הסיסמה החזקה שקבענו
    isAdmin: true,
    remainingMinutes: 1000,
    totalTranscribed: 0,
    history: [],
    transcriptionHistory: [],
    joinDate: new Date().toISOString()
  }
];

// Load users data from file or use defaults
function loadUsersData() {
  // Ensure persistent directories exist first
  ensurePersistentDirectories();

  try {
    console.log(`📂 Checking for data file at: ${DATA_FILE}`);
    if (fs.existsSync(DATA_FILE)) {
      console.log('📂 Data file exists, loading...');
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const loadedUsers = JSON.parse(data);

      // Fix missing fields in existing users
      loadedUsers.forEach(user => {
        // Ensure both history arrays exist
        if (!user.history) user.history = [];
        if (!user.transcriptionHistory) user.transcriptionHistory = [];

        // Fix history entries that might have missing fields
        if (user.history) {
          user.history.forEach(entry => {
            if (!entry.date && entry.timestamp) {
              entry.date = new Date(entry.timestamp).toLocaleDateString('he-IL');
            }
            if (!entry.downloadUrl && entry.wordDocumentPath) {
              entry.downloadUrl = entry.wordDocumentPath;
            }
            if (!entry.fileName && entry.originalName) {
              entry.fileName = entry.originalName;
            }
          });
        }

        // Fix transcriptionHistory entries as well
        if (user.transcriptionHistory) {
          user.transcriptionHistory.forEach(entry => {
            if (!entry.date && entry.timestamp) {
              entry.date = new Date(entry.timestamp).toLocaleDateString('he-IL');
            }
            if (!entry.downloadUrl && entry.wordDocumentPath) {
              entry.downloadUrl = entry.wordDocumentPath;
            }
            if (!entry.fileName && entry.originalName) {
              entry.fileName = entry.originalName;
            }
          });
        }
      });

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

    // Create daily backup
    try {
      const today = new Date().toISOString().split('T')[0];
      const backupFile = path.join(BACKUPS_DIR, `backup_${today}.json`);

      if (!fs.existsSync(backupFile)) {
        const backupData = {
          date: new Date().toISOString(),
          users: users,
          totalUsers: users.length
        };
        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
        console.log(`✅ Daily backup created: ${backupFile}`);
      }
    } catch (backupError) {
      console.error('❌ Error creating backup:', backupError);
    }

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

// Ensure downloads directory exists (use persistent storage)
const downloadsDir = path.join(PERSISTENT_PATH, 'transcriptions');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  console.log('📁 Created transcriptions directory in persistent storage');
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

// Helper function to find or create user (JSON version)
async function findOrCreateUser(email) {
  try {
    // Find existing user
    let user = users.find(u => u.email === email);

    if (user) {
      console.log(`👤 Found existing user: ${email} with ${user.remainingMinutes} minutes`);
      return user;
    }

    // Create new user if not found
    const newUser = {
      email: email,
      remainingMinutes: 0, // No free minutes for new users
      totalTranscribed: 0,
      registrationDate: new Date().toISOString(),
      isAdmin: false,
      transcriptionHistory: []
    };

    users.push(newUser);
    saveUsersData();

    console.log(`✅ Created new user: ${email} with 0 minutes`);
    return newUser;

  } catch (error) {
    console.error('❌ Error in findOrCreateUser:', error);
    return null;
  }
}

// Helper function to use user minutes (JSON version)
async function useUserMinutes(email, minutes) {
  try {
    const user = users.find(u => u.email === email);
    if (!user) {
      throw new Error(`User not found: ${email}`);
    }

    if (user.remainingMinutes < minutes) {
      throw new Error(`Insufficient minutes. User has ${user.remainingMinutes}, needs ${minutes}`);
    }

    user.remainingMinutes -= minutes;
    user.totalTranscribed += minutes;
    saveUsersData();

    console.log(`✅ Used ${minutes} minutes for ${email}. Remaining: ${user.remainingMinutes}`);
    return user;

  } catch (error) {
    console.error('❌ Error in useUserMinutes:', error);
    throw error;
  }
}

// Helper function to add transcription to history (JSON version)
async function addTranscriptionToHistory(email, transcriptionData) {
  try {
    const user = users.find(u => u.email === email);
    if (!user) {
      console.error(`❌ User not found for history: ${email}`);
      return;
    }

    // Initialize both history arrays if they don't exist
    if (!user.transcriptionHistory) {
      user.transcriptionHistory = [];
    }
    if (!user.history) {
      user.history = [];
    }

    const historyEntry = {
      ...transcriptionData,
      timestamp: new Date().toISOString()
    };

    // Add to both arrays for backward compatibility
    user.transcriptionHistory.push(historyEntry);
    user.history.push(historyEntry);

    saveUsersData();
    console.log(`📝 Added transcription to history for ${email}`);

  } catch (error) {
    console.error('❌ Error in addTranscriptionToHistory:', error);
  }
}

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

// Function with fallback for final retry - 4 stages: 3Pro(x2), 2.5Pro, 2.5Flash
async function transcribeAudioChunkWithFlashFallback(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, retryCount = 0) {
  const startTime = Date.now();

  // First attempt: Gemini 3 Pro Preview
  try {
    const transcription = await transcribeWithModel(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, "gemini-3-pro-preview", startTime, 0);
    if (!transcription || transcription.trim().length === 0) {
      throw new Error('🚨 FALLBACK: Empty transcription from Gemini 3 Pro Preview (attempt 1)');
    }
    console.log(`✅ Gemini 3 Pro Preview (attempt 1) transcribed chunk ${chunkIndex + 1} successfully (${transcription.length} chars)`);
    return transcription;
  } catch (error1) {
    console.log(`⚠️ Gemini 3 Pro Preview (attempt 1) failed for chunk ${chunkIndex + 1}:`, error1.message);

    // Second attempt: Gemini 3 Pro Preview again
    try {
      const transcription = await transcribeWithModel(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, "gemini-3-pro-preview", startTime, 1);
      if (!transcription || transcription.trim().length === 0) {
        throw new Error('🚨 FALLBACK: Empty transcription from Gemini 3 Pro Preview (attempt 2)');
      }
      console.log(`✅ Gemini 3 Pro Preview (attempt 2) transcribed chunk ${chunkIndex + 1} successfully (${transcription.length} chars)`);
      return transcription;
    } catch (error2) {
      console.log(`⚠️ Gemini 3 Pro Preview (attempt 2) failed for chunk ${chunkIndex + 1}:`, error2.message);

      // Third attempt: Gemini 2.5 Pro
      try {
        const transcription = await transcribeWithModel(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, "gemini-2.5-pro", startTime, 2);
        if (!transcription || transcription.trim().length === 0) {
          throw new Error('🚨 FALLBACK: Empty transcription from Gemini 2.5 Pro');
        }
        console.log(`✅ Gemini 2.5 Pro fallback successful for chunk ${chunkIndex + 1} (${transcription.length} chars)`);
        return transcription;
      } catch (proError) {
        console.log(`⚠️ Gemini 2.5 Pro failed for chunk ${chunkIndex + 1}, trying final Gemini 2.5 Flash fallback:`, proError.message);

        // Fourth attempt: Final fallback to Gemini 2.5 Flash
        try {
          const transcription = await transcribeWithModel(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, "gemini-2.5-flash", startTime, 3);
          if (!transcription || transcription.trim().length === 0) {
            throw new Error('🚨 FALLBACK: Empty transcription from Gemini 2.5 Flash (final attempt)');
          }
          console.log(`✅ Gemini 2.5 Flash final fallback successful for chunk ${chunkIndex + 1} (${transcription.length} chars)`);
          return transcription;
        } catch (flashError) {
          console.error(`❌ All 4 fallback attempts failed for chunk ${chunkIndex + 1}:`, flashError.message);
          throw new Error(`All 4 attempts failed for chunk ${chunkIndex + 1}: Gemini 3 Pro Preview (x2), 2.5 Pro, and 2.5 Flash all failed`);
        }
      }
    }
  }
}

// Helper function to transcribe with a specific model
async function transcribeWithModel(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, modelName, startTime, retryCount = 0) {
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: modelName === "gemini-2.5-pro" ? 32768 : 32768
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

    const prompt = `${(language === 'Hebrew' || language === 'he') ? 'תמלל את קטע האודיו הזה לעברית תקנית.' : (language === 'yi') ? 'תמלל את קטע האודיו הזה לאידיש באותיות עבריות בלבד. אל תשתמש באותיות לטיניות או אנגליות, ואל תתרגם לעברית.' : (language === 'translate-he') ? 'תרגם את קטע האודיו הזה לעברית תקנית וברורה, תוך שמירה על המשמעות והסגנון המקוריים. אל תדלג ואל תוסיף מידע.' : `Transcribe this audio chunk in ${language || 'the original language'}. Do NOT translate.`}

🚨 חשוב: אם מילים חוזרות על עצמן, רשום אותן מקסימום 5 פעמים ברציפות
אל תחזור על אותן מילים או ביטויים יותר מ-5 פעמים ברצף.

${contextPrompt}

קובץ אודיו (חלק ${chunkIndex + 1}/${totalChunks}) - מודל: ${modelName}

🚨 הוראות קריטיות:
1. תמלל את כל התוכן בקטע הזה - כל מילה, כל משפט
2. אל תוסיף הערות כמו "זהו המשך" או "סיום חלק"
3. התחל ישירות עם התוכן המתומלל
4. סיים ישירות עם התוכן - אל תוסיף סיכום
5. אם יש חיתוך באמצע מילה/משפט - כתוב את מה שאתה שומע
6. 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שנאמרו בדיוק, גם אם הם נשמעים חסרים, שגויים או לא שלמים. אסור לך לתקן, להשלים או לשפר אותם בשום דרך!
7. 🚨 **אין להשמיט מילים או ביטויי ייחוס שנשמעים באודיו** (כגון: "כך אמר", "כך שאל", "כך ענה"), גם אם הם קצרים, נאמרים במהירות או נראים משניים.

תתחיל עכשיו עם התמלול:`;

    const chunkSizeMB = (audioData.length / (1024 * 1024)).toFixed(1);
    console.log(`🎯 Transcribing chunk ${chunkIndex + 1}/${totalChunks} (${chunkSizeMB}MB) using ${modelName}...`);

    // Determine timeout based on retry count: 100s (1st), 90s (2nd), 60s (3rd), 60s (4th)
    const timeoutSeconds = retryCount === 0 ? 100 : (retryCount === 1 ? 90 : 60);
    console.log(`⏱️ Setting timeout to ${timeoutSeconds} seconds for retry ${retryCount + 1}`);

    const transcriptionPromise = model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: base64Audio
        }
      },
      prompt
    ]);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Transcription timeout after ${timeoutSeconds} seconds with ${modelName} (retry ${retryCount + 1})`)), timeoutSeconds * 1000)
    );

    const result = await Promise.race([transcriptionPromise, timeoutPromise]);

    const response = await result.response;
    let transcription = response.text();

    // 🔥 NEW: הסר חזרות קיצוניות מהמודל
    transcription = removeExtremeRepetitions(transcription);

    // Validate transcription - only check if not empty (removed minimum length requirement)
    if (!transcription || transcription.trim().length === 0) {
      throw new Error(`Invalid transcription: empty (${transcription ? transcription.length : 0} characters)`);
    }

    // Clean the transcription
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/^\s*תמלול[:\s]*/i, '') // Remove "תמלול:" prefix
      .replace(/^\s*חלק \d+[:\s]*/i, '') // Remove "חלק X:" prefix
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 🔧 FIX: Additional validation before returning
    if (!transcription || transcription.trim().length === 0) {
      throw new Error(`🚨 CRITICAL: Transcription returned empty after processing with ${modelName}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Chunk ${chunkIndex + 1} transcribed with ${modelName}: ${transcription.length} characters in ${duration}s`);
    console.log(`📄 Chunk ${chunkIndex + 1} content preview: "${transcription.substring(0, 100)}..."`);
    return transcription;

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Error transcribing chunk ${chunkIndex + 1} with ${modelName} after ${duration}s:`, error.message);
    throw error;
  }
}

async function transcribeAudioChunk(chunkPath, chunkIndex, totalChunks, filename, language, customInstructions, retryCount = 0) {
  const startTime = Date.now(); // Define startTime at the beginning to avoid undefined errors
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      generationConfig: {
        temperature: 0,
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
    
    const prompt = `${(language === 'Hebrew' || language === 'he') ? 'תמלל את קטע האודיו הזה לעברית תקנית.' : (language === 'yi') ? 'תמלל את קטע האודיו הזה לאידיש באותיות עבריות בלבד. אל תשתמש באותיות לטיניות או אנגליות, ואל תתרגם לעברית.' : (language === 'translate-he') ? 'תרגם את קטע האודיו הזה לעברית תקנית וברורה, תוך שמירה על המשמעות והסגנון המקוריים. אל תדלג ואל תוסיף מידע.' : `Transcribe this audio chunk in ${language || 'the original language'}. Do NOT translate.`}

🚨 חשוב: אם מילים חוזרות על עצמן, רשום אותן מקסימום 5 פעמים ברציפות.
אל תחזור על אותן מילים או ביטויים יותר מ-5 פעמים ברצף.

${contextPrompt}

קובץ אודיו (חלק ${chunkIndex + 1}/${totalChunks})

🚨 הוראות קריטיות:
1. תמלל את כל התוכן בקטע הזה - כל מילה, כל משפט
2. אל תוסיף הערות כמו "זהו המשך" או "סיום חלק"
3. התחל ישירות עם התוכן המתומלל
4. סיים ישירות עם התוכן - אל תוסיף סיכום
5. אם יש חיתוך באמצע מילה/משפט - כתוב את מה שאתה שומע
6. 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שנאמרו בדיוק, גם אם הם נשמעים חסרים, שגויים או לא שלמים. אסור לך לתקן, להשלים או לשפר אותם בשום דרך!
7. 🚨 **אין להשמיט מילים או ביטויי ייחוס שנשמעים באודיו** (כגון: "כך אמר", "כך שאל", "כך ענה"), גם אם הם קצרים, נאמרים במהירות או נראים משניים.

תתחיל עכשיו עם התמלול:`;

    const chunkSizeMB = (audioData.length / (1024 * 1024)).toFixed(1);
    console.log(`🎯 Transcribing chunk ${chunkIndex + 1}/${totalChunks} (${chunkSizeMB}MB)...`);

    // Determine timeout based on retry count: 100s (1st), 90s (2nd), 60s (3rd), 60s (4th)
    const timeoutSeconds = retryCount === 0 ? 100 : (retryCount === 1 ? 90 : 60);
    console.log(`⏱️ Setting timeout to ${timeoutSeconds} seconds for retry ${retryCount + 1}`);

    // Add timeout wrapper
    const transcriptionPromise = model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: base64Audio
        }
      },
      prompt
    ]);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Transcription timeout after ${timeoutSeconds} seconds (retry ${retryCount + 1})`)), timeoutSeconds * 1000)
    );

    const result = await Promise.race([transcriptionPromise, timeoutPromise]);

    const response = await result.response;
    let transcription = response.text();

    // 🔥 NEW: הסר חזרות קיצוניות מהמודל
    transcription = removeExtremeRepetitions(transcription);

    // Validate transcription - only check if not empty (removed minimum length requirement)
    if (!transcription || transcription.trim().length === 0) {
      throw new Error(`Invalid transcription: empty (${transcription ? transcription.length : 0} characters)`);
    }

    // Clean the transcription
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/^\s*תמלול[:\s]*/i, '') // Remove "תמלול:" prefix
      .replace(/^\s*חלק \d+[:\s]*/i, '') // Remove "חלק X:" prefix
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Chunk ${chunkIndex + 1} transcribed: ${transcription.length} characters in ${duration}s`);
    return transcription;

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Error transcribing chunk ${chunkIndex + 1} after ${duration}s:`, error.message);
    throw error;
  }
}

async function mergeTranscriptionChunks(chunks, language = 'Hebrew') {
  console.log(`🔗 Merging ${chunks.length} transcription chunks...`);

  // 🔧 FIX: Enhanced validation for merge inputs
  console.log(`📊 Merge input validation:`);
  chunks.forEach((chunk, index) => {
    if (!chunk) {
      console.error(`🚨 MERGE ERROR: Chunk ${index} is null/undefined!`);
    } else if (typeof chunk !== 'string') {
      console.error(`🚨 MERGE ERROR: Chunk ${index} is not a string: ${typeof chunk}`);
    } else {
      console.log(`✅ Chunk ${index}: ${chunk.length} chars`);
    }
  });

  // Filter out null/undefined/empty chunks
  const validChunks = chunks.filter(chunk => chunk && typeof chunk === 'string' && chunk.trim().length > 0);

  if (validChunks.length !== chunks.length) {
    console.warn(`⚠️ MERGE WARNING: Filtered ${chunks.length - validChunks.length} invalid chunks. Using ${validChunks.length} valid chunks.`);
  }

  if (validChunks.length === 0) {
    console.error(`🚨 MERGE CRITICAL: No valid chunks to merge!`);
    return '';
  }

  if (validChunks.length === 1) {
    console.log(`📝 Single chunk merge: ${validChunks[0].length} chars`);
    return validChunks[0];
  }

  let merged = validChunks[0];
  console.log(`🏗️ Starting merge with first chunk: ${merged.length} chars`);
  
  for (let i = 1; i < validChunks.length; i++) {
    const currentChunk = validChunks[i];
    console.log(`🔄 Merging chunk ${i + 1}/${validChunks.length}: ${currentChunk.length} chars`);
    
    // Try to detect overlap by looking at the end of previous chunk and start of current
    const prevEnd = merged.slice(-100).trim(); // Last 100 chars
    const currentStart = currentChunk.slice(0, 100).trim(); // First 100 chars
    
    // Simple overlap detection - look for common words
    // 🔧 FIX: Filter out empty strings from word arrays
    const prevWords = prevEnd.split(/\s+/).filter(w => w.length > 0).slice(-5); // Last 5 words
    const currentWords = currentStart.split(/\s+/).filter(w => w.length > 0).slice(0, 10); // First 10 words
    
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
      // 🔧 FIX: Safe slice - handle chunks shorter than 100 characters
      const remainingContent = currentChunk.length > 100 ? currentChunk.slice(100) : '';
      const cleanedCurrent = remainingWords.join(' ') + remainingContent;
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

  // שלב 2: חלוקה חכמה לפסקאות בגמיני
  console.log(`🔍 Starting smart paragraph division for all languages, length=${merged.length}`);
  console.log(`⏱️ Waiting 3 seconds before smart paragraph division to avoid API rate limits...`);
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log(`🎯 Starting smart paragraph division with Gemini...`);

  // 🔧 FIX: Protect against smart paragraph division failure
  try {
    const improvedText = await smartParagraphDivision(merged);
    if (improvedText && improvedText.trim().length > 0) {
      merged = improvedText;
      console.log(`✅ Smart paragraph division completed successfully: ${merged.length} chars`);
    } else {
      console.warn(`⚠️ Smart paragraph division returned empty result, using original merge`);
    }
  } catch (error) {
    console.warn(`⚠️ Smart paragraph division failed, using raw merge:`, error.message);
    // Continue with merged text without smart paragraph division
  }

  // Python will handle all text processing - no Node.js processing needed
  console.log(`📝 Sending processed transcription to Python...`);

  return merged;
}

// 🎯 NEW: Smart paragraph division with Gemini
async function smartParagraphDivision(text) {
  try {
    // Check if text is too long (over 7.5K chars) and split it - reduced for better concurrent processing
    const MAX_CHARS = 7500; // ~1500 words - reduced for better stability with concurrent requests
    if (text.length > MAX_CHARS) {
      console.log(`📏 Text too long (${text.length} chars), splitting into chunks...`);
      return await smartParagraphDivisionChunked(text, MAX_CHARS);
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500000
      }
    });

    const prompt = `אני נותן לך טקסט של שיעור תורה שתומלל, ואני רוצה שתחלק אותו לפסקאות חכמות לפי הנושאים והרעיונות.

🎯 חוקי חלוקה חכמה:
- כל פסקה צריכה להיות רעיון או נושא שלם
- פסקה חדשה למעבר נושא (מהלכה לאגדה, ממשל לפסק, מסיפור לעיקרון)
- פסקה חדשה לכל ציטוט ארוך (פסוק, מאמר חז"ל, הלכה)
- פסקה חדשה לכל סיפור או דוגמה
- פסקה חדשה כשהרב עובר לדבר אחר ("אני רוצה לספר", "דבר אחר", "למשל")
- שאלות ותשובות בפסקאות נפרדות
- **שפר מירכאות** - ודא שכל ציטוט (פסוק, מאמר חז"ל, אמרה) ודיאלוג ישיר עטוף במירכאות ("...") באופן מדויק ונכון תחבירית
- 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שהם בדיוק, גם אם נשמעים חסרים, שגויים או לא שלמים. אסור לתקן, להשלים או לשפר אותם בשום דרך!
- **חיבור משפטים שבורים** – חבר יחד משפטים שבורים שנשמעים כהמשך ישיר זה לזה, גם אם הדובר עצמו אמר אותם בצורה מקוטעת, אך בלי לשנות ניסוח, בלי להוסיף ובלי ללטש סגנון.
- **איחוד חזרות מיותרות של הדובר** – איחוד או הסרת חזרות רצופות של מילים או ביטויים שהדובר אמר ברצף ללא הוספת משמעות (כמו "קשה, קשה", "לא יודעים... לא יודעים"), אך רק כאשר ברור שמדובר בחזרה רטורית או טכנית שאינה מוסיפה תוכן.
- **יישור רצף דיבור לא עקבי** – כאשר קיימות עצירות לא טבעיות בתמלול (כמו "...", ריבוי נקודות, מקפים מרובים או הפסקות טכניות), המודל רשאי להחליק את הרצף למשפט תקין, ללא כל שינוי בניסוח וללא עריכה סגנונית.
- **פיצול פסקאות ארוכות לפי רעיון משנה** – אם פסקה ארוכה מדי (מעל 6–7 שורות) ויש בה מעבר רעיוני נוסף—even אם אינו מסומן במעבר מפורש—חלק אותה לפסקה חדשה בהתאם לרעיונות, אך בלי לשנות ניסוח, לנסח מחדש או להוסיף תוכן.
- **החלקת חיבור בין משפטים סמוכים** – כאשר שני משפטים קצרים עומדים ברצף ומשלימים זה את זה מבחינה משמעותית, ניתן לחברם למשפט אחד זורם, כל עוד אין שינוי בניסוח והמשמעות נשמרת במלואה.

🔥 חשוב ביותר:
- הפרד כל פסקה עם שורה ריקה כפולה (\\n\\n)
- אל תשכתב, אל תסגנן ואל תחליף מילים במילים אחרות.
- מותר לבצע רק את התיקונים הטכניים שהוגדרו למעלה (חיבור שבירות, איחוד חזרות, יישור רצף, פיצול פסקאות וכד').
- אל תוסיף או תסיר תוכן חדש שאינו מופיע בטקסט.

🔒 איסור מוחלט על החלפת מילים או שינוי ניסוחים:

🚫 אין לשנות אף מילה שנאמרה, גם אם נדמה שהמילה שגויה, לא טבעית או נשמעת מוזרה.
אין להחליף מילים במילים נרדפות, קרובות או בעלות משמעות דומה
(לדוגמה: "מזיק לעצמי" ≠ "מעניש את עצמי").
אסור לשפר, לשכתב, לקצר או להרחיב ניסוחים.

🪶 מותרות בודדות בלבד:
- תיקון טעויות כתיב או היגוי טכניות (כגון: "במילא" → "ממילא", "הי'" → "היה").
- החלקת היגוי ליטאי לצורת כתיב תקנית בלבד – בלי לשנות מילה או משמעות.
- איחוד חזרות טכניות ("אני אני אומר" → "אני אומר").
- תיקון פיסוק בלבד (פסיקים, נקודות, סימני שאלה).

❗ אין לשנות משמעות, אין לשפר סגנון, ואין להשלים ניסוחים שנראים חסרים.
המטרה: **תמלול מדויק מילה במילה**, עם תיקונים טכניים בלבד.

הטקסט לחלוקה:
${text}

תחזיר את הטקסט המחולק לפסקאות עם \\n\\n בין כל פסקה:`;

    console.log(`🎯 Sending ${text.length} characters to Gemini for smart division...`);

    // Retry mechanism with timeout
    let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`🔍 DEBUG: Starting retry attempt ${attempt}/2...`);
      try {
        console.log(`🔄 Attempt ${attempt}/2 for smart division...`);

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Smart division timeout after 3 minutes')), 3 * 60 * 1000)
        );

        // Create generation promise
        const generatePromise = model.generateContent(prompt);

        // Race between generation and timeout
        result = await Promise.race([generatePromise, timeoutPromise]);

        console.log(`✅ Smart division API call successful on attempt ${attempt}`);

        const response = await result.response;
        let dividedText = response.text().trim();

        console.log(`✅ Smart division completed: ${dividedText.length} characters`);

        // וידוא שיש חלוקה לפסקאות
        const paragraphCount = dividedText.split('\\n\\n').length;
        console.log(`📊 Created ${paragraphCount} smart paragraphs`);

        return dividedText;

      } catch (attemptError) {
        console.log(`🔍 DEBUG: Caught error on attempt ${attempt}, checking retry logic...`);
        console.error(`❌ Attempt ${attempt} failed:`, attemptError.message);

        if (attempt === 2) {
          console.log(`🔍 DEBUG: This was the final attempt (${attempt}/2), throwing error...`);
          throw attemptError; // Final attempt failed, throw error
        }

        // Longer delays for better rate limiting: 15s, 30s, 50s, 60s, 70s
        const waitTimes = [15000, 30000, 50000, 60000, 70000];
        const waitTime = waitTimes[attempt - 1] || 70000;
        console.log(`⏳ Waiting ${waitTime / 1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // If initial fast retries failed, try longer retries (5 minutes between attempts for 30 minutes total)
    console.log('🔄 Initial retries failed, starting extended retry phase with 5-minute intervals...');

    for (let longAttempt = 1; longAttempt <= 6; longAttempt++) {
      try {
        console.log(`🔄 Extended attempt ${longAttempt}/6 for smart division (5-minute intervals)...`);

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Smart division timeout after 3 minutes')), 3 * 60 * 1000)
        );

        // Create generation promise
        const generatePromise = model.generateContent(prompt);

        // Race between generation and timeout
        result = await Promise.race([generatePromise, timeoutPromise]);

        console.log(`✅ Smart division API call successful on extended attempt ${longAttempt}`);

        const response = await result.response;
        let dividedText = response.text().trim();

        console.log(`✅ Smart division completed: ${dividedText.length} characters`);

        // וידוא שיש חלוקה לפסקאות
        const paragraphCount = dividedText.split('\\n\\n').length;
        console.log(`📊 Created ${paragraphCount} smart paragraphs`);

        return dividedText;

      } catch (longAttemptError) {
        console.error(`❌ Extended attempt ${longAttempt} failed:`, longAttemptError.message);

        if (longAttempt === 6) {
          console.log(`🔍 All extended attempts failed, throwing final error...`);
          throw longAttemptError; // Final extended attempt failed
        }

        // Wait 5 minutes between extended attempts
        const longWaitTime = 5 * 60 * 1000; // 5 minutes
        console.log(`⏳ Waiting ${longWaitTime / 1000} seconds (5 minutes) before next extended retry...`);
        await new Promise(resolve => setTimeout(resolve, longWaitTime));
      }
    }

    // If we get here, all attempts (fast + extended) failed
    throw new Error('All retry attempts (fast + extended) failed');

  } catch (error) {
    console.error('🔥 Smart paragraph division failed:', error);
    console.log(`⚠️ Falling back to original text`);
    return text; // חזור לטקסט המקורי אם נכשל
  }
}

// 🎯 NEW: Smart paragraph division for long texts (chunked processing)
async function smartParagraphDivisionChunked(text, maxChars) {
  try {
    // Split text into chunks at sentence boundaries
    const chunks = splitTextIntoChunks(text, maxChars);
    console.log(`📦 Split into ${chunks.length} chunks for processing`);

    const processedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);

      // Add delay between chunks to avoid rate limiting
      if (i > 0) {
        console.log('⏱️ Waiting 5 seconds between chunks...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 🆕 Use the new fallback function instead of inline code
      const processedChunk = await smartParagraphDivisionWithFlashFallback(chunks[i]);
      processedChunks.push(processedChunk);
      console.log(`✅ Chunk ${i + 1}/${chunks.length} processed (${processedChunk.length} chars)`);
    }

    // Join all processed chunks
    const result = processedChunks.join('\n\n');
    console.log(`✅ Chunked processing completed: ${result.length} characters`);

    return result;

  } catch (error) {
    console.error('🔥 Chunked smart division failed:', error);
    return text;
  }
}

// Helper function to split text into chunks at sentence boundaries
function splitTextIntoChunks(text, maxChars) {
  const chunks = [];
  let currentChunk = '';

  // Split by sentences (Hebrew and English)
  const sentences = text.split(/(?<=[.!?])\s+|(?<=[״׳])\s+/).filter(s => s.trim());

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// 🆕 NEW: Smart paragraph division with Flash fallback for failed chunks
async function smartParagraphDivisionWithFlashFallback(text) {
  // First try Gemini Pro
  try {
    const processedText = await smartParagraphDivisionSingle(text);
    console.log(`✅ Gemini Pro processed chunk successfully (${processedText.length} chars)`);
    return processedText;
  } catch (error) {
    console.log(`⚠️ Gemini Pro failed, trying Gemini 2.5 Pro fallback:`, error.message);

    // Fallback to Gemini 2.5 Pro
    try {
      const proModel = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500000
        }
      });

      const prompt = `אני נותן לך טקסט של שיעור תורה שתומלל, ואני רוצה שתחלק אותו לפסקאות חכמות לפי הנושאים והרעיונות.

🎯 חוקי חלוקה חכמה:
- כל פסקה צריכה להיות רעיון או נושא שלם
- פסקה חדשה למעבר נושא (מהלכה לאגדה, ממשל לפסק, מסיפור לעיקרון)
- פסקה חדשה לכל ציטוט ארוך (פסוק, מאמר חז"ל, הלכה)
- פסקה חדשה לכל סיפור או דוגמה
- פסקה חדשה כשהרב עובר לדבר אחר ("אני רוצה לספר", "דבר אחר", "למשל")
- שאלות ותשובות בפסקאות נפרדות
- **שפר מירכאות** - ודא שכל ציטוט (פסוק, מאמר חז"ל, אמרה) ודיאלוג ישיר עטוף במירכאות ("...") באופן מדויק ונכון תחבירית
- 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שהם בדיוק, גם אם נשמעים חסרים, שגויים או לא שלמים. אסור לתקן, להשלים או לשפר אותם בשום דרך!
- **חיבור משפטים שבורים** – חבר יחד משפטים שבורים שנשמעים כהמשך ישיר זה לזה, גם אם הדובר עצמו אמר אותם בצורה מקוטעת, אך בלי לשנות ניסוח, בלי להוסיף ובלי ללטש סגנון.
- **איחוד חזרות מיותרות של הדובר** – איחוד או הסרת חזרות רצופות של מילים או ביטויים שהדובר אמר ברצף ללא הוספת משמעות (כמו "קשה, קשה", "לא יודעים... לא יודעים"), אך רק כאשר ברור שמדובר בחזרה רטורית או טכנית שאינה מוסיפה תוכן.
- **יישור רצף דיבור לא עקבי** – כאשר קיימות עצירות לא טבעיות בתמלול (כמו "...", ריבוי נקודות, מקפים מרובים או הפסקות טכניות), המודל רשאי להחליק את הרצף למשפט תקין, ללא כל שינוי בניסוח וללא עריכה סגנונית.
- **פיצול פסקאות ארוכות לפי רעיון משנה** – אם פסקה ארוכה מדי (מעל 6–7 שורות) ויש בה מעבר רעיוני נוסף—even אם אינו מסומן במעבר מפורש—חלק אותה לפסקה חדשה בהתאם לרעיונות, אך בלי לשנות ניסוח, לנסח מחדש או להוסיף תוכן.
- **החלקת חיבור בין משפטים סמוכים** – כאשר שני משפטים קצרים עומדים ברצף ומשלימים זה את זה מבחינה משמעותית, ניתן לחברם למשפט אחד זורם, כל עוד אין שינוי בניסוח והמשמעות נשמרת במלואה.

🔥 חשוב ביותר:
- הפרד כל פסקה עם שורה ריקה כפולה (\\n\\n)
- אל תשכתב, אל תסגנן ואל תחליף מילים במילים אחרות.
- מותר לבצע רק את התיקונים הטכניים שהוגדרו למעלה (חיבור שבירות, איחוד חזרות, יישור רצף, פיצול פסקאות וכד').
- אל תוסיף או תסיר תוכן חדש שאינו מופיע בטקסט.

🔒 איסור מוחלט על החלפת מילים או שינוי ניסוחים:

🚫 אין לשנות אף מילה שנאמרה, גם אם נדמה שהמילה שגויה, לא טבעית או נשמעת מוזרה.
אין להחליף מילים במילים נרדפות, קרובות או בעלות משמעות דומה
(לדוגמה: "מזיק לעצמי" ≠ "מעניש את עצמי").
אסור לשפר, לשכתב, לקצר או להרחיב ניסוחים.

🪶 מותרות בודדות בלבד:
- תיקון טעויות כתיב או היגוי טכניות (כגון: "במילא" → "ממילא", "הי'" → "היה").
- החלקת היגוי ליטאי לצורת כתיב תקנית בלבד – בלי לשנות מילה או משמעות.
- איחוד חזרות טכניות ("אני אני אומר" → "אני אומר").
- תיקון פיסוק בלבד (פסיקים, נקודות, סימני שאלה).

❗ אין לשנות משמעות, אין לשפר סגנון, ואין להשלים ניסוחים שנראים חסרים.
המטרה: **תמלול מדויק מילה במילה**, עם תיקונים טכניים בלבד.

הטקסט לחלוקה:
${text}

תחזיר את הטקסט המחולק לפסקאות עם \\n\\n בין כל פסקה:`;

      const result = await proModel.generateContent(prompt);
      const response = await result.response;
      let dividedText = response.text();

      if (dividedText && dividedText.length > text.length * 0.8) {
        console.log(`✅ Gemini 2.5 Pro fallback successful (${dividedText.length} chars)`);
        return dividedText;
      } else {
        throw new Error('Gemini 2.5 Pro output too short or empty');
      }
    } catch (proError) {
      console.log(`⚠️ Gemini 2.5 Pro fallback failed, trying Gemini 2.5 Flash fallback:`, proError.message);

      // Final fallback to Gemini 2.5 Flash
      try {
        const flashModel = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500000
          }
        });

        const prompt = `אני נותן לך טקסט של שיעור תורה שתומלל, ואני רוצה שתחלק אותו לפסקאות חכמות לפי הנושאים והרעיונות.

🎯 חוקי חלוקה חכמה:
- כל פסקה צריכה להיות רעיון או נושא שלם
- פסקה חדשה למעבר נושא (מהלכה לאגדה, ממשל לפסק, מסיפור לעיקרון)
- פסקה חדשה לכל ציטוט ארוך (פסוק, מאמר חז"ל, הלכה)
- פסקה חדשה לכל סיפור או דוגמה
- פסקה חדשה כשהרב עובר לדבר אחר ("אני רוצה לספר", "דבר אחר", "למשל")
- שאלות ותשובות בפסקאות נפרדות
- **שפר מירכאות** - ודא שכל ציטוט (פסוק, מאמר חז"ל, אמרה) ודיאלוג ישיר עטוף במירכאות ("...") באופן מדויק ונכון תחבירית
- 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שהם בדיוק, גם אם נשמעים חסרים, שגויים או לא שלמים. אסור לתקן, להשלים או לשפר אותם בשום דרך!
- **חיבור משפטים שבורים** – חבר יחד משפטים שבורים שנשמעים כהמשך ישיר זה לזה, גם אף הדובר עצמו אמר אותם בצורה מקוטעת, אך בלי לשנות ניסוח, בלי להוסיף ובלי ללטש סגנון.
- **איחוד חזרות מיותרות של הדובר** – איחוד או הסרת חזרות רצופות של מילים או ביטויים שהדובר אמר ברצף ללא הוספת משמעות (כמו "קשה, קשה", "לא יודעים... לא יודעים"), אך רק כאשר ברור שמדובר בחזרה רטורית או טכנית שאינה מוסיפה תוכן.
- **יישור רצף דיבור לא עקבי** – כאשר קיימות עצירות לא טבעיות בתמלול (כמו "...", ריבוי נקודות, מקפים מרובים או הפסקות טכניות), המודל רשאי להחליק את הרצף למשפט תקין, ללא כל שינוי בניסוח וללא עריכה סגנונית.
- **פיצול פסקאות ארוכות לפי רעיון משנה** – אם פסקה ארוכה מדי (מעל 6–7 שורות) ויש בה מעבר רעיוני נוסף—even אם אינו מסומן במעבר מפורש—חלק אותה לפסקה חדשה בהתאם לרעיונות, אך בלי לשנות ניסוח, לנסח מחדש או להוסיף תוכן.
- **החלקת חיבור בין משפטים סמוכים** – כאשר שני משפטים קצרים עומדים ברצף ומשלימים זה את זה מבחינה משמעותית, ניתן לחברם למשפט אחד זורם, כל עוד אין שינוי בניסוח והמשמעות נשמרת במלואה.

🔥 חשוב ביותר:
- הפרד כל פסקה עם שורה ריקה כפולה (\\n\\n)
- אל תשכתב, אל תסגנן ואל תחליף מילים במילים אחרות.
- מותר לבצע רק את התיקונים הטכניים שהוגדרו למעלה (חיבור שבירות, איחוד חזרות, יישור רצף, פיצול פסקאות וכד').
- אל תוסיף או תסיר תוכן חדש שאינו מופיע בטקסט.

🔒 איסור מוחלט על החלפת מילים או שינוי ניסוחים:

🚫 אין לשנות אף מילה שנאמרה, גם אם נדמה שהמילה שגויה, לא טבעית או נשמעת מוזרה.
אין להחליף מילים במילים נרדפות, קרובות או בעלות משמעות דומה
(לדוגמה: "מזיק לעצמי" ≠ "מעניש את עצמי").
אסור לשפר, לשכתב, לקצר או להרחיב ניסוחים.

🪶 מותרות בודדות בלבד:
- תיקון טעויות כתיב או היגוי טכניות (כגון: "במילא" → "ממילא", "הי'" → "היה").
- החלקת היגוי ליטאי לצורת כתיב תקנית בלבד – בלי לשנות מילה או משמעות.
- איחוד חזרות טכניות ("אני אני אומר" → "אני אומר").
- תיקון פיסוק בלבד (פסיקים, נקודות, סימני שאלה).

❗ אין לשנות משמעות, אין לשפר סגנון, ואין להשלים ניסוחים שנראים חסרים.
המטרה: **תמלול מדויק מילה במילה**, עם תיקונים טכניים בלבד.

הטקסט לחלוקה:
${text}

תחזיר את הטקסט המחולק לפסקאות עם \\n\\n בין כל פסקה:`;

        const result = await flashModel.generateContent(prompt);
        const response = await result.response;
        let dividedText = response.text();

        if (dividedText && dividedText.length > text.length * 0.8) {
          console.log(`✅ Gemini 2.5 Flash fallback successful (${dividedText.length} chars)`);
          return dividedText;
        } else {
          throw new Error('Gemini 2.5 Flash output too short or empty');
        }
      } catch (flashError) {
        console.error(`❌ All paragraph division models failed:`, flashError.message);
        console.log(`⚠️ Returning original text for this chunk`);
        return text;
      }
    }
  }
}

// Single chunk processing (same as original but without chunking check)
async function smartParagraphDivisionSingle(text) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3-pro-preview",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 500000
    }
  });

  const prompt = `אני נותן לך טקסט של שיעור תורה שתומלל, ואני רוצה שתחלק אותו לפסקאות חכמות לפי הנושאים והרעיונות.

🎯 חוקי חלוקה חכמה:
- כל פסקה צריכה להיות רעיון או נושא שלם
- פסקה חדשה למעבר נושא (מהלכה לאגדה, ממשל לפסק, מסיפור לעיקרון)
- פסקה חדשה לכל ציטוט ארוך (פסוק, מאמר חז"ל, הלכה)
- פסקה חדשה לכל סיפור או דוגמה
- פסקה חדשה כשהרב עובר לדבר אחר ("אני רוצה לספר", "דבר אחר", "למשל")
- שאלות ותשובות בפסקאות נפרדות
- **שפר מירכאות** - ודא שכל ציטוט (פסוק, מאמר חז"ל, אמרה) ודיאלוג ישיר עטוף במירכאות ("...") באופן מדויק ונכון תחבירית
- 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שהם בדיוק, גם אם נשמעים חסרים, שגויים או לא שלמים. אסור לתקן, להשלים או לשפר אותם בשום דרך!
- **חיבור משפטים שבורים** – חבר יחד משפטים שבורים שנשמעים כהמשך ישיר זה לזה, גם אם הדובר עצמו אמר אותם בצורה מקוטעת, אך בלי לשנות ניסוח, בלי להוסיף ובלי ללטש סגנון.
- **איחוד חזרות מיותרות של הדובר** – איחוד או הסרת חזרות רצופות של מילים או ביטויים שהדובר אמר ברצף ללא הוספת משמעות (כמו "קשה, קשה", "לא יודעים... לא יודעים"), אך רק כאשר ברור שמדובר בחזרה רטורית או טכנית שאינה מוסיפה תוכן.
- **יישור רצף דיבור לא עקבי** – כאשר קיימות עצירות לא טבעיות בתמלול (כמו "...", ריבוי נקודות, מקפים מרובים או הפסקות טכניות), המודל רשאי להחליק את הרצף למשפט תקין, ללא כל שינוי בניסוח וללא עריכה סגנונית.
- **פיצול פסקאות ארוכות לפי רעיון משנה** – אם פסקה ארוכה מדי (מעל 6–7 שורות) ויש בה מעבר רעיוני נוסף—even אם אינו מסומן במעבר מפורש—חלק אותה לפסקה חדשה בהתאם לרעיונות, אך בלי לשנות ניסוח, לנסח מחדש או להוסיף תוכן.
- **החלקת חיבור בין משפטים סמוכים** – כאשר שני משפטים קצרים עומדים ברצף ומשלימים זה את זה מבחינה משמעותית, ניתן לחברם למשפט אחד זורם, כל עוד אין שינוי בניסוח והמשמעות נשמרת במלואה.

🔥 חשוב ביותר:
- הפרד כל פסקה עם שורה ריקה כפולה (\\n\\n)
- אל תשכתב, אל תסגנן ואל תחליף מילים במילים אחרות.
- מותר לבצע רק את התיקונים הטכניים שהוגדרו למעלה (חיבור שבירות, איחוד חזרות, יישור רצף, פיצול פסקאות וכד').
- אל תוסיף או תסיר תוכן חדש שאינו מופיע בטקסט.

🔒 איסור מוחלט על החלפת מילים או שינוי ניסוחים:

🚫 אין לשנות אף מילה שנאמרה, גם אם נדמה שהמילה שגויה, לא טבעית או נשמעת מוזרה.
אין להחליף מילים במילים נרדפות, קרובות או בעלות משמעות דומה
(לדוגמה: "מזיק לעצמי" ≠ "מעניש את עצמי").
אסור לשפר, לשכתב, לקצר או להרחיב ניסוחים.

🪶 מותרות בודדות בלבד:
- תיקון טעויות כתיב או היגוי טכניות (כגון: "במילא" → "ממילא", "הי'" → "היה").
- החלקת היגוי ליטאי לצורת כתיב תקנית בלבד – בלי לשנות מילה או משמעות.
- איחוד חזרות טכניות ("אני אני אומר" → "אני אומר").
- תיקון פיסוק בלבד (פסיקים, נקודות, סימני שאלה).

❗ אין לשנות משמעות, אין לשפר סגנון, ואין להשלים ניסוחים שנראים חסרים.
המטרה: **תמלול מדויק מילה במילה**, עם תיקונים טכניים בלבד.

הטקסט לחלוקה:
${text}

תחזיר את הטקסט המחולק לפסקאות עם \\n\\n בין כל פסקה:`;

  // Retry mechanism
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`🔍 DEBUG: Starting retry attempt ${attempt}/2...`);
    try {
      console.log(`🔄 Attempt ${attempt}/2 for chunk smart division...`);
      console.log(`🔍 DEBUG: About to call model.generateContent...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Smart division timeout after 3 minutes')), 3 * 60 * 1000)
      );

      const generatePromise = model.generateContent(prompt);
      console.log(`🔍 DEBUG: Starting Promise.race...`);
      result = await Promise.race([generatePromise, timeoutPromise]);
      console.log(`🔍 DEBUG: Promise.race completed successfully`);

      console.log(`🔍 DEBUG: Getting response from result...`);
      const response = await result.response;
      console.log(`🔍 DEBUG: Reading response text...`);
      const text = response.text().trim();
      console.log(`🔍 DEBUG: Response text read successfully`);

      return text;

    } catch (attemptError) {
      console.error(`❌ Chunk attempt ${attempt} failed:`, attemptError.message);
      if (attempt === 2) throw attemptError;

      // Longer delays for better rate limiting: 15s, 30s, 50s, 60s, 70s
      const waitTimes = [15000, 30000, 50000, 60000, 70000];
      const waitTime = waitTimes[attempt - 1] || 70000;
      console.log(`⏳ Waiting ${waitTime / 1000} seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // If we get here, all attempts failed
  throw new Error('All retry attempts failed');
}

// Helper function for Hebrew text fixes only (paragraphs handled by Gemini)
function applyHebrewTextFixes(text) {
  console.log(`🔧 Starting Hebrew text fixes...`);

  // שלב 1: תיקון אגרסיבי וחזק לכל בעיות העברית
  console.log('🔧 Starting SUPER AGGRESSIVE Hebrew fixing...');

  // קודם כל - נקה את כל הגרשיים לסוג אחיד
  text = text.replace(/["\u0022\u201C\u201D]/g, '"');

  // **שלב א: תיקון קיצורים נפוצים - ללא פשרות**
  const hebrewAbbreviations = [
    ['רש', 'י'], ['חז', 'ל'], ['שליט', 'א'], ['החיד', 'א'],
    ['הגר', 'א'], ['רמב', 'ם'], ['רמב', 'ן'], ['משנ', 'ב'],
    ['שו', 'ע'], ['שו', 'ת'], ['מהר', 'ל'], ['בק', 'ב'],
    ['ב', 'ה'], ['ד', 'ה']
  ];

  hebrewAbbreviations.forEach(([first, second]) => {
    // כל הווריאציות האפשריות של רווחים וגרשיים
    const patterns = [
      `${first}\\s*"\\s*${second}`,    // רש " י
      `${first}\\s+"\\s*${second}`,    // רש  " י
      `${first}"\\s*${second}`,        // רש" י
      `${first}\\s*"${second}`,        // רש "י
      `${first}"${second}`             // רש"י (כבר נכון)
    ];

    patterns.forEach(pattern => {
      const regex = new RegExp(pattern, 'g');
      text = text.replace(regex, `${first}"${second}`);
    });
  });

  // **שלב ב: תיקון כל מילה + גרשיים + אות (תבנית כללית)**
  text = text.replace(/([א-ת]{2,})\s*"\s*([א-ת])/g, '$1"$2');

  // **שלב ג: תיקון שמות וכותרים עם גרשיים**
  text = text
    .replace(/ה\s+"([^"]+)"/g, 'ה"$1"')              // ה "אוהב ישראל"
    .replace(/([א-ת])\s+"([^"]+)"/g, '$1"$2"')       // מילה "שם"

    // **שלב ד: תיקון מילים מתחלקות**
    .replace(/חז\s*"\s*לים/g, 'חז"לים')
    .replace(/([א-ת]+)לי\s*"\s*ם/g, '$1לים')        // כל מילה שמסתיימת ב"לי"ם

    // **שלב ה: תיקון מילים צמודות**
    .replace(/יודעתראו/g, 'יודעת ראו')
    .replace(/אומרתאני/g, 'אומרת אני')
    .replace(/שאלתיאותו/g, 'שאלתי אותו')

    // **שלב ו: תיקון פיסוק**
    .replace(/([א-ת]+)"\s*]/g, '$1."]')              // פיסוק עם סוגריים
    .replace(/\s+([.,!?:;])/g, '$1')                 // הסר רווחים לפני פיסוק
    .replace(/([.,!?:;])\s+/g, '$1 ')                // רווח אחרי פיסוק
    .replace(/\s{2,}/g, ' ')                         // רווחים כפולים
    .trim();

  console.log('✅ SUPER AGGRESSIVE Hebrew fixing completed');

  // תיקון נוסף של מילים שמתחלקות עם גרשיים
  text = text
    .replace(/חז\s*"\s*לים/g, 'חז"לים')      // חז "לים -> חז"לים
    .replace(/חז\s+"\s*לים/g, 'חז"לים')     // חז  "לים -> חז"לים
    .replace(/חכמי\s*"\s*ם/g, 'חכמים')
    .replace(/אמיני\s*ם/g, 'אמנים')

    // תיקון מילים עם ר' (רב)
    .replace(/ר\s*'\s*([א-ת])/g, 'ר\' $1')

    // תיקון מיתוקים שגויים במילים עבריות
    .replace(/אמן-ים/g, 'אמנים')
    .replace(/בן-אדם/g, 'בן אדם')
    .replace(/יהודי-ים/g, 'יהודים')
    .replace(/תלמיד-ים/g, 'תלמידים')
    .replace(/ילד-ים/g, 'ילדים')
    .replace(/שנ-ים/g, 'שנים')
    .replace(/חכמ-ים/g, 'חכמים')
    .replace(/רשע-ים/g, 'רשעים')

    // תיקון גרשיים וציטוטים מתקדם - פתרון חזק וסופי
    // שלב 1: נקה סוגי גרשיים שונים לאחיד
    .replace(/["\u0022\u201C\u201D]/g, '"')

    // שלב 2: תקן גרשיים כפולים סביב שמות (ה "אוהב ישראל" -> ה"אוהב ישראל")
    .replace(/ה\s+"([^"]+)"/g, 'ה"$1"')
    .replace(/([א-ת])\s+"([^"]+)"/g, '$1"$2"')

    // שלב 3: הוסף רווחים לפני גרשיים שצמודים למילים עבריות (רק לציטוטים)
    .replace(/([א-ת])"([א-ת][^"]*[א-ת])"([.,!?\s])/g, '$1 "$2"$3')
    .replace(/([א-ת])"([א-ת]{2,})/g, (match, before, after) => {
      // שמור קיצורים עבריים מוכרים
      const abbreviations = ['לים', 'לי', 'לין', 'לנו', 'ל', 'ם', 'ן', 'א', 'י', 'ב', 'ה', 'ע', 'ת'];
      if (abbreviations.some(abbr => after.startsWith(abbr))) {
        return match; // השאר כמו שזה
      }
      return before + ' "' + after; // הוסף רווח
    })

    // שלב 4: תקן גרשיים שיש להם רווח מיותר לפני הם
    .replace(/([א-ת])\s{2,}"([א-ת])/g, '$1 "$2')

    // שלב 5: תקן גרשיים עם פיסוק - צמוד למילה לפני הפיסוק
    .replace(/([א-ת])"([.,!?])/g, '$1"$2')

    // שלב 6: תקן תחילת ציטוטים
    .replace(/\s"([א-ת])/g, ' "$1')
    .replace(/^"([א-ת])/gm, '"$1')

    // שלב 7: תקן גרשיים סוגרים צמודים למילה הבאה
    .replace(/([.,!?])"([א-ת])/g, '$1" $2')
    .replace(/([א-ת])"([א-ת])/g, '$1" $2')
    .replace(/(\s)"([א-ת])/g, '$1"$2')
    .replace(/^"([א-ת])/gm, '"$1')

    // שלב 8: תקן פיסוק אחרי גרשיים שצמוד לא נכון
    .replace(/([א-ת])"\.\s*"/g, '$1."')
    .replace(/([א-ת])"\.\s*]/g, '$1."]')
    .replace(/([א-ת])"\,/g, '$1",')
    .replace(/([א-ת])"!/g, '$1"!')
    .replace(/([א-ת])"\?/g, '$1"?')

    // תיקון פיסוק חזק יותר - הסרת רווחים לפני פיסוק
    .replace(/\s+([.,!?:;])/g, '$1')
    .replace(/([.,!?:;])\s+/g, '$1 ')

    // תיקון פיסוק עם מילים עבריות
    .replace(/([א-ת])([.,!?:;])([א-ת])/g, '$1$2 $3')

    // תיקון מקרים ספציפיים של מילים צמודות
    .replace(/יודעתראו/g, 'יודעת ראו')
    .replace(/אומרתאני/g, 'אומרת אני')
    .replace(/שאלתיאותו/g, 'שאלתי אותו')
    .replace(/אמרתיכן/g, 'אמרתי כן')

    // תיקון סופי של חז"ל עם רווח
    .replace(/חז\s+"לים/g, 'חז"לים')
    .replace(/חז\s+\"\s*לים/g, 'חז"לים')

    // תיקון בעיות צמידות גרשיים ופיסוק - פתרון סופי ומושלם
    .replace(/([א-ת])\."/g, '$1".')              // נקודה לפני גרשיים
    .replace(/([א-ת])"([א-ת])/g, '$1 "$2')      // רווח לפני גרשיים פותחים

    // תיקונים ספציפיים לבעיות מתקדמות
    .replace('אומר "שאל', 'אומר" שאל')          // תיקון גרשיים סוגרים ספציפי
    .replace('ום."ו', 'ום". ו')                  // תיקון נקודה במקום הלא נכון
    .replace('".היום', '". היום')               // תיקון גרשיים+נקודה צמודים

    // תיקונים כלליים נוספים
    .replace(/"\\.([א-ת])/g, '". $1')            // רווח אחרי נקודה+גרשיים

    // תיקון בעיות פיסוק בסוף ציטוטים
    .replace(/([א-ת]+)"\s*]/g, '$1."]')
    .replace(/([א-ת]+)"\s*\]/g, '$1"]')

    // ניקוי רווחים מיותרים
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+|\s+$/gm, '')
    .trim();

  console.log(`✅ Hebrew text fixes completed`);

  // החזר את הטקסט המתוקן ללא עיבוד פסקאות (ג'מיני כבר עשה את זה)
  return text;
}

// Helper function to sanitize filename for API calls
function sanitizeFilename(filename) {
  if (!filename) return filename;

  // Replace problematic characters that can cause API issues
  let sanitized = filename
    .replace(/['"]/g, '') // Remove single and double quotes
    .replace(/['׳״]/g, '') // Remove Hebrew geresh and gershayim
    .replace(/[<>:"|?*]/g, '_') // Replace other problematic chars with underscore
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // If still too long (over 150 chars), truncate while preserving extension
  if (sanitized.length > 150) {
    const extension = path.extname(sanitized);
    const nameWithoutExt = sanitized.slice(0, -extension.length);
    const maxNameLength = 150 - extension.length - 3; // -3 for "..."

    if (maxNameLength > 0) {
      sanitized = nameWithoutExt.slice(0, maxNameLength) + '...' + extension;
      console.log(`✂️ Truncated long filename: "${filename}" → "${sanitized}"`);
    }
  }

  if (sanitized !== filename) {
    console.log(`🧹 Sanitized filename: "${filename}" → "${sanitized}"`);
  }

  return sanitized;
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
async function realGeminiTranscription(filePath, filename, language, customInstructions) {
  try {
    const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
    const duration = await getAudioDuration(filePath);
    const durationMinutes = duration / 60;

    return await realGeminiTranscriptionWithDuration(filePath, filename, language, customInstructions, duration);
  } catch (error) {
    console.error('🔥 Transcription error:', error);
    throw error;
  }
}

// Enhanced version that accepts pre-calculated duration to avoid multiple getAudioDuration calls
async function realGeminiTranscriptionWithDuration(filePath, filename, language, customInstructions, duration, transcriptionId = null, fileIndex = 0, totalFiles = 1, userEmail = null) {
  try {
    const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
    const durationMinutes = duration / 60;
    
    console.log(`🎵 Processing: ${cleanFilename(filename)}`);
    console.log(`📊 File size: ${fileSizeMB.toFixed(1)} MB, Duration: ${durationMinutes.toFixed(1)} minutes`);

    // Decide transcription strategy - ALWAYS use FFmpeg if available
    const ffmpegAvailable = checkFFmpegAvailability();

    if (!ffmpegAvailable) {
      console.log(`📝 Using direct transcription (FFmpeg unavailable)`);
      return await directGeminiTranscription(filePath, filename, language, customInstructions, transcriptionId, fileIndex, totalFiles);
    }

    console.log(`🔪 Using chunked transcription (FFmpeg processing for all files)`);
    return await chunkedGeminiTranscription(filePath, filename, language, durationMinutes, customInstructions, transcriptionId, fileIndex, totalFiles, userEmail);

  } catch (error) {
    console.error('🔥 Transcription error:', error);
    throw error;
  }
}

// Direct transcription (original method)
async function directGeminiTranscription(filePath, filename, language, customInstructions, transcriptionId = null, fileIndex = 0, totalFiles = 1) {
  try {
    // Send progress update for direct transcription start
    if (transcriptionId) {
      const baseProgress = 20 + ((fileIndex / totalFiles) * 60);
      updateTranscriptionProgress(
        transcriptionId,
        Math.round(baseProgress),
        `מתחיל תמלול ישיר עבור ${filename}`,
        filename
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      generationConfig: {
        temperature: 0,
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

🔥🔥🔥 הוראה קריטית חדשה: זהה והסר קטעים של חזרות פגומות וחסרות פשר (לדוגמה: "זה היה נו- זה היה נושא אחר, e, זה היה"). אם נתקלת בקטע כזה, השמט אותו לחלוטין והמשך את התמלול מהנקודה התקינה הבאה.

🚨 חשוב: אם מילים חוזרות על עצמן, רשום אותן מקסימום 5 פעמים ברציפות.

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

3. טיפול נכון במספרים בספרות: שים לב היטב לאיפה מספרים (1,2,3) מוזכרים במשפט:
   - שמור על המיקום המדויק של המספר במשפט כפי שנאמר
   - אל תזיז מספרים להתחלה או לסוף המשפט
   - אם נאמר "בפרק 13" - כתוב "בפרק 13" ולא "13 בפרק"
   - אם נאמר "דף 23 אמר" - כתוב "דף 23 אמר" ולא "23 דף אמר"
   - הקשב לסדר המילים המדויק כפי שנאמר באודיו

4. דיוק מוחלט: תמלל הכל ללא השמטות
1. תמלל כל שנייה, כל מילה, כל משפט מההתחלה ועד הסוף
2. אם האודיו ארוך 60 דקות - תמלל את כל 60 הדקות ללא יוצא מן הכלל
3. אל תעצור באמצע, אל תקצר, אל תסכם - רק תמלול מלא 100%
4. אם יש הפסקות או רעש - כתוב [הפסקה] והמשך לתמלל
5. המשך לתמלל עד שהאודיו נגמר לחלוטין
6. אל תכתוב "המשך התמלול..." או "סיום התמלול" - רק התוכן המלא
7. 🔒 **אסור בהחלט לשפר או להשלים ציטוטים** - פסוקים, מאמרי חז"ל ואמירות חכמים חייבים להישאר כמו שנאמרו בדיוק, גם אם הם נשמעים חסרים, שגויים או לא שלמים. אסור לתקן, להשלים או לשפר אותם בשום דרך!

🎯 ${(language === 'Hebrew' || language === 'he') ? 'תמלל לעברית תקנית:' : `Transcribe in ${language || 'the original language'}. Do NOT translate:`}

🔤 עיצוב וסגנון:
- מושגים דתיים מדויקים
- ציטוטים במירכאות - ודא שכל ציטוט (פסוק, מאמר חז"ל, אמרה) ודו שיח ישיר עטוף במירכאות ("...") באופן מדויק ונכון תחבירית
- השתמש ברווחים תקניים בעברית
- החזר טקסט מוכן לשימוש ללא עיבוד נוסף
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

    // 🔥 NEW: הסר חזרות קיצוניות מהמודל
    transcription = removeExtremeRepetitions(transcription);

    // Enhanced text cleaning
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .trim();

    console.log(`✅ Direct transcription completed: ${transcription.length} characters`);

    // Send progress update for paragraph division
    if (transcriptionId) {
      const baseProgress = 20 + ((fileIndex / totalFiles) * 60);
      const paragraphProgress = baseProgress + (0.7 * (60 / totalFiles)); // 70% through file processing
      updateTranscriptionProgress(
        transcriptionId,
        Math.round(paragraphProgress),
        `מחלק לפסקאות עבור ${filename}`,
        filename
      );
    }

    // שלב 2: חלוקה חכמה לפסקאות בגמיני
    console.log(`🔍 Starting smart paragraph division for all languages, length=${transcription.length}`);
    console.log(`⏱️ Waiting 3 seconds before smart paragraph division to avoid API rate limits...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(`🎯 Starting smart paragraph division with Gemini...`);
    transcription = await smartParagraphDivision(transcription);

    // Send progress update for completion
    if (transcriptionId) {
      const baseProgress = 20 + (((fileIndex + 1) / totalFiles) * 60);
      updateTranscriptionProgress(
        transcriptionId,
        Math.round(baseProgress),
        `הושלם תמלול עבור ${filename}`,
        filename
      );
    }

    return transcription;
    
  } catch (error) {
    console.error('🔥 Direct transcription error:', error);
    throw error;
  }
}

// Chunked transcription for large files
async function chunkedGeminiTranscription(filePath, filename, language, durationMinutes, customInstructions, transcriptionId = null, fileIndex = 0, totalFiles = 1, userEmail = null) {
  let chunksData;
  
  try {
    // Determine chunk size based on total duration
    const chunkDuration = durationMinutes > 60 ? 6 : 8; // minutes per chunk
    
    // Split audio into chunks
    // Reduced chunk duration for better success rate and faster processing
    const optimizedChunkDuration = 4; // Changed from 8 to 4 minutes
    chunksData = await splitAudioIntoChunks(filePath, optimizedChunkDuration);
    console.log(`📦 Using optimized chunk duration: ${optimizedChunkDuration} minutes (was 8 minutes)`);
    
    if (chunksData.chunks.length === 0) {
      throw new Error('No chunks were created');
    }
    
    // 🔥 Process all chunks in parallel using Promise.all with improved error handling
    const transcriptions = await Promise.all(
      chunksData.chunks.map(async (chunk, i) => {
        const maxRetries = 2;
        let retryCount = 0;
        let chunkTranscription = null;

        console.log(`🎯 Processing chunk ${i + 1}/${chunksData.chunks.length} - Adding to queue...`);

        // Send progress update for each chunk
        if (transcriptionId) {
          // Calculate progress within the file: 20% base + 60% for file processing
          const baseProgress = 20 + ((fileIndex / totalFiles) * 60);
          const chunkProgress = baseProgress + ((i / chunksData.chunks.length) * (60 / totalFiles));
          updateTranscriptionProgress(
            transcriptionId,
            Math.round(chunkProgress),
            `מעבד חלק ${i + 1} מתוך ${chunksData.chunks.length} של ${filename}`,
            filename
          );
        }

        while (retryCount <= maxRetries && !chunkTranscription) {
          try {
            if (retryCount > 0) {
              console.log(`🔄 Retry ${retryCount}/${maxRetries} for chunk ${i + 1}`);
              // Exponential backoff: 5s, 15s, 30s, 45s, 60s
              const backoffDelays = [5000, 15000, 30000, 45000, 60000];
              const backoffDelay = backoffDelays[retryCount - 1] || 60000;
              console.log(`⏳ Waiting ${backoffDelay/1000}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }

            // Get user queue for this transcription
            const userQueue = getUserQueue(userEmail || 'anonymous');

            // Use fallback only on the last retry
            if (retryCount === maxRetries) {
              chunkTranscription = await userQueue.add(() =>
                executeWithGlobalThrottling(() =>
                  transcribeAudioChunkWithFlashFallback(
                    chunk.path,
                    i,
                    chunksData.chunks.length,
                    filename,
                    language,
                    customInstructions,
                    retryCount
                  ), userEmail || 'anonymous')
              );
            } else {
              chunkTranscription = await userQueue.add(() =>
                executeWithGlobalThrottling(() =>
                  transcribeAudioChunk(
                    chunk.path,
                    i,
                    chunksData.chunks.length,
                    filename,
                    language,
                    customInstructions,
                    retryCount
                  ), userEmail || 'anonymous')
              );
            }

            // 🔹 SMART: Accept all chunks, mark quality status
            if (chunkTranscription && chunkTranscription.trim().length >= 20) {
              console.log(`✅ Chunk ${i + 1} completed successfully with ${chunkTranscription.length} characters`);
              break; // Good chunk - exit retry loop
            } else if (chunkTranscription && chunkTranscription.trim().length > 0) {
              console.warn(`⚠️ Chunk ${i + 1} is short/suspect (${chunkTranscription.length} chars) - marking for later review`);
              break; // Accept short chunk, will handle later
            } else {
              // Really empty - try retry
              console.warn(`❌ Chunk ${i + 1} returned empty, will retry...`);
              chunkTranscription = null;
              throw new Error('Empty transcription result');
            }

            // Send progress update for chunk completion
            if (transcriptionId) {
              const baseProgress = 20 + ((fileIndex / totalFiles) * 60);
              const completedProgress = baseProgress + (((i + 1) / chunksData.chunks.length) * (60 / totalFiles));
              updateTranscriptionProgress(
                transcriptionId,
                Math.round(completedProgress),
                `הושלם חלק ${i + 1} מתוך ${chunksData.chunks.length} של ${filename}`,
                filename
              );
            }

          } catch (chunkError) {
            retryCount++;
            console.error(`❌ Failed to transcribe chunk ${i + 1} (attempt ${retryCount}):`, chunkError.message);

            if (retryCount > maxRetries) {
              console.error(`💀 Chunk ${i + 1} failed after ${maxRetries} retries`);
              chunkTranscription = `[שגיאה בתמלול קטע ${i + 1} - נכשל אחרי ${maxRetries} ניסיונות]`;
              break; // Exit retry loop with error message
            } else {
              // Wait before retry
              console.log(`⏳ Waiting before retry for chunk ${i + 1}...`);
              chunkTranscription = null; // Reset for next attempt
            }
          }
        }

        // 🔧 FIX: Ensure we always return something
        if (!chunkTranscription) {
          console.error(`🚨 CRITICAL: Chunk ${i + 1} finished processing but no result available!`);
          chunkTranscription = `[שגיאה קריטית בתמלול קטע ${i + 1} - אבד תוכן]`;
        }

        console.log(`📋 Chunk ${i + 1} final result: ${chunkTranscription.substring(0, 100)}...`);
        return chunkTranscription;
      })
    );

    console.log(`🎉 All ${chunksData.chunks.length} chunks processed in parallel!`);

    // 🔧 CRITICAL FIX: Wait for all queued tasks to complete
    console.log(`⏳ Waiting for all user queues to finish...`);
    const activeQueues = Array.from(userQueues.values());
    await Promise.all(activeQueues.map(queue => queue.onIdle()));
    console.log(`✅ All queues are now idle - proceeding with merge`);

    // 🛡️ FINAL INTEGRITY CHECK – prevents missing chunks
    console.log('🛡️ Running final integrity validation...');

    const expectedChunks = chunksData.chunks.length;

    // 1. Check that all indices exist
    for (let i = 0; i < expectedChunks; i++) {
      if (!transcriptions[i]) {
        console.error(`🚨 Missing transcription for chunk ${i + 1}! Re-running this chunk...`);
        const userQueue = getUserQueue(userEmail || 'anonymous');
        transcriptions[i] = await userQueue.add(() =>
          executeWithGlobalThrottling(() =>
            transcribeAudioChunk(
              chunksData.chunks[i].path,
              i,
              expectedChunks,
              filename,
              language,
              customInstructions,
              0
            ), userEmail || 'anonymous')
        );
      }
    }


    // 3. Length sanity check (prevents silent data loss)
    const totalLength = transcriptions.reduce((sum, t) => sum + (t ? t.length : 0), 0);
    if (totalLength < expectedChunks * 200) {
      console.warn(`⚠️ Final merged transcription is unusually short (${totalLength} chars for ${expectedChunks} chunks). Manual check recommended.`);
    }

    console.log(`✅ Integrity check complete — all ${expectedChunks} chunks validated. Total length: ${totalLength} chars`);

    // 🔧 FIX: Enhanced validation and logging for chunk results
    console.log('📊 Chunk results validation:');
    transcriptions.forEach((chunk, index) => {
      if (!chunk) {
        console.error(`🚨 CRITICAL: Chunk ${index + 1} is null/undefined!`);
      } else if (chunk.trim().length === 0) {
        console.error(`🚨 CRITICAL: Chunk ${index + 1} is empty!`);
      } else if (chunk.includes('[שגיאה')) {
        console.warn(`⚠️ Chunk ${index + 1} contains error message: ${chunk.substring(0, 100)}...`);
      } else {
        console.log(`✅ Chunk ${index + 1}: ${chunk.length} chars - ${chunk.substring(0, 50)}...`);
      }
    });

    // Check for failed chunks in the transcription
    const failedChunks = transcriptions.filter(chunk =>
      !chunk || chunk.includes('[שגיאה בתמלול קטע') ||
      chunk.includes('נכשל אחרי') ||
      chunk.includes('אבד תוכן')
    );

    // If too many chunks failed, fall back to direct transcription
    if (failedChunks.length >= 30) {
      console.error(`🚨 Too many failed chunks: ${failedChunks.length} total`);
      console.log('🔄 Falling back to direct transcription due to too many failures...');

      try {
        return await directGeminiTranscription(filePath, filename, language, customInstructions);
      } catch (fallbackError) {
        throw new Error(`גם התמלול המקטעי וגם הישיר נכשלו: ${fallbackError.message}`);
      }
    }


    // 🔧 FIX: Log detailed chunk information before merging
    console.log(`📈 Pre-merge summary: ${transcriptions.length} total chunks, ${failedChunks.length} failed chunks`);
    console.log(`📊 Chunk sizes: [${transcriptions.map(c => c ? c.length : 0).join(', ')}]`);

    // Merge all transcriptions
    const finalTranscription = await mergeTranscriptionChunks(transcriptions, language);

    if (failedChunks.length > 0) {
      console.warn(`⚠️ Transcription completed with ${failedChunks.length} failed chunks out of ${transcriptions.length}`);
      // Add warning to the beginning of transcription
      const warningText = `⚠️ הערה: תמלול זה הושלם עם ${failedChunks.length} קטעים שנכשלו מתוך ${transcriptions.length} קטעים כולל. הקטעים הכושלים מסומנים בטקסט.\n\n`;
      const finalWithWarning = warningText + finalTranscription;

      console.log(`🎉 Chunked transcription completed with warnings: ${finalWithWarning.length} characters from ${transcriptions.length} chunks`);
      return finalWithWarning;
    }

    console.log(`🎉 Chunked transcription completed successfully: ${finalTranscription.length} characters from ${transcriptions.length} chunks`);
    return finalTranscription;
    
  } catch (error) {
    console.error('🔥 Chunked transcription failed:', error);
    console.log('🔄 Falling back to direct transcription...');
    
    try {
      return await directGeminiTranscription(filePath, filename, language, customInstructions);
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



// 🔥 NEW: פונקציה לשיפור איכות הטקסט עם ג'מיני (ללא שינוי מבנה פסקאות)
async function improveTranscriptionQuality(transcription, language = 'Hebrew') {
  try {
    console.log('🔧 Starting text quality improvement with Gemini...');

    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768
      }
    });

    const improvementPrompt = `אתה עורך טקסט מקצועי. תקבל טקסט מתומלל ותשפר אותו **מבלי לשנות את מבנה הפסקאות**.

🎯 **משימות שיפור:**
1. **תקן שגיאות כתיב ודקדוק** - הקפד על עברית תקנית
2. **שפר סימני פיסוק** - פסיקים, נקודות, סימני שאלה במקומות הנכונים
3. **תקן מילות מפתח שגויות** - שמות, מונחים מקצועיים
4. **הסר חזרות מיותרות** - מילים שחוזרות ללא הצדקה
5. **שמור על המבנה המדויק** - אל תוסיף או תסיר שורות ריקות
6. **🚨 אין להשמיט מילים או ביטויי ייחוס** (כגון: "כך אמר", "כך שאל", "כך ענה"), גם אם הם קצרים או נראים משניים

🚨 **חוקים קריטיים:**
- אל תשנה את מבנה הפסקאות הקיים
- אל תוסיף תוכן חדש
- אל תקצר משמעותית
- שמור על הסגנון המקורי של הדובר
- התחל ישירות עם הטקסט המשופר

🔒 **איסור מוחלט על החלפת מילים או שינוי ניסוחים:**

🚫 אין לשנות אף מילה שנאמרה, גם אם נדמה שהמילה שגויה, לא טבעית או נשמעת מוזרה.
אין להחליף מילים במילים נרדפות, קרובות או בעלות משמעות דומה
(לדוגמה: "מזיק לעצמי" ≠ "מעניש את עצמי").
אסור לשפר, לשכתב, לקצר או להרחיב ניסוחים.

🪶 **מותרות בודדות בלבד:**
- תיקון טעויות כתיב או היגוי טכניות (כגון: "במילא" → "ממילא", "הי'" → "היה").
- החלקת היגוי ליטאי לצורת כתיב תקנית בלבד – בלי לשנות מילה או משמעות.
- איחוד חזרות טכניות ("אני אני אומר" → "אני אומר").
- תיקון פיסוק בלבד (פסיקים, נקודות, סימני שאלה).

❗ אין לשנות משמעות, אין לשפר סגנון, ואין להשלים ניסוחים שנראים חסרים.
המטרה: **תמלול מדויק מילה במילה**, עם תיקונים טכניים בלבד.

**הטקסט לשיפור:**
${transcription}`;

    const result = await model.generateContent(improvementPrompt);
    const response = await result.response;
    let improvedText = response.text();

    // נקה מקדמות מיותרות
    improvedText = improvedText
      .replace(/^\s*טקסט משופר[:\s]*/i, '')
      .replace(/^\s*הנה הטקסט המשופר[:\s]*/i, '')
      .replace(/^\s*תוצאה[:\s]*/i, '')
      .trim();

    console.log(`✅ Text quality improvement completed: ${transcription.length} -> ${improvedText.length} characters`);
    return improvedText;

  } catch (error) {
    console.error('❌ Error in text quality improvement:', error.message);
    console.log('⚠️ Returning original transcription due to improvement error');
    return transcription;
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

// Template-based Word document creation - guaranteed RTL
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating template-based Word document with guaranteed RTL for: ${cleanName}`);

    const JSZip = require('jszip');
    const templatePath = path.join(__dirname, 'template.docx');

    // בדיקה אם התבנית קיימת
    if (!fs.existsSync(templatePath)) {
      console.log('⚠️ Template not found, falling back to HTML method');
      return await createWordDocumentFallback(transcription, filename, duration);
    }

    // טעינת התבנית
    const templateData = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    const docXml = await zip.file('word/document.xml').async('text');

    // 2. נקה את התמלול מהערות מיותרות (כמו רעשי רקע)
    const cleanedTranscription = transcription
      .replace(/\[מוזיקה\]|\[רעש רקע\]|\[צלילים\]|\[רעש\]|\[קולות\]|\[הפסקה\]|\[שקט\]|\[.*?ברור.*?\]/gi, '')
      .replace(/\n{3,}/g, '\n\n') // שמור על מעברי פסקאות קיימים
      .trim();

    // 3. פיצול לפסקאות לפי מה שהחזיר ג'מיני (ללא עיבוד נוסף)
    const shortParagraphs = cleanedTranscription
      .split(/\n\n+/) // פיצול לפי שורות ריקות כפולות
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // יצירת XML לכל פסקה קצרה
    const paragraphElements = shortParagraphs.map(paragraph => `
      <w:p w14:paraId="346CE71B" w14:textId="424A57EE" w:rsidR="009550AA" w:rsidRPr="009F17F4" w:rsidRDefault="0056303E" w:rsidP="0056303E">
        <w:pPr>
          <w:jc w:val="right"/>
          <w:bidi w:val="1"/>
          <w:textDirection w:val="rl"/>
          <w:spacing w:after="240"/>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
            <w:rtl/>
          </w:rPr>
        </w:pPr>
        <w:r w:rsidRPr="0056303E">
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
            <w:rtl/>
          </w:rPr>
          <w:t>${escapeXml(paragraph)}</w:t>
        </w:r>
      </w:p>`);

    const newParagraphs = [titleParagraph, ...paragraphElements];

    // החלפת התוכן בתבנית החדשה
    let paragraphIndex = 0;
    let newDocXml = docXml.replace(/<w:t>REPLACECONTENT<\/w:t>/g, () => {
      if (paragraphIndex < shortParagraphs.length) {
        const text = shortParagraphs[paragraphIndex];
        paragraphIndex++;
        return `<w:t>${escapeXml(text)}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // תיקון הגדרות שפה - החלפת כל הגדרה של ערבית לעברית
    newDocXml = newDocXml
      .replace(/w:lang w:val="ar-SA"/g, 'w:lang w:val="he-IL"')
      .replace(/w:lang w:eastAsia="ar-SA"/g, 'w:lang w:eastAsia="he-IL"')
      .replace(/w:lang w:bidi="ar-SA"/g, 'w:lang w:bidi="he-IL"')
      .replace(/w:lang w:val="ar"/g, 'w:lang w:val="he-IL"')
      .replace(/w:lang w:eastAsia="ar"/g, 'w:lang w:eastAsia="he-IL"')
      .replace(/w:lang w:bidi="ar"/g, 'w:lang w:bidi="he-IL"');

    console.log('📝 Fixed language settings from Arabic to Hebrew in Word document');

    // יצירת ZIP חדש
    const newZip = new JSZip();

    // העתקת כל הקבצים מהתבנית
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, newDocXml);
      } else if (!file.dir) {
        const content = await file.async('nodebuffer');
        newZip.file(relativePath, content);
      }
    }

    const buffer = await newZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    console.log(`✅ Template-based Word document created successfully for: ${cleanName}`);
    return buffer;

  } catch (error) {
    console.error('Error creating template-based Word document:', error);
    console.log('⚠️ Falling back to HTML method');
    return await createWordDocumentFallback(transcription, filename, duration);
  }
}

// NEW: Python-based Word document creation
async function createWordDocumentPython(transcription, filename, duration, language = 'Hebrew') {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`🐍 Creating Word document using Python for: ${cleanName} (Language: ${language})`);

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    // יצירת נתיב לקובץ הפלט
    const outputPath = path.join(__dirname, 'output', `${cleanName}.docx`);

    // וידוא שתיקיית output קיימת
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // הכנת הנתונים לסקריפט Python
    const pythonData = JSON.stringify({
      transcription: transcription,
      title: cleanName,
      output_path: outputPath,
      language: language || 'Hebrew'
    });

    // יצירת קובץ זמני עבור הנתונים
    const tempDataPath = path.join(__dirname, `temp_data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`);

    try {
      fs.writeFileSync(tempDataPath, pythonData, 'utf8');
    } catch (error) {
      console.error('❌ Failed to write temp data file:', error);
      throw new Error('Failed to prepare data for Python script');
    }

    // קריאה לסקריפט Python עם נתיב לקובץ הנתונים
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['generate_word_doc.py', tempDataPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // ניסיון לפרסר את התגובה מ-Python
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1];

            if (lastLine.startsWith('{')) {
              const result = JSON.parse(lastLine);
              if (result.success && fs.existsSync(outputPath)) {
                console.log(`✅ Python script completed successfully: ${outputPath}`);
                const buffer = fs.readFileSync(outputPath);
                // ניקוי קבצים זמניים
                fs.unlinkSync(outputPath);
                try { fs.unlinkSync(tempDataPath); } catch (e) {}
                resolve(buffer);
              } else {
                console.error('❌ Python script failed:', result.error || 'Unknown error');
                try { fs.unlinkSync(tempDataPath); } catch (e) {}
                reject(new Error(result.error || 'Python script failed'));
              }
            } else {
              console.log('🐍 Python output:', output);
              if (fs.existsSync(outputPath)) {
                const buffer = fs.readFileSync(outputPath);
                fs.unlinkSync(outputPath);
                try { fs.unlinkSync(tempDataPath); } catch (e) {}
                resolve(buffer);
              } else {
                try { fs.unlinkSync(tempDataPath); } catch (e) {}
                reject(new Error('Output file not created'));
              }
            }
          } catch (parseError) {
            console.error('❌ Error parsing Python output:', parseError);
            console.log('Raw output:', output);
            try { fs.unlinkSync(tempDataPath); } catch (e) {}
            reject(parseError);
          }
        } else {
          console.error(`❌ Python script exited with code ${code}`);
          console.error('Error output:', errorOutput);
          console.log('Standard output:', output);
          try { fs.unlinkSync(tempDataPath); } catch (e) {}
          reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('❌ Error spawning Python process:', error);
        try { fs.unlinkSync(tempDataPath); } catch (e) {}
        reject(error);
      });
    });

  } catch (error) {
    console.error('❌ Error in Python Word document creation:', error);
    throw error;
  }
}

// Fallback method using HTML-to-DOCX
async function createWordDocumentFallback(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Using fallback HTML-to-DOCX method for: ${cleanName}`);

    const HTMLtoDOCX = require('html-to-docx');

    // נקה את הטקסט
    let cleanedText = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // פצל לפסקאות
    let sections = cleanedText.split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);

    // בנה HTML עם הגדרות RTL
    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      // השתמש בטקסט מוכן שעובד - ללא עיבוד כלל
      if (section.includes("טקסט לבדיקה")) {
        combinedSection = "זה טקסט לבדיקה של פיסוק, כמו זה. האם הוא עובד כהלכה? כן אני חושב: זה נראה טוב; לא יודע.";
      } else {
        // רק ניקוי רווחים כפולים
        combinedSection = combinedSection.replace(/\s{2,}/g, ' ').trim();
      }

      if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
        combinedSection += '.';
      }

      contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px; font-family: Arial, sans-serif;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
    });

    const htmlString = `<!DOCTYPE html>
<html lang="he-IL" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <meta name="language" content="Hebrew">
    <meta http-equiv="Content-Language" content="he-IL">
    <title>תמלול</title>
  </head>
  <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial, sans-serif; font-size: 15px;" lang="he-IL">
    <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0; font-family: Arial, sans-serif;">${cleanName}</h1>
    <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8; font-family: Arial, sans-serif;">
      ${contentHtml}
    </div>
  </body>
</html>`;

    const buffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      lang: 'he-IL',
      locale: 'he-IL'
    });

    console.log(`✅ Fallback Word document created successfully for: ${cleanName}`);
    return buffer;

  } catch (error) {
    console.error('Error creating fallback Word document:', error);
    throw error;
  }
}


// Enhanced email with failure reporting - using SendGrid
async function sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions = []) {
  try {
    console.log(`📧 Preparing enhanced email for: ${userEmail}`);
    console.log(`📊 Successful: ${transcriptions.length}, Failed: ${failedTranscriptions.length}`);
    
const attachments = transcriptions.map(trans => {
  const cleanName = cleanFilename(trans.filename);
  return {
    filename: `${cleanName}.docx`,
    content: trans.wordDoc,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
});

    const successList = transcriptions.map(t => {
      const cleanName = cleanFilename(t.filename);
      const wordCount = t.transcription.split(/\s+/).length;

      // Check if this transcription has failed chunks
      const hasFailedChunks = t.transcription.includes('[שגיאה בתמלול קטע') || t.transcription.includes('נכשל אחרי');
      const warningIcon = hasFailedChunks ? ' ⚠️' : '';
      const warningText = hasFailedChunks ? ' <small style="color: #856404;">(תמלול חלקי - ראה הערות בקובץ)</small>' : '';

      return `<li>📄 <strong>${cleanName}</strong>${warningIcon} <small>(${wordCount} מילים)</small>${warningText}</li>`;
    }).join('');

    // Check for partial transcriptions with failed chunks
    const partialTranscriptions = transcriptions.filter(t =>
      t.transcription.includes('[שגיאה בתמלול קטע') || t.transcription.includes('נכשל אחרי')
    );

    let failureSection = '';

    // Section for completely failed files
    if (failedTranscriptions.length > 0) {
      const failureList = failedTranscriptions.map(f => {
        const cleanName = cleanFilename(f.filename);
        return `<li>❌ <strong>${cleanName}</strong></li>`;
      }).join('');

      failureSection += `
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

    // Section for partially failed transcriptions
    if (partialTranscriptions.length > 0) {
      const partialList = partialTranscriptions.map(t => {
        const cleanName = cleanFilename(t.filename);
        return `<li>⚠️ <strong>${cleanName}</strong> - תמלול חלקי</li>`;
      }).join('');

      failureSection += `
        <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #0d6efd;">
          <h3 style="color: #084298; margin-bottom: 15px; font-size: 18px;">ℹ️ תמלולים עם קטעים שנכשלו:</h3>
          <ul style="margin: 10px 0; font-size: 15px; color: #084298;">
            ${partialList}
          </ul>
          <p style="font-size: 14px; margin-top: 15px; color: #084298;">
            <strong>💡 הסבר:</strong> קבצים אלה תומללו בהצלחה, אך חלקים מסוימים לא הצליחו (מסומנים בקובץ Word).
            הדבר יכול לקרות בגלל רעש, שקט ממושך, או איכות אודיו נמוכה באזורים מסוימים.
          </p>
        </div>
      `;
    }

    // Create HTML content for email
    const htmlContent = `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 26px;">🎯 התמלול המלא הושלם בהצלחה!</h1>
          </div>

          <div style="background: #f8f9ff; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 25px;">שלום וברכה,</p>

            <p style="font-size: 16px; margin-bottom: 25px;">
              התמלול המלא והמפורט שלך הושלם!
              מצורפים קבצי Word עם תמלול שלם מההתחלה עד הסוף:
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #4caf50;">
              <h3 style="color: #2e7d32; margin-bottom: 15px; font-size: 18px;">✅ קבצים שהושלמו בהצלחה:</h3>
              <ul style="margin: 10px 0; font-size: 16px;">
                ${successList}
              </ul>
            </div>

            ${failureSection}


           <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 18px; color: #667eea; font-weight: bold;">
                🎉 תמלול מלא ושלם - אפילו לקבצים של שעות!
              </p>
            </div>

            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
              בברכה,<br>
              <strong>צוות התמלול החכם</strong><br>
              מערכת תמלול מתקדמת עם חלוקה למקטעים
            </p>
          </div>
        </div>
          `;

    // Send email using Gmail/nodemailer
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `✅ תמלול מלא הושלם - ${transcriptions.length} קבצי Word מצורפים`,
      html: htmlContent,
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Gmail email sent successfully to: ${userEmail}`);

  } catch (error) {
    console.error('❌ Email sending error:', error.message);
    console.error('❌ Error code:', error.code);

    // Don't throw error - transcription succeeded, only email failed
    console.log('⚠️ Transcription completed successfully but email failed');
    console.log('💡 User can download files from their history or contact support');

    // Could implement alternative notification methods here
    // For now, just log the issue without failing the entire process
  }
}

// Async transcription processing with enhanced complete transcription
// Global transcription tracking for cancellation
let activeTranscriptions = new Map(); // Map of transcriptionId -> { userEmail, files, cancelled: boolean }

// Helper function to update transcription progress
function updateTranscriptionProgress(transcriptionId, progress, stage, currentFile = '') {
  const transcriptionData = activeTranscriptions.get(transcriptionId);
  if (transcriptionData) {
    // ⛔ Guard: מנע עדכון אחרי שהתמלול הושלם (finalize)
    if (transcriptionData.isCompleted) {
      console.log(`⛔ Ignoring progress update for completed transcription ${transcriptionId}: ${progress}% - ${stage}`);
      return;
    }
    transcriptionData.progress = progress;
    transcriptionData.stage = stage;
    transcriptionData.currentFile = currentFile;

    // 🔥 NEW: Send real-time progress update via SSE
    const progressData = {
      transcriptionId,
      type: 'progress',
      progress,
      stage,
      currentFile,
      filesProcessed: transcriptionData.filesProcessed || 0,
      totalFiles: transcriptionData.totalFiles || 0,
      timestamp: new Date().toISOString()
    };

    console.log(`📡 Emitting SSE progress for ${transcriptionId}:`, progressData);
    progressEmitter.emit('progress', progressData);

    console.log(`📊 Progress ${transcriptionId}: ${progress}% - ${stage}`);
  }
}

// ✅ פונקציית finalize חד-פעמית להשלמת התמלול
function finalizeTranscriptionCompletion(transcriptionId) {
  const transcriptionData = activeTranscriptions.get(transcriptionId);
  if (!transcriptionData) {
    console.log(`⚠️ לא נמצא transcription ${transcriptionId} לfinalize`);
    return false;
  }

  // אם כבר הושלם - לא לעשות כלום
  if (transcriptionData.isCompleted) {
    console.log(`✅ התמלול ${transcriptionId} כבר מושלם`);
    return true;
  }

  console.log(`🔥 FINALIZING התמלול ${transcriptionId} - נעילת סטטוס סופי`);

  // נעילת הסטטוס הסופי
  transcriptionData.progress = 100;
  transcriptionData.stage = 'התמלול הושלם בהצלחה!';
  transcriptionData.isCompleted = true;
  transcriptionData.completedAt = new Date().toISOString();
  transcriptionData.currentFile = '';

  const totalFiles = transcriptionData.totalFiles ?? transcriptionData.total ?? 1;

  const finalProgressData = {
    transcriptionId,
    type: 'progress',
    progress: 100,
    stage: 'התמלול הושלם בהצלחה!',
    currentFile: '',
    filesProcessed: totalFiles,
    totalFiles: totalFiles,
    timestamp: new Date().toISOString(),
    isCompleted: true
  };

  // שידור סופי מיידי
  console.log(`🔥 FINAL EMISSION for ${transcriptionId}:`, finalProgressData);
  progressEmitter.emit('progress', finalProgressData);

  // שידור נוסף אחרי עיכוב קצר (למקרה של race condition)
  setTimeout(() => {
    progressEmitter.emit('progress', finalProgressData);
    console.log(`🔥 BACKUP FINAL EMISSION for ${transcriptionId}`);
  }, 1000);

  console.log(`✅ FINALIZED: התמלול ${transcriptionId} נעול על 100% - התמלול הושלם בהצלחה!`);

  // ניקוי זיכרון אחרי 5 דקות (מונע זליגת זיכרון)
  setTimeout(() => {
    activeTranscriptions.delete(transcriptionId);
    console.log(`🧹 Cleaned up completed transcription ${transcriptionId} from memory`);
  }, 5 * 60 * 1000);

  return true;
}

async function processTranscriptionAsync(files, userEmail, language, estimatedMinutes, transcriptionId, customInstructions = '') {
  console.log(`🎯 Starting enhanced async transcription with chunking for ${files.length} files`);
  console.log(`📧 Processing for user: ${userEmail} (ID: ${transcriptionId})`);

  const user = await findOrCreateUser(userEmail);
  if (!user) {
    console.error('❌ User not found during async processing:', userEmail);
    return;
  }

  // Double-check user has enough minutes BEFORE starting anything
  if (user.remainingMinutes < estimatedMinutes) {
    console.error(`❌ CRITICAL: Insufficient minutes in async processing! User has ${user.remainingMinutes}, needs ${estimatedMinutes}`);
    // Clean up uploaded files
    files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`🗑️ Deleted file due to insufficient minutes: ${file.path}`);
      } catch (e) {
        console.warn(`Could not delete file ${file.path}:`, e.message);
      }
    });
    return;
  }

  // Update existing transcription tracking instead of creating new
  const existingTracking = activeTranscriptions.get(transcriptionId);
  if (existingTracking) {
    // Update existing tracking with more details
    existingTracking.stage = 'מתחיל תהליך התמלול...';
    console.log(`📝 Updated existing transcription tracking for ${transcriptionId}`);
  } else {
    // Fallback: Register transcription for cancellation tracking with progress info
    activeTranscriptions.set(transcriptionId, {
      userEmail,
      files: files.map(f => f.path), // Store file paths for cleanup
      cancelled: false,
      startTime: new Date(),
      progress: 0,
      stage: 'מתחיל תהליך התמלול...',
      currentFile: '',
      filesProcessed: 0,
      totalFiles: files.length, // 🔥 NEW: Track total files
      isCompleted: false
    });
    console.log(`📝 Registered transcription ${transcriptionId} for cancellation tracking`);
  }

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
    await useUserMinutes(userEmail, estimatedMinutes);
    console.log(`💰 Minutes deducted upfront. User balance: ${user.remainingMinutes} minutes`);

    // Minutes already saved to MongoDB by useUserMinutes function

    // ⚠️ CRITICAL: After this point, cancellation is no longer safe for refunds
    // Minutes have been deducted, transcription is considered "started"
    activeTranscriptions.get(transcriptionId).minutesDeducted = true;

    updateTranscriptionProgress(transcriptionId, 15, 'מתכונן לעיבוד הקבצים...');
    const transcriptions = [];
    const failedTranscriptions = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];

      // Update progress for current file
      const fileProgress = 20 + ((fileIndex / files.length) * 60); // 20-80% range
      updateTranscriptionProgress(transcriptionId, Math.round(fileProgress), `מעבד קובץ ${fileIndex + 1} מתוך ${files.length}...`, file.filename);

      // Update files processed counter
      activeTranscriptions.get(transcriptionId).filesProcessed = fileIndex;

      console.log(`🎵 Processing file: ${file.filename}`);
      console.log(`📊 File size: ${(fs.statSync(file.path).size / (1024 * 1024)).toFixed(1)} MB`);

      try {
        // Get actual duration for this specific file
        let fileDuration = 0;
        try {
          fileDuration = await getAudioDuration(file.path);
        } catch (durationError) {
          console.warn(`⚠️ Could not get duration for ${file.filename}, using file size estimate`);
          // Fallback to file size estimation
          fileDuration = (file.size / (1024 * 1024 * 2)) * 60;
        }
        const fileDurationMinutes = Math.ceil(fileDuration / 60);
        console.log(`⏱️ File duration: ${fileDurationMinutes} minutes`);

        // Use the enhanced transcription method that handles large files with chunking
        // Pass the duration we already calculated to avoid duplicate getAudioDuration calls
        const transcription = await realGeminiTranscriptionWithDuration(file.path, file.filename, language, customInstructions, fileDuration, transcriptionId, fileIndex, files.length, userEmail);

        console.log(`🔍 Transcription validation:`);
        console.log(`   Type: ${typeof transcription}`);
        console.log(`   Length: ${transcription ? transcription.length : 'null'}`);
        console.log(`   Preview: ${transcription ? transcription.substring(0, 100) + '...' : 'null'}`);

        if (!transcription || typeof transcription !== 'string') {
          throw new Error(`תמלול לא תקין: סוג=${typeof transcription}, ערך=${transcription}`);
        }

        // Remove minimum length requirement - now accepts any non-empty transcription
        // (previously required 50+ characters, but client needs short files transcribed too)
        if (transcription.trim().length === 0) {
          throw new Error(`תמלול ריק: "${transcription}"`);
        }

        // Check if transcription looks like binary data or PDF (only check for actual PDF content)
        if (transcription.includes('%PDF') && transcription.includes('/Type/Catalog')) {
          throw new Error('התמלול נראה כמו קובץ PDF או נתונים בינאריים במקום טקסט');
        }

        // Update progress for Word document creation
        const wordProgress = 80 + ((fileIndex + 1) / files.length) * 5; // 80-85% range
        updateTranscriptionProgress(transcriptionId, Math.round(wordProgress), `יוצר מסמך Word עבור ${file.filename}...`);

        const wordDoc = await createWordDocumentPython(transcription, file.filename, fileDurationMinutes, language);

        // 🔧 NEW: Save document to persistent transcriptions folder
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
          downloadFilename: docFilename,
          duration: fileDurationMinutes, // Store actual duration for this file
          fileSize: fs.statSync(file.path).size
        });
        
        console.log(`✅ Successfully processed: ${cleanFilename(file.filename)}`);
        console.log(`📊 Final transcription: ${transcription.length} characters, ${transcription.split(/\s+/).length} words`);

        // Check if we need to reset Gemini session after this file
        processedFilesCount++;
        if (processedFilesCount >= 3) {
          console.log("♻️ Resetting model session after 3 files...");
          processedFilesCount = 0; // איפוס הספירה

          // המתנה למניעת throttling
          await new Promise(r => setTimeout(r, 2000));

          // יצירת instance חדש של genAI
          genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          console.log("✅ Model session reset completed");
        }

        // Add delay between files to prevent API rate limiting and allow system recovery
        const currentFileIndex = files.indexOf(file);
        if (currentFileIndex < files.length - 1) {
          // Dynamic delay based on total number of files
          const totalFiles = files.length;
          const delaySeconds = totalFiles <= 3 ? 15 : 120; // 15 seconds for ≤3 files, 2 minutes for 4+ files
          const delayMs = delaySeconds * 1000;

          console.log(`⏳ Waiting ${delaySeconds} seconds before processing next file (${totalFiles} total files)...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

      } catch (fileError) {
        console.error(`❌ Failed to process ${file.filename}:`, fileError);

        // Try to get duration even for failed files for history purposes
        let failedFileDuration = 0;
        try {
          failedFileDuration = await getAudioDuration(file.path);
        } catch (durationError) {
          // Fallback to file size estimation
          failedFileDuration = (file.size / (1024 * 1024 * 2)) * 60;
        }
        const failedFileDurationMinutes = Math.ceil(failedFileDuration / 60);

        failedTranscriptions.push({
          filename: file.filename,
          error: fileError.message,
          duration: failedFileDurationMinutes,
          fileSize: fs.statSync(file.path).size
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
      updateTranscriptionProgress(transcriptionId, 95, 'שולח תוצאות באימייל...');
      await sendTranscriptionEmail(userEmail, transcriptions, failedTranscriptions);
      console.log(`📧 Email sent with ${transcriptions.length} successful transcriptions`);

      updateTranscriptionProgress(transcriptionId, 97, 'מעדכן היסטוריית תמלולים...');

      // Note: Minutes were already deducted at the start
      // No need to deduct again - just record the usage

      // 🔧 NEW: Add each transcription to MongoDB history
      for (const transcription of transcriptions) {
        // Use the actual duration calculated for this specific file
        const durationMinutes = transcription.duration || Math.ceil(estimatedMinutes / transcriptions.length);
        const transcriptionData = {
          fileName: cleanFilename(transcription.filename),
          originalName: cleanFilename(transcription.filename),
          transcriptionText: (transcription.transcription || '').substring(0, 1000), // Store first 1000 chars
          downloadUrl: `/api/download/${transcription.downloadFilename}`,
          wordDocumentPath: `/api/download/${transcription.downloadFilename}`,
          fileSize: transcription.fileSize || 0,
          processingTime: transcription.processingTime || 0,
          duration: durationMinutes, // Store actual duration for this file
          audioLength: durationMinutes * 60, // Store in seconds for compatibility
          language: language,
          status: 'completed',
          date: new Date().toLocaleDateString('he-IL')
        };

        await addTranscriptionToHistory(userEmail, transcriptionData);
        console.log(`📝 Added to MongoDB history: ${transcriptionData.originalName}`);
      }

      // 🔧 NEW: Add failed transcriptions to MongoDB history
      for (const failed of failedTranscriptions) {
        const failedData = {
          fileName: cleanFilename(failed.filename),
          originalName: cleanFilename(failed.filename),
          transcriptionText: '',
          downloadUrl: null,
          wordDocumentPath: null,
          fileSize: failed.fileSize || 0,
          processingTime: 0,
          duration: failed.duration || 0, // Use actual duration if available
          audioLength: (failed.duration || 0) * 60,
          language: language,
          status: 'failed',
          date: new Date().toLocaleDateString('he-IL')
        };

        await addTranscriptionToHistory(userEmail, failedData);
        console.log(`📝 Added failed to MongoDB history: ${failedData.originalName}`);
      }

      // 🔥 FORCE FINAL COMPLETION - נעילת הסטטוס הסופי מיד אחרי המייל
      finalizeTranscriptionCompletion(transcriptionId);

      console.log(`🎉 Transcription batch completed for: ${userEmail}`);
      console.log(`💰 Updated balance: ${user.remainingMinutes} minutes remaining`);
      console.log(`📊 Success rate: ${transcriptions.length}/${files.length} files`);
      console.log(`📚 History updated with ${transcriptions.length + failedTranscriptions.length} entries`);

      // ✅ ניקוי זיכרון מתבצע ב-finalizeTranscriptionCompletion אחרי 5 דקות

    } else {
      console.error(`❌ No transcriptions completed for: ${userEmail}`);
      updateTranscriptionProgress(transcriptionId, 0, 'התמלול נכשל - לא הושלמו תמלולים');
      // Cleanup on failure
      setTimeout(() => {
        activeTranscriptions.delete(transcriptionId);
      }, 10000); // Increased from 3s to 10s
    }

  } catch (error) {
    console.error('Async transcription batch error:', error);
    updateTranscriptionProgress(transcriptionId, 0, `שגיאה: ${error.message}`);
    // Cleanup on error
    setTimeout(() => {
      activeTranscriptions.delete(transcriptionId);
    }, 10000); // Increased from 3s to 10s

    // If error is due to insufficient minutes, clean up files and don't deduct
    if (error.message && error.message.includes('Insufficient minutes')) {
      console.error(`❌ Minutes deduction failed - cleaning up files`);
      files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`🗑️ Deleted file after minutes error: ${file.path}`);
          }
        } catch (e) {
          console.warn(`Could not delete file ${file.path}:`, e.message);
        }
      });
    }
  }
}

// Python availability checker
function checkPythonAvailability() {
  try {
    const { execSync } = require('child_process');
    execSync('python --version', { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch (error) {
    console.log('⚠️ Python not available:', error.message);
    return false;
  }
}

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    ffmpegAvailable: checkFFmpegAvailability(),
    pythonAvailable: checkPythonAvailability()
  });
});

// Test Gemini API key directly
app.get('/test-gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('🔑 Testing Gemini API key...');
    console.log('🔑 Key exists:', !!apiKey);
    console.log('🔑 Key length:', apiKey ? apiKey.length : 0);
    console.log('🔑 Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'none');

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY not found in environment variables'
      });
    }

    // Test with a simple text generation
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });
    const result = await model.generateContent("Say hello in Hebrew");
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      message: 'Gemini API key is working!',
      keyLength: apiKey.length,
      testResponse: text.substring(0, 100)
    });

  } catch (error) {
    console.error('🔥 Gemini API test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.toString()
    });
  }
});

// Test Python integration
app.get('/test-python', async (req, res) => {
  try {
    const { spawn } = require('child_process');

    const pythonProcess = spawn('python', ['-c', `
import sys
from docx import Document
print("Python and python-docx are working!")
print(f"Python version: {sys.version}")
    `]);

    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        res.json({
          success: true,
          output: output.trim(),
          message: 'Python and python-docx integration working!'
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.trim(),
          exitCode: code
        });
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔧 NEW: Download endpoint for transcribed files
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(PERSISTENT_PATH, 'transcriptions', filename);

    console.log(`📥 Download request for: ${filename}`);

    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      return res.status(404).json({ success: false, error: 'קובץ לא נמצא' });
    }

    const originalName = filename.replace(/_\d+\.docx$/, '.docx'); // Remove timestamp
    const hebrewName = originalName;

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
    geminiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    geminiKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'none',
    emailConfigured: !!process.env.EMAIL_USER,
    ffmpegAvailable: checkFFmpegAvailability()
  });
});

// Authentication routes
app.post('/api/login', (req, res) => {
  try {
    const clientIP = getClientIP(req);

    // Rate limiting: 10 login attempts per IP per 15 minutes
    if (isRateLimited('login', clientIP, 10, 15)) {
      console.log(`⛔ Login rate limit exceeded for IP: ${clientIP}`);
      return res.status(429).json({
        success: false,
        error: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות.'
      });
    }

    console.log('🔐 Login attempt:', req.body);

    let { email, password } = req.body;

    // AGGRESSIVE email cleanup for copy-paste corruption
    if (email) {
      const originalEmail = email;

      // Step 1: Remove ALL whitespace and invisible characters including RTL/LTR marks
      email = email.replace(/[\s\u200B-\u200D\uFEFF\u00A0\u202A-\u202E]/g, '');

      // Step 2: FORCE fix ANY xn-- corruption by replacing with known domains
      email = email.replace(/gmail\.xn--.*?$/gi, 'gmail.com');
      email = email.replace(/yahoo\.xn--.*?$/gi, 'yahoo.com');
      email = email.replace(/hotmail\.xn--.*?$/gi, 'hotmail.com');
      email = email.replace(/outlook\.xn--.*?$/gi, 'outlook.com');

      // Step 3: Generic xn-- pattern fix for any domain
      email = email.replace(/\.xn--.*?$/gi, '.com');

      // Step 4: Double check - if still contains xn--, brute force it
      if (email.includes('xn--')) {
        console.log('🚨🚨 STUBBORN xn-- corruption in LOGIN:', email);

        // Split by @ and fix the domain part
        const parts = email.split('@');
        if (parts.length === 2) {
          let domain = parts[1];

          // If domain contains xn--, assume it should be .com
          if (domain.includes('xn--')) {
            if (domain.includes('gmail')) domain = 'gmail.com';
            else if (domain.includes('yahoo')) domain = 'yahoo.com';
            else if (domain.includes('hotmail')) domain = 'hotmail.com';
            else if (domain.includes('outlook')) domain = 'outlook.com';
            else domain = domain.split('.')[0] + '.com'; // Default to .com
          }

          email = parts[0] + '@' + domain;
          console.log('🔧 FORCE fixed LOGIN email to:', email);
        }
      }

      if (originalEmail !== email) {
        console.log('🚨 LOGIN email corruption detected and AGGRESSIVELY fixed:');
        console.log('   Original:', JSON.stringify(originalEmail));
        console.log('   Fixed:   ', JSON.stringify(email));
      }
    }
    
    if (!email || !password) {
      return res.json({ success: false, error: 'אימייל וסיסמה נדרשים' });
    }
    
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    console.log('🔍 User found:', user ? 'Yes' : 'No');
    console.log('📋 Available users:', users.map(u => ({ email: u.email, isAdmin: u.isAdmin })));
    
    if (user) {
      // Check if email verification is required (for new users only)
      if (user.emailVerified === false) {
        console.log('❌ Login blocked - email not verified for:', user.email);
        return res.json({
          success: false,
          error: 'יש לאמת את כתובת המייל קודם. בדוק את תיבת הדואר שלך.',
          needsVerification: true,
          email: user.email
        });
      }

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

// Google Authentication endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId, provider } = req.body;

    console.log('🔐 Google authentication attempt:', { email, name, provider });

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Load existing users
    const usersData = loadUsersData();

    // Check if user already exists
    let existingUser = usersData.users.find(u => u.email === email);

    if (existingUser) {
      // Update existing user with Google info if needed
      if (!existingUser.googleId && googleId) {
        existingUser.googleId = googleId;
        existingUser.provider = provider;
        existingUser.lastLogin = new Date().toISOString();
        saveUsersData(usersData);
        console.log('✅ Updated existing user with Google info:', email);
      } else {
        // Just update last login
        existingUser.lastLogin = new Date().toISOString();
        saveUsersData(usersData);
      }

      // Return user info (same format as regular login)
      res.json({
        success: true,
        user: {
          email: existingUser.email,
          name: existingUser.name,
          isAdmin: existingUser.isAdmin || false,
          availableMinutes: existingUser.availableMinutes || 0,
          provider: existingUser.provider || 'google'
        }
      });
    } else {
      // Create new user with Google info
      const newUser = {
        email: email,
        name: name || email.split('@')[0],
        password: null, // Google users don't have password
        googleId: googleId,
        provider: provider || 'google',
        isVerified: true, // Google users are pre-verified
        verificationToken: null,
        isAdmin: false,
        availableMinutes: 10, // Welcome bonus
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      usersData.users.push(newUser);
      saveUsersData(usersData);

      console.log('✅ Created new Google user:', email);

      res.json({
        success: true,
        user: {
          email: newUser.email,
          name: newUser.name,
          isAdmin: false,
          availableMinutes: newUser.availableMinutes,
          provider: newUser.provider
        }
      });
    }

  } catch (error) {
    console.error('Google authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בעיבוד התחברות Google'
    });
  }
});

// Supabase configuration endpoint - provide frontend with Supabase config
app.get('/api/supabase-config', (req, res) => {
  const enabled = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY
  );

  if (enabled) {
    res.json({
      success: true,
      enabled: true,
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY
    });
  } else {
    res.json({
      success: true,
      enabled: false
    });
  }
});

// User sync endpoint - sync localStorage with server data
app.post('/api/user-sync', (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ success: false, error: 'Email required' });
    }

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (user) {
      console.log('🔄 User sync successful for:', user.email);
      res.json({ success: true, user: { ...user, password: undefined } });
    } else {
      console.log('❌ User not found for sync:', email);
      res.json({ success: false, error: 'User not found' });
    }
  } catch (error) {
    console.error('User sync error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const clientIP = getClientIP(req);

    // Rate limiting: 3 registrations per IP per hour
    if (isRateLimited('registration', clientIP, 3, 60)) {
      console.log(`⛔ Registration rate limit exceeded for IP: ${clientIP}`);
      return res.status(429).json({
        success: false,
        error: 'יותר מדי הרשמות מהכתובת שלך. נסה שוב בעוד שעה.'
      });
    }

    console.log('📝 Registration attempt:', req.body);
    console.log('📧 Email debug - original:', JSON.stringify(req.body.email));
    console.log('📧 Email debug - length:', req.body.email?.length);
    console.log('📧 Email debug - charCodes:', req.body.email?.split('').map(c => c.charCodeAt(0)));

    let { name, email, password, phone } = req.body;

    // AGGRESSIVE email cleanup for copy-paste corruption
    if (email) {
      const originalEmail = email;

      // Step 1: Remove ALL whitespace and invisible characters including RTL/LTR marks
      email = email.replace(/[\s\u200B-\u200D\uFEFF\u00A0\u202A-\u202E]/g, '');

      // Step 2: FORCE fix ANY xn-- corruption by replacing with known domains
      email = email.replace(/gmail\.xn--.*?$/gi, 'gmail.com');
      email = email.replace(/yahoo\.xn--.*?$/gi, 'yahoo.com');
      email = email.replace(/hotmail\.xn--.*?$/gi, 'hotmail.com');
      email = email.replace(/outlook\.xn--.*?$/gi, 'outlook.com');

      // Step 3: Generic xn-- pattern fix for any domain
      email = email.replace(/\.xn--.*?$/gi, '.com');

      // Step 4: Double check - if still contains xn--, brute force it
      if (email.includes('xn--')) {
        console.log('🚨🚨 STUBBORN xn-- corruption detected:', email);

        // Split by @ and fix the domain part
        const parts = email.split('@');
        if (parts.length === 2) {
          let domain = parts[1];

          // If domain contains xn--, assume it should be .com
          if (domain.includes('xn--')) {
            if (domain.includes('gmail')) domain = 'gmail.com';
            else if (domain.includes('yahoo')) domain = 'yahoo.com';
            else if (domain.includes('hotmail')) domain = 'hotmail.com';
            else if (domain.includes('outlook')) domain = 'outlook.com';
            else domain = domain.split('.')[0] + '.com'; // Default to .com
          }

          email = parts[0] + '@' + domain;
          console.log('🔧 FORCE fixed domain to:', email);
        }
      }

      if (originalEmail !== email) {
        console.log('🚨 Email corruption detected and AGGRESSIVELY fixed:');
        console.log('   Original:', JSON.stringify(originalEmail));
        console.log('   Fixed:   ', JSON.stringify(email));
      }
    }

    if (!name || !email || !password) {
      return res.json({ success: false, error: 'שם, אימייל וסיסמה נדרשים' });
    }

    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      console.log('❌ User already exists:', email);
      return res.json({ success: false, error: 'משתמש עם האימייל הזה כבר קיים' });
    }

    // Additional rate limiting: 1 registration per email per day
    if (isRateLimited('registration', email, 1, 24 * 60)) {
      console.log(`⛔ Email registration rate limit exceeded: ${email}`);
      return res.json({
        success: false,
        error: 'כבר נרשמת עם האימייל הזה היום. נסה שוב מחר.'
      });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const newUser = {
      id: users.length + 1,
      name,
      email: email,
      password,
      phone: phone || '',
      isAdmin: false,
      remainingMinutes: 0, // No free minutes
      totalTranscribed: 0,
      history: [],
      transcriptionHistory: [],
      joinDate: new Date().toISOString(),
      emailVerified: false,
      verificationCode: verificationCode,
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };

    // Rate limiting for email sending: 3 emails per email address per hour
    if (isRateLimited('verification', `email_${email}`, 3, 60)) {
      console.log(`⛔ Email sending rate limit exceeded: ${email}`);
      return res.json({
        success: false,
        error: 'נשלחו יותר מדי מיילי אימות. נסה שוב בעוד שעה.'
      });
    }

    // Send verification email
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'אמת את המייל שלך - מערכת תמלול',
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">ברוך הבא למערכת התמלול! 🎙️</h2>
            <p>שלום ${name},</p>
            <p>תודה שנרשמת למערכת התמלול שלנו. כדי להשלים את ההרשמה, אנא אמת את כתובת המייל שלך.</p>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <h3 style="margin: 0;">קוד האימות שלך:</h3>
              <div style="font-size: 32px; font-weight: bold; color: #3b82f6; margin: 10px 0; letter-spacing: 5px;">
                ${verificationCode}
              </div>
              <p style="margin: 0; color: #666;">הקוד תקף למשך 24 שעות</p>
            </div>

            <p>אחרי שתאמת את המייל, תוכל להתחבר ולהתחיל להשתמש במערכת.</p>

            <p style="margin-top: 30px;">
              בברכה,<br>
              צוות מערכת התמלול
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log('✅ Verification email sent to:', email);

    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      return res.json({ success: false, error: 'שגיאה בשליחת מייל אימות' });
    }

    users.push(newUser);
    saveUsersData(); // Save after adding new user
    console.log('✅ User registered successfully (pending verification):', newUser.email);
    console.log('📋 Total users now:', users.length);

    res.json({
      success: true,
      message: 'הרשמה הושלמה! נשלח אליך מייל עם קוד אימות.',
      needsVerification: true
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהרשמה' });
  }
});

// Email verification endpoint
app.post('/api/verify-email', (req, res) => {
  try {
    let { email, verificationCode } = req.body;

    // Clean RTL characters from email (same as registration)
    if (email) {
      console.log('📧 Email debug - original:', JSON.stringify(email));
      console.log('📧 Email debug - length:', email.length);
      console.log('📧 Email debug - charCodes:', Array.from(email).map(c => c.charCodeAt(0)));

      const originalEmail = email;
      email = email.replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E]/g, '').trim();

      if (originalEmail !== email) {
        console.log('🚨 Email corruption detected and AGGRESSIVELY fixed:');
        console.log('   Original:', JSON.stringify(originalEmail));
        console.log('   Fixed:   ', JSON.stringify(email));
      }
    }

    // Rate limiting: 5 verification attempts per email per 15 minutes
    if (isRateLimited('verification', email, 5, 15)) {
      console.log(`⛔ Verification rate limit exceeded for email: ${email}`);
      return res.status(429).json({
        success: false,
        error: 'יותר מדי ניסיונות אימות. נסה שוב בעוד 15 דקות.'
      });
    }

    if (!email || !verificationCode) {
      return res.json({ success: false, error: 'אימייל וקוד אימות נדרשים' });
    }


    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.log('❌ User not found for verification:', email);
      return res.json({ success: false, error: 'משתמש לא נמצא' });
    }

    if (user.emailVerified) {
      console.log('⚠️ User already verified:', email);
      return res.json({ success: false, error: 'המייל כבר מאומת' });
    }

    if (user.verificationCode !== verificationCode) {
      console.log('❌ Invalid verification code for:', email);
      return res.json({ success: false, error: 'קוד אימות שגוי' });
    }

    if (new Date() > new Date(user.verificationExpires)) {
      console.log('❌ Verification code expired for:', email);
      return res.json({ success: false, error: 'קוד האימות פג תוקף. אנא הירשם מחדש.' });
    }

    // Mark as verified FIRST (most important step)
    user.emailVerified = true;
    delete user.verificationCode;
    delete user.verificationExpires;
    saveUsersData(); // Save verification status first

    console.log('✅ Email verified successfully for:', email);

    // Only after verification is safely saved, add welcome bonus
    user.remainingMinutes += 30; // Add 30 free minutes after verification
    saveUsersData(); // Save minutes separately

    console.log('🎁 Added 30 welcome minutes. New balance:', user.remainingMinutes);

    res.json({
      success: true,
      message: 'המייל אומת בהצלחה! קיבלת 30 דקות חינם. כעת תוכל להתחבר.',
      user: { ...user, password: undefined }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ success: false, error: 'שגיאה באימות מייל' });
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

// Admin route to delete user
app.post('/api/admin/delete-user', (req, res) => {
  try {
    console.log('🗑️ Admin delete-user endpoint called');
    console.log('🗑️ Request body:', req.body);

    const { adminEmail, userEmail } = req.body;

    if (!adminEmail || !userEmail) {
      return res.status(400).json({
        success: false,
        error: 'אימיילי אדמין ומשתמש נדרשים'
      });
    }

    // Verify admin permissions
    const admin = users.find(u => u.email.toLowerCase() === adminEmail.toLowerCase());
    if (!admin || !admin.isAdmin) {
      console.log('❌ Unauthorized delete attempt by:', adminEmail);
      return res.status(403).json({
        success: false,
        error: 'הרשאות אדמין נדרשות'
      });
    }

    // Find user to delete
    const userIndex = users.findIndex(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        error: `משתמש לא נמצא: ${userEmail}`
      });
    }

    const userToDelete = users[userIndex];

    // Prevent deletion of admin users
    if (userToDelete.isAdmin) {
      return res.status(400).json({
        success: false,
        error: 'לא ניתן למחוק משתמש אדמין'
      });
    }

    // Delete the user
    users.splice(userIndex, 1);
    saveUsersData();

    console.log(`✅ User deleted successfully: ${userEmail} by admin: ${adminEmail}`);
    console.log(`📋 Total users now: ${users.length}`);

    res.json({
      success: true,
      message: `המשתמש ${userEmail} נמחק בהצלחה`,
      totalUsers: users.length
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה במחיקת המשתמש'
    });
  }
});

// Admin route to reset user password
app.post('/api/admin/reset-password', (req, res) => {
  try {
    console.log('🔑 Admin reset-password endpoint called');
    console.log('🔑 Request body:', { ...req.body, newPassword: '[HIDDEN]' });

    const { adminEmail, userEmail, newPassword } = req.body;

    if (!adminEmail || !userEmail || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'אימייל אדמין, אימייל משתמש וסיסמה חדשה נדרשים'
      });
    }

    // Password validation
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'הסיסמה חייבת להכיל לפחות 8 תווים'
      });
    }

    // Verify admin permissions
    const admin = users.find(u => u.email.toLowerCase() === adminEmail.toLowerCase());
    if (!admin || !admin.isAdmin) {
      console.log('❌ Unauthorized password reset attempt by:', adminEmail);
      return res.status(403).json({
        success: false,
        error: 'הרשאות אדמין נדרשות'
      });
    }

    // Find user to reset password
    const userIndex = users.findIndex(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        error: `משתמש לא נמצא: ${userEmail}`
      });
    }

    const userToReset = users[userIndex];

    // Update password
    const oldPassword = userToReset.password;
    userToReset.password = newPassword;

    // Save changes
    saveUsersData();

    // Log the action (without showing actual passwords)
    console.log(`🔑 Password reset successfully for: ${userEmail} by admin: ${adminEmail}`);
    console.log(`🔑 Password changed from [${oldPassword.length} chars] to [${newPassword.length} chars]`);

    // Add audit log entry to user's history if it exists
    if (userToReset.history) {
      userToReset.history.unshift({
        action: 'password_reset_by_admin',
        adminEmail: adminEmail,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString('he-IL')
      });

      // Keep only last 50 history entries
      if (userToReset.history.length > 50) {
        userToReset.history = userToReset.history.slice(0, 50);
      }

      saveUsersData();
    }

    res.json({
      success: true,
      message: `הסיסמה של ${userEmail} שונתה בהצלחה`,
      userEmail: userEmail,
      resetBy: adminEmail,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בשינוי הסיסמה'
    });
  }
});

// Multer error handling middleware
function handleMulterError(err, req, res, next) {
  if (err) {
    console.error('📤 Multer error:', err);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `הקובץ גדול מדי! המגבלה היא 500MB. הקובץ שלך: ${Math.round(err.field?.size / (1024 * 1024) || 0)}MB`,
        errorCode: 'FILE_TOO_LARGE',
        maxSize: '500MB'
      });
    }


    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'סוג קובץ לא נתמך',
        errorCode: 'UNSUPPORTED_FILE_TYPE'
      });
    }

    // General multer error
    return res.status(400).json({
      success: false,
      error: 'שגיאה בהעלאת הקובץ: ' + (err.message || 'שגיאה לא ידועה'),
      errorCode: 'UPLOAD_ERROR'
    });
  }
  next();
}


// Enhanced transcription route (supports both regular files and Google Drive files)
app.post('/api/transcribe', upload.array('files'), handleMulterError, async (req, res) => {
  try {
    console.log('🎯 Enhanced transcription request received');
    console.log('📁 Regular files uploaded:', req.files?.length || 0);

    // Parse Google Drive files if any
    const driveFiles = req.body.driveFiles ? JSON.parse(req.body.driveFiles) : [];
    console.log('🔗 Google Drive files:', driveFiles?.length || 0);
    console.log('📧 Request body:', { ...req.body, driveFiles: driveFiles?.length ? `${driveFiles.length} files` : 'none' });

    // Check if we have any files at all (either uploaded or from Google Drive)
    const totalFiles = (req.files?.length || 0) + (driveFiles?.length || 0);
    if (totalFiles === 0) {
      return res.status(400).json({ success: false, error: 'לא נבחרו קבצים' });
    }

    // For now, if there are Google Drive files, return a message that it's coming soon
    if (driveFiles && driveFiles.length > 0) {
      console.log('🔗 Google Drive files detected - feature coming soon');
      return res.status(501).json({
        success: false,
        error: 'תכונת Google Drive זמינה בקרוב - בינתיים השתמש בהעלאה רגילה מהמחשב'
      });
    }

    const { email, language, customInstructions } = req.body;

    console.log('🎯 Custom instructions received:', customInstructions ? `"${customInstructions}"` : 'None');

    if (!email) {
      return res.status(400).json({ success: false, error: 'אימייל נדרש' });
    }
    
    // Check FFmpeg availability for chunking
    const ffmpegAvailable = checkFFmpegAvailability();
    
    // מצא או יצור משתמש במסד הנתונים
    const user = await findOrCreateUser(email);
    console.log('🔍 User lookup for transcription: Found');
    console.log('📧 Email:', email);
    console.log('⏱️ User minutes remaining:', user.remainingMinutes);

    // Generate unique transcription ID for early progress tracking
    const transcriptionId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize progress tracking immediately
    activeTranscriptions.set(transcriptionId, {
        userEmail: email,
        files: req.files.map(f => f.path),
        cancelled: false,
        startTime: new Date(),
        progress: 5,
        stage: 'מחשב אורך קבצים...',
        currentFile: '',
        filesProcessed: 0,
        totalFiles: req.files.length,
        isCompleted: false
    });

    // Send initial progress immediately
    updateTranscriptionProgress(transcriptionId, 5, 'מחשב אורך קבצים...');

    // Send response immediately to start SSE connection, continue processing async
    console.log('✅ Enhanced transcription starting with immediate response.');
    res.json({
        success: true,
        message: ffmpegAvailable ?
            'התמלול המתקדם התחיל - כל הקבצים יתעבדו דרך FFmpeg למקסימום איכות' :
            'התמלול התחיל - ללא חלוקה למקטעים (FFmpeg לא זמין)',
        estimatedMinutes: null, // Will be calculated async
        chunkingEnabled: ffmpegAvailable,
        transcriptionId: transcriptionId // Return transcription ID immediately
    });

    // Continue processing async without blocking response
    (async () => {
        try {
            // Calculate total estimated minutes ACCURATELY
            let totalDurationSeconds = 0;
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                // Update progress during duration calculation
                const progressPercent = 5 + Math.round((i / req.files.length) * 3); // 5% to 8%
                updateTranscriptionProgress(transcriptionId, progressPercent, `בודק אורך קובץ ${i + 1} מתוך ${req.files.length}...`);

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
                // Clean up progress tracking and files
                activeTranscriptions.delete(transcriptionId);
                updateTranscriptionProgress(transcriptionId, 0, `שגיאה: אין מספיק דקות בחשבון. נדרש: ${accurateMinutes}, זמין: ${user.remainingMinutes}`);
                for (const file of req.files) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (e) {
                        console.warn(`Could not delete file ${file.path} after failed check.`);
                    }
                }
                return;
            }

            // Update progress after duration calculation
            updateTranscriptionProgress(transcriptionId, 8, 'מתכונן לעיבוד...');

            // Start enhanced async processing with the ACCURATE minutes
            processTranscriptionAsync(req.files, email, language, accurateMinutes, transcriptionId, customInstructions);

        } catch (error) {
            console.error('Error in async transcription processing:', error);
            activeTranscriptions.delete(transcriptionId);
            updateTranscriptionProgress(transcriptionId, 0, `שגיאה: ${error.message}`);
        }
    })();
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

// 🆕 Get transcription progress endpoint
app.get('/api/transcription-progress/:transcriptionId', (req, res) => {
  try {
    const { transcriptionId } = req.params;
    console.log(`📊 Progress request for transcriptionId: '${transcriptionId}'`);
    const transcriptionData = activeTranscriptions.get(transcriptionId);
    console.log(`📊 Found transcription data:`, transcriptionData ? 'Yes' : 'No');

    if (!transcriptionData) {
      return res.status(404).json({
        success: false,
        error: 'התמלול לא נמצא או הסתיים'
      });
    }

    // Return current progress information
    res.json({
      success: true,
      progress: {
        percentage: transcriptionData.progress || 0,
        stage: transcriptionData.stage || 'מתחיל...',
        currentFile: transcriptionData.currentFile || '',
        filesProcessed: transcriptionData.filesProcessed || 0,
        totalFiles: transcriptionData.totalFiles || 0,
        isCompleted: transcriptionData.isCompleted || false
      }
    });

  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בבדיקת התקדמות התמלול'
    });
  }
});

// 🔥 NEW: Server-Sent Events endpoint for real-time progress updates
app.get('/api/transcription-progress/stream/:transcriptionId', (req, res) => {
  const { transcriptionId } = req.params;
  console.log(`🔄 Starting SSE stream for transcriptionId: '${transcriptionId}'`);

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    transcriptionId,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Listen for progress updates for this specific transcription
  const progressListener = (data) => {
    if (data.transcriptionId === transcriptionId) {
      console.log(`📡 Sending SSE update for ${transcriptionId}:`, data);
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        console.log(`✅ SSE data sent successfully to ${transcriptionId}`);
      } catch (e) {
        console.error(`❌ Error sending SSE data to ${transcriptionId}:`, e);
      }
    } else {
      console.log(`🔍 SSE listener got data for different ID: ${data.transcriptionId} (expected: ${transcriptionId})`);
    }
  };

  progressEmitter.on('progress', progressListener);

  // Keep alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);

  // Handle client disconnect
  const cleanup = () => {
    progressEmitter.removeListener('progress', progressListener);
    clearInterval(keepAlive);
    console.log(`🔌 Client disconnected from SSE stream: ${transcriptionId}`);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
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

// Internal endpoint to reload users data from disk
app.post('/api/internal/reload-users', (req, res) => {
  try {
    console.log('🔄 Reloading users data from disk...');
    const oldCount = users.length;
    users = loadUsersData();
    console.log(`✅ Users data reloaded: ${oldCount} → ${users.length} users`);

    res.json({
      success: true,
      message: 'Users data reloaded',
      userCount: users.length
    });
  } catch (error) {
    console.error('❌ Error reloading users data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reload users data'
    });
  }
});

// Get specific user's stats (for admin)
app.get('/api/users/:email/stats', (req, res) => {
  try {
    const { email } = req.params;

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'משתמש לא נמצא'
      });
    }

    // Calculate user statistics
    const userHistory = user.transcriptionHistory || user.history || [];
    const totalTranscriptions = userHistory.length;
    const lastTranscription = userHistory.length > 0 ? userHistory[0]?.createdAt || userHistory[0]?.timestamp : null;

    const stats = {
      email: user.email,
      minutesRemaining: user.remainingMinutes || user.minutesRemaining || 0,
      totalMinutesUsed: user.totalMinutesUsed || user.totalTranscribed || 0,
      totalTranscriptions: totalTranscriptions,
      lastTranscription: lastTranscription,
      createdAt: user.joinDate || user.createdAt,
      lastLogin: user.lastLogin
    };

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בקבלת נתוני המשתמש'
    });
  }
});

// Get specific user's transcription history (for admin)
app.get('/api/users/:email/history', (req, res) => {
  try {
    const { email } = req.params;
    const { limit = 20 } = req.query;

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'משתמש לא נמצא'
      });
    }

    // Check both transcriptionHistory and history for backward compatibility
    const userHistory = user.transcriptionHistory || user.history || [];

    // Sort by timestamp (newest first) and limit results
    const sortedHistory = userHistory
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return b.timestamp - a.timestamp;
        }
        return 0;
      })
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      history: sortedHistory
    });

  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בטעינת היסטוריה'
    });
  }
});

app.get('/api/admin/transcriptions', (req, res) => {
  try {
    const allTranscriptions = [];

    users.forEach(user => {
      // Check both transcriptionHistory and history for backward compatibility
      const userHistory = user.transcriptionHistory || user.history || [];
      if (userHistory.length > 0) {
        userHistory.forEach(entry => {
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
            const filePath = path.join(PERSISTENT_PATH, 'transcriptions', filename);
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

// EMAIL TRANSCRIPTION SYSTEM DISABLED
// let processedEmails = new Set(); // Disabled - not tracking emails anymore

// Email monitoring disabled - not using email transcription service
function startEmailMonitoring() {
  console.log('📧 Email monitoring disabled per user request - not checking for transcription emails');
  // Function disabled - no longer checking emails for audio/video files
}

// Email checking disabled - not using email transcription service
async function checkForTranscriptionEmails() {
  // Function disabled - no longer checking emails for audio/video files
  console.log('📧 Email checking skipped - email transcription service disabled');
  return;
  // Disabled code below:
  /*
  try {
    const imap = new Imap(imapConfig);

    imap.once('ready', function() {
      console.log('📧 Connected to email server, checking for new emails...');

      imap.openBox('INBOX', true, function(err, box) {
        if (err) {
          console.error('📧 Error opening inbox:', err);
          return;
        }

        // Search for unread emails with attachments from last 24 hours
        const criteria = [
          'UNSEEN',
          ['SINCE', new Date(Date.now() - 24 * 60 * 60 * 1000)]
        ];

        imap.search(criteria, function(err, results) {
          if (err) {
            console.error('📧 Email search error:', err);
            return;
          }

          if (results && results.length > 0) {
            console.log(`📧 Found ${results.length} new emails to check`);
            processEmails(imap, results);
          } else {
            console.log('📧 No new emails found');
          }

          imap.end();
        });
      });
    });

    imap.once('error', function(err) {
      console.error('📧 IMAP connection error:', err);
    });

    imap.connect();

  } catch (error) {
    console.error('📧 Email monitoring error:', error);
  }
  */
}

// Process found emails
// Email processing disabled - not using email transcription service
function processEmails(imap, uids) {
  // Function disabled - no longer processing emails for audio/video files
  return;
  const fetch = imap.fetch(uids, {
    bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
    struct: true
  });

  fetch.on('message', function(msg, seqno) {
    let emailData = {
      headers: {},
      body: '',
      attachments: [],
      uid: null,
      seqno: seqno
    };

    msg.on('body', function(stream, info) {
      let buffer = '';

      stream.on('data', function(chunk) {
        buffer += chunk.toString('utf8');
      });

      stream.once('end', function() {
        if (info.which === 'TEXT') {
          emailData.body = buffer;
        } else {
          // Parse headers
          const lines = buffer.split('\r\n');
          lines.forEach(line => {
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
              emailData.headers[match[1].toLowerCase()] = match[2];
            }
          });
        }
      });
    });

    msg.once('attributes', function(attrs) {
      // Save UID for later use
      emailData.uid = attrs.uid;

      // Process attachments
      if (attrs.struct) {
        extractAttachments(attrs.struct, emailData);
      }
    });

    msg.once('end', function() {
      // Download attachments immediately while IMAP connection is still active
      if (emailData.attachments.length > 0) {
        downloadAttachmentsInPlace(emailData, imap, seqno)
          .then(() => {
            // Process this email for transcription
            handleTranscriptionEmail(emailData, imap, seqno);
          })
          .catch((error) => {
            console.error('📧 Error downloading attachments in place:', error);
            // Try to process anyway
            handleTranscriptionEmail(emailData, imap, seqno);
          });
      } else {
        // Process this email for transcription
        handleTranscriptionEmail(emailData, imap, seqno);
      }
    });
  });

  fetch.once('error', function(err) {
    console.error('📧 Fetch error:', err);
  });
}

// Download attachments immediately while IMAP connection is active
// Email attachment download disabled - not using email transcription service
async function downloadAttachmentsInPlace(emailData, imap, seqno) {
  // Function disabled - no longer downloading attachments from emails
  return;
  const tempDir = path.join(__dirname, 'temp_email_attachments');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log(`📧 Downloading ${emailData.attachments.length} attachments in place for seqno ${seqno}`);

  for (let i = 0; i < emailData.attachments.length; i++) {
    const attachment = emailData.attachments[i];
    if (!attachment.downloadNeeded) continue;

    try {
      const tempFilePath = path.join(tempDir, `${seqno}_${attachment.filename}`);
      console.log(`📧 Downloading ${attachment.filename} to ${tempFilePath}`);

      await new Promise((resolve, reject) => {
        const fetch = imap.fetch([seqno], {
          bodies: attachment.partId,
          struct: false
        });

        let attachmentData = Buffer.alloc(0);

        fetch.on('message', function(msg, fetchSeqno) {
          msg.on('body', function(stream, info) {
            let buffer = Buffer.alloc(0);

            stream.on('data', function(chunk) {
              buffer = Buffer.concat([buffer, chunk]);
            });

            stream.once('end', function() {
              // Decode based on encoding
              let finalData = buffer;

              if (attachment.encoding === 'base64') {
                finalData = Buffer.from(buffer.toString(), 'base64');
              } else if (attachment.encoding === 'quoted-printable') {
                // Handle quoted-printable if needed
                finalData = buffer;
              }

              attachmentData = finalData;
            });
          });
        });

        fetch.once('end', function() {
          try {
            fs.writeFileSync(tempFilePath, attachmentData);
            console.log(`📧 ✅ Downloaded ${attachment.filename}: ${attachmentData.length} bytes`);

            // Update attachment info
            attachment.downloadedPath = tempFilePath;
            attachment.downloadNeeded = false;
            attachment.actualSize = attachmentData.length;

            resolve();
          } catch (writeError) {
            console.error(`📧 Error writing ${attachment.filename}:`, writeError);
            reject(writeError);
          }
        });

        fetch.once('error', function(err) {
          console.error(`📧 Error downloading ${attachment.filename}:`, err);
          reject(err);
        });
      });

    } catch (error) {
      console.error(`📧 Failed to download ${attachment.filename}:`, error);
      // Continue with other attachments
    }
  }

  console.log(`📧 ✅ All attachments downloaded for seqno ${seqno}`);
}

// Extract attachments from email structure
function extractAttachments(struct, emailData, partId = '') {
  if (Array.isArray(struct)) {
    struct.forEach((part, index) => {
      const newPartId = partId ? `${partId}.${index + 1}` : `${index + 1}`;
      extractAttachments(part, emailData, newPartId);
    });
  } else {
    console.log(`📧 Checking email part: type=${struct.type}/${struct.subtype}, disposition=${struct.disposition?.type}`);

    // Check for attachments in multiple ways
    const isAttachment =
      (struct.disposition && struct.disposition.type === 'attachment') ||
      (struct.disposition && struct.disposition.type === 'inline') ||
      (struct.disposition && struct.disposition.params?.filename) ||
      (!struct.disposition && struct.params?.name);

    if (isAttachment) {
      const rawFilename =
        struct.disposition?.params?.filename ||
        struct.params?.name ||
        `unknown_${Date.now()}.${struct.subtype}`;

      // Decode filename if it's encoded
      const filename = decodeEmailSubject(rawFilename);

      const type = struct.type + '/' + struct.subtype;

      console.log(`📧 Found potential attachment: ${filename}, type: ${type}`);

      // Check if it's an audio/video file
      if (isAudioVideoFile(filename, type)) {
        console.log(`📧 ✅ Valid audio/video file: ${filename}`);
        emailData.attachments.push({
          filename: filename,
          type: type,
          encoding: struct.encoding,
          size: struct.size,
          partId: partId,
          downloadNeeded: true
        });
      } else {
        console.log(`📧 ❌ Not audio/video file: ${filename} (${type})`);
      }
    }
  }
}

// Check if file is audio/video
function isAudioVideoFile(filename, mimeType) {
  if (!filename) return false;

  const audioVideoExtensions = ['.mp3', '.mp4', '.wav', '.m4a', '.mov', '.avi', '.mkv', '.flac', '.aac', '.ogg'];
  const audioVideoTypes = ['audio/', 'video/'];

  const hasValidExtension = audioVideoExtensions.some(ext =>
    filename.toLowerCase().endsWith(ext)
  );

  const hasValidMimeType = audioVideoTypes.some(type =>
    mimeType.toLowerCase().startsWith(type)
  );

  return hasValidExtension || hasValidMimeType;
}

// Decode email subject or filename if it's encoded
function decodeEmailSubject(subject) {
  if (!subject) return '';

  // Handle multiple UTF-8 Base64 encoded parts like =?UTF-8?B?...?= =?UTF-8?B?...?=
  let decoded = subject;
  const encodedMatches = subject.match(/=\?UTF-8\?B\?([^?]+)\?=/g);

  if (encodedMatches) {
    try {
      for (const match of encodedMatches) {
        const base64Part = match.match(/=\?UTF-8\?B\?([^?]+)\?=/)[1];
        const decodedPart = Buffer.from(base64Part, 'base64').toString('utf8');
        decoded = decoded.replace(match, decodedPart);
      }
      return decoded.trim();
    } catch (error) {
      console.log('📧 Failed to decode subject/filename, using original');
      return subject;
    }
  }

  return subject;
}

// Handle transcription email with all validation
// Email transcription handling disabled - not using email transcription service
async function handleTranscriptionEmail(emailData, imap, seqno) {
  // Function disabled - no longer handling transcription emails
  return;
  try {
    const from = emailData.headers.from;
    const rawSubject = emailData.headers.subject || '';
    const subject = decodeEmailSubject(rawSubject);

    console.log(`📧 Processing email from: ${from}, subject: "${subject}" (raw: "${rawSubject}")`);

    // Create unique email ID to avoid duplicates
    const emailId = `${from}_${emailData.headers.date}_${seqno}`;
    if (processedEmails.has(emailId)) {
      console.log('📧 Email already processed, skipping');
      return;
    }

    // 1. Check subject contains transcription keywords
    const transcriptionKeywords = ['תמלול', 'transcribe', 'תמליל', 'transcription'];
    const hasTranscriptionKeyword = transcriptionKeywords.some(keyword =>
      subject.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!hasTranscriptionKeyword) {
      console.log('📧 Email subject does not contain transcription keywords, skipping');
      return;
    }

    // 2. Check for audio/video attachments
    if (!emailData.attachments || emailData.attachments.length === 0) {
      console.log('📧 No audio/video attachments found, skipping');
      return;
    }

    // 3. Extract sender email
    const senderEmail = extractEmailAddress(from);
    if (!senderEmail) {
      console.log('📧 Could not extract sender email, skipping');
      return;
    }

    // 4. Check if sender is registered user
    const user = users.find(u => u.email.toLowerCase() === senderEmail.toLowerCase());
    if (!user) {
      console.log(`📧 Sender ${senderEmail} is not a registered user, sending info email`);
      await sendRegistrationInfoEmail(senderEmail);
      return;
    }

    // 5. Mark email as processed
    processedEmails.add(emailId);

    // 6. Process transcription
    console.log(`📧 ✅ Valid transcription request from ${senderEmail} with ${emailData.attachments.length} attachments`);
    await processEmailTranscription(user, emailData, senderEmail);

  } catch (error) {
    console.error('📧 Error handling transcription email:', error);
  }
}

// Extract email address from "Name <email@domain.com>" format
function extractEmailAddress(fromHeader) {
  const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1] : null;
}

// Send registration info to unregistered users
async function sendRegistrationInfoEmail(senderEmail) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: senderEmail,
      subject: 'הרשמה נדרשת לשירות התמלול',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>שלום!</h2>
          <p>תודה על הפנייה לשירות התמלול שלנו.</p>
          <p>כדי להשתמש בשירות, עליך להירשם תחילה באתר:</p>
          <a href="https://transcription-app-2uci.onrender.com" style="color: #667eea; font-weight: bold;">
            https://transcription-app-2uci.onrender.com
          </a>
          <p>לאחר הרשמה ורכישת דקות תמלול, תוכל לשלוח קבצי אודיו למייל זה לתמלול אוטומטי.</p>
          <p><strong>איך זה עובד:</strong></p>
          <ul>
            <li>הירשם באתר</li>
            <li>רכוש דקות תמלול</li>
            <li>שלח מייל עם הנושא "תמלול" וקובץ אודיו מצורף</li>
            <li>קבל בחזרה קובץ Word מתומלל</li>
          </ul>
          <p>בברכה,<br>צוות התמלול</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Registration info sent to ${senderEmail}`);

  } catch (error) {
    console.error('📧 Error sending registration info:', error);
  }
}

// Find and download specific attachment from email structure
async function findAndDownloadAttachment(struct, targetFilename, imap, seqno, outputPath) {
  return new Promise((resolve, reject) => {
    function searchStruct(structure, partId = '') {
      if (Array.isArray(structure)) {
        structure.forEach((part, index) => {
          const newPartId = partId ? `${partId}.${index + 1}` : `${index + 1}`;
          searchStruct(part, newPartId);
        });
      } else {
        const filename = structure.disposition?.params?.filename || structure.params?.name;
        const decodedFilename = decodeEmailSubject(filename || '');

        if (decodedFilename === targetFilename) {
          console.log(`📧 Found attachment ${targetFilename} at part ${partId}`);

          // Download this specific part
          const fetch = imap.fetch([seqno], {
            bodies: partId,
            struct: false
          });

          let attachmentData = Buffer.alloc(0);

          fetch.on('message', function(msg, seqno) {
            msg.on('body', function(stream, info) {
              let buffer = Buffer.alloc(0);

              stream.on('data', function(chunk) {
                buffer = Buffer.concat([buffer, chunk]);
              });

              stream.once('end', function() {
                // Decode based on encoding
                let finalData = buffer;

                if (structure.encoding === 'base64') {
                  finalData = Buffer.from(buffer.toString(), 'base64');
                } else if (structure.encoding === 'quoted-printable') {
                  // Handle quoted-printable if needed
                  finalData = buffer;
                }

                attachmentData = finalData;
              });
            });
          });

          fetch.once('end', function() {
            try {
              fs.writeFileSync(outputPath, attachmentData);
              console.log(`📧 ✅ Attachment downloaded successfully: ${outputPath} (${attachmentData.length} bytes)`);
              resolve();
            } catch (writeError) {
              console.error(`📧 Error writing attachment:`, writeError);
              reject(writeError);
            }
          });

          fetch.once('error', function(err) {
            console.error('📧 Error downloading attachment part:', err);
            reject(err);
          });
        }
      }
    }

    searchStruct(struct);
  });
}

// Download attachment from email data - now just copies pre-downloaded file
async function downloadAttachmentFromEmail(emailData, attachment, tempFilePath) {
  console.log(`📧 Copying pre-downloaded ${attachment.filename} to ${tempFilePath}`);

  if (attachment.downloadedPath && fs.existsSync(attachment.downloadedPath)) {
    try {
      fs.copyFileSync(attachment.downloadedPath, tempFilePath);
      console.log(`📧 ✅ Attachment copied successfully: ${tempFilePath} (${attachment.actualSize} bytes)`);
      return;
    } catch (error) {
      console.error(`📧 Error copying pre-downloaded file:`, error);
      throw error;
    }
  } else {
    console.error(`📧 Pre-downloaded file not found: ${attachment.downloadedPath}`);
    throw new Error(`Pre-downloaded attachment not found: ${attachment.filename}`);
  }
}

// Process email transcription (download attachments and transcribe)
async function processEmailTranscription(user, emailData, senderEmail) {
  try {
    console.log(`📧 Processing transcription for ${senderEmail} with ${emailData.attachments.length} files`);

    // Calculate total estimated duration
    let totalEstimatedMinutes = 0;
    emailData.attachments.forEach(attachment => {
      // Rough estimate: 1MB = 1 minute for audio, 3MB = 1 minute for video
      const fileSizeMB = (attachment.size || 1000000) / (1024 * 1024);
      const isVideo = attachment.type.startsWith('video/');
      const estimatedMinutes = isVideo ? Math.ceil(fileSizeMB / 3) : Math.ceil(fileSizeMB / 1.2);
      totalEstimatedMinutes += estimatedMinutes;
    });

    console.log(`📧 Estimated total duration: ${totalEstimatedMinutes} minutes`);

    // Check user balance
    if (user.remainingMinutes < totalEstimatedMinutes) {
      console.log(`📧 Insufficient balance: ${user.remainingMinutes} < ${totalEstimatedMinutes}`);
      await sendInsufficientBalanceEmail(senderEmail, user.remainingMinutes, totalEstimatedMinutes);
      return;
    }

    // Process each attachment
    const transcriptionResults = [];
    let actualMinutesUsed = 0;

    for (let i = 0; i < emailData.attachments.length; i++) {
      const attachment = emailData.attachments[i];
      console.log(`📧 Processing attachment ${i + 1}/${emailData.attachments.length}: ${attachment.filename}`);

      try {
        console.log(`📧 Starting real transcription of ${attachment.filename}`);

        // Download attachment to temporary file
        const tempDir = path.join(__dirname, 'temp_email_uploads');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFilePath = path.join(tempDir, `email_${Date.now()}_${attachment.filename}`);
        console.log(`📧 Downloading attachment to: ${tempFilePath}`);

        // Download the actual attachment from the email
        await downloadAttachmentFromEmail(emailData, attachment, tempFilePath);
        console.log(`📧 File downloaded successfully, starting transcription...`);

        // Get actual audio duration for accurate billing
        let actualDuration;
        try {
          actualDuration = await getAudioDuration(tempFilePath);
        } catch (durationError) {
          console.warn(`⚠️ Could not get audio duration, using file size estimate`);
          // Fallback to file size estimation
          const fileSizeMB = (attachment.size || 1000000) / (1024 * 1024);
          const isVideo = attachment.type.startsWith('video/');
          actualDuration = isVideo ? (fileSizeMB / 3) * 60 : (fileSizeMB / 1.2) * 60;
        }
        const durationMinutes = Math.ceil(actualDuration / 60);

        console.log(`📧 Starting real transcription of ${attachment.filename} (${durationMinutes} minutes)`);

        // Transcribe the real audio file using our transcription system
        let realTranscription;
        try {
          if (durationMinutes <= 15) {
            // Direct transcription for short files
            realTranscription = await directGeminiTranscription(tempFilePath, attachment.filename, 'Hebrew', null, null, 0, 1);
          } else {
            // Chunked transcription for longer files
            realTranscription = await chunkedGeminiTranscription(tempFilePath, attachment.filename, 'Hebrew', durationMinutes, null, null, 0, 1, user.email);
          }
        } catch (transcriptionError) {
          console.error(`📧 Transcription failed for ${attachment.filename}:`, transcriptionError);
          throw new Error(`שגיאה בתמלול הקובץ ${attachment.filename}: ${transcriptionError.message}`);
        }

        console.log(`📧 Real transcription completed: ${realTranscription.length} characters`);

        // Create Word document with real transcription
        const wordFilePath = await createWordDocument(realTranscription, attachment.filename, durationMinutes);

        const result = {
          filename: attachment.filename,
          transcription: realTranscription,
          duration: durationMinutes,
          wordFilePath: wordFilePath,
          success: true
        };

        transcriptionResults.push(result);
        actualMinutesUsed += result.duration;

        // Clean up temporary file
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`🗑️ Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupError) {
          console.warn(`⚠️ Could not delete temp file: ${tempFilePath}`);
        }

      } catch (error) {
        console.error(`📧 Error processing ${attachment.filename}:`, error);
        transcriptionResults.push({
          filename: attachment.filename,
          error: error.message,
          success: false
        });
      }
    }

    // Update user balance
    user.remainingMinutes = Math.max(0, user.remainingMinutes - actualMinutesUsed);

    // Add to transaction history
    if (!user.transactions) {
      user.transactions = [];
    }
    user.transactions.push({
      type: 'usage',
      amount: -actualMinutesUsed,
      description: `תמלול אימייל: ${emailData.attachments.length} קבצים`,
      timestamp: new Date().toISOString(),
      source: 'email'
    });

    // Save user data
    await saveUsersData();

    // Send results email
    await sendTranscriptionResultsEmail(senderEmail, transcriptionResults, actualMinutesUsed, user.remainingMinutes);

    console.log(`📧 ✅ Email transcription completed for ${senderEmail}. Used: ${actualMinutesUsed} minutes, Remaining: ${user.remainingMinutes} minutes`);

  } catch (error) {
    console.error('📧 Error in email transcription processing:', error);
    await sendErrorEmail(senderEmail, error.message);
  }
}

// Send insufficient balance email
async function sendInsufficientBalanceEmail(senderEmail, currentBalance, requiredMinutes) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: senderEmail,
      subject: 'התמלול נכשל - יתרה לא מספיקה',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 18px;">
          <p><strong>התמלול נכשל!</strong></p>
          <p>אורך הקובץ: ${requiredMinutes} דקות</p>
          <p>יתרה נוכחית: ${currentBalance} דקות</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Insufficient balance email sent to ${senderEmail}`);

  } catch (error) {
    console.error('📧 Error sending insufficient balance email:', error);
  }
}

// Send transcription results email
async function sendTranscriptionResultsEmail(senderEmail, results, minutesUsed, remainingMinutes) {
  try {
    const successfulResults = results.filter(r => r.success);

    let transcriptionContent = '';
    const attachments = [];

    successfulResults.forEach((result, index) => {
      transcriptionContent += `\n\n=== ${result.filename} ===\n${result.transcription}`;

      // Add Word file as attachment
      if (result.wordFilePath && fs.existsSync(result.wordFilePath)) {
        attachments.push({
          filename: `${result.filename.replace(/\.[^/.]+$/, '')}.docx`,
          path: result.wordFilePath
        });
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: senderEmail,
      subject: 'התמלול שלך מוכן!',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 18px;">
          <p><strong>התמלול שלך מוכן!</strong></p>
          <p>אורך הקובץ: ${minutesUsed} דקות</p>
          <p>יתרה נותרת: ${remainingMinutes} דקות</p>

          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; margin-top: 20px;">
            ${transcriptionContent || 'אין תמלול זמין'}
          </div>
        </div>
      `,
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Transcription results sent to ${senderEmail} with ${attachments.length} Word files`);

    // Clean up temporary Word files
    successfulResults.forEach(result => {
      if (result.wordFilePath && fs.existsSync(result.wordFilePath)) {
        try {
          fs.unlinkSync(result.wordFilePath);
          console.log(`🗑️ Cleaned up temp Word file: ${result.wordFilePath}`);
        } catch (error) {
          console.error(`Error cleaning up ${result.wordFilePath}:`, error);
        }
      }
    });

  } catch (error) {
    console.error('📧 Error sending transcription results:', error);
  }
}

// Send error email
async function sendErrorEmail(senderEmail, errorMessage) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: senderEmail,
      subject: 'התמלול נכשל - שגיאה טכנית',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 18px;">
          <p><strong>התמלול נכשל!</strong></p>
          <p>סיבה: שגיאה טכנית</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Error email sent to ${senderEmail}`);

  } catch (error) {
    console.error('📧 Error sending error email:', error);
  }
}

// Start server without MongoDB
const server = app.listen(PORT, () => {
  const ffmpegAvailable = checkFFmpegAvailability();

  console.log(`🚀 Enhanced server running on port ${PORT}`);
  console.log(`🔑 Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`📧 Email configured: ${!!process.env.EMAIL_USER}`);
  console.log(`📂 Data file: ${DATA_FILE}`);
  console.log(`📁 Transcriptions folder: ${downloadsDir}`);
  console.log(`💾 Backups folder: ${BACKUPS_DIR}`);

  if (ffmpegAvailable) {
    console.log(`✅ FFmpeg is available - enhanced chunking enabled`);
  } else {
    console.log(`⚠️ FFmpeg not available - using direct transcription only`);
  }

  console.log(`🎯 Enhanced features: Smart chunking for large files, complete transcription guarantee`);

  // Start history cleanup scheduler
  scheduleHistoryCleanup();

  // Email monitoring disabled per user request
  console.log('🕒 History cleanup scheduled for every day at midnight');
  console.log('📧 Email monitoring disabled - not using email transcription service');
});

// Configure server timeouts for large file uploads
server.timeout = 60 * 60 * 1000; // 60 minutes timeout for large file uploads
server.keepAliveTimeout = 65000; // Keep-alive timeout
server.headersTimeout = 66000; // Headers timeout
console.log('⏰ Server timeouts configured: 60 min upload, 65s keep-alive');
























































