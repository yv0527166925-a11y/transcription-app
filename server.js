const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Email transporter
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Create uploads directory if it doesn't exist
const ensureUploadsDir = async () => {
    try {
        await fs.access('./uploads');
    } catch {
        await fs.mkdir('./uploads', { recursive: true });
        console.log('📁 Created uploads directory');
    }
};
ensureUploadsDir();

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /\.(mp3|wav|mp4|avi|mov|m4a|flac|aac|webm|mkv)$/i;
        if (allowedTypes.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('סוג קובץ לא נתמך. נתמכים: MP3, WAV, MP4, AVI, MOV, M4A, FLAC, AAC, WEBM, MKV'));
        }
    }
});

// --- In-memory Data ---
const users = new Map();
users.set('admin@example.com', { 
    id: 'admin', 
    name: 'מנהל', 
    email: 'admin@example.com', 
    password: 'admin123', 
    isAdmin: true 
});
users.set('test@example.com', { 
    id: 'test123', 
    name: 'בודק', 
    email: 'test@example.com', 
    password: 'test123', 
    isAdmin: false 
});

const transcriptionJobs = new Map(); // Store job statuses
console.log('✅ Server initialized with demo users');

// --- Helper Functions ---

// Convert audio/video to WAV format using FFmpeg
async function convertToWav(inputPath) {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '_converted.wav');
    const command = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`;
    
    try {
        await execAsync(command);
        console.log(`✅ Converted ${inputPath} to WAV format`);
        return outputPath;
    } catch (error) {
        console.error('❌ FFmpeg conversion failed:', error.message);
        throw new Error('שגיאה בהמרת הקובץ לפורמט נתמך');
    }
}

// Transcribe audio using Google Gemini AI
async function transcribeAudio(audioPath, userEmail, originalName) {
    try {
        console.log(`🎵 Starting transcription for: ${originalName}`);
        
        // Read the audio file as base64
        const audioBuffer = await fs.readFile(audioPath);
        const audioBase64 = audioBuffer.toString('base64');
        
        // Get the generative model
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        
        // Create the prompt
        const prompt = `
        בצע תמלול מדויק של הקובץ השמע המצורף. החזר את התמלול בעברית בפורמט מסודר עם:
        1. חלוקה לפסקאות לפי הקשר
        2. סימני פיסוק נכונים
        3. זיהוי דוברים שונים (אם יש)
        4. תיקון שגיאות דקדוק קלות
        
        אם הקובץ לא מכיל דיבור, הודע על כך.
        `;

        // Transcribe
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "audio/wav",
                    data: audioBase64
                }
            }
        ]);
        
        const transcription = result.response.text();
        console.log(`✅ Transcription completed for: ${originalName}`);
        
        return transcription;
        
    } catch (error) {
        console.error('❌ Transcription failed:', error.message);
        throw new Error('שגיאה בתמלול הקובץ: ' + error.message);
    }
}

// Create Word document
async function createWordDocument(transcription, originalFileName) {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `תמלול עבור: ${originalFileName}`,
                            bold: true,
                            size: 28
                        })
                    ]
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
                            size: 24
                        })
                    ]
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: transcription,
                            size: 24
                        })
                    ]
                })
            ]
        }]
    });
    
    return await Packer.toBuffer(doc);
}

// Send email with transcription
async function sendTranscriptionEmail(userEmail, transcription, originalFileName, wordBuffer) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: `תמלול מוכן עבור: ${originalFileName}`,
        html: `
            <div dir="rtl" style="font-family: Arial, sans-serif;">
                <h2>שלום!</h2>
                <p>התמלול עבור הקובץ <strong>${originalFileName}</strong> הושלם בהצלחה.</p>
                
                <h3>התמלול:</h3>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; white-space: pre-wrap;">
                    ${transcription}
                </div>
                
                <p>מצורף גם קובץ Word עם התמלול.</p>
                <p>תודה שהשתמשת בשירות התמלול שלנו!</p>
            </div>
        `,
        attachments: [
            {
                filename: `תמלול-${originalFileName}.docx`,
                content: wordBuffer
            }
        ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${userEmail}`);
}

// Cleanup files
async function cleanupFiles(...filePaths) {
    for (const filePath of filePaths) {
        try {
            if (filePath) {
                await fs.unlink(filePath);
                console.log(`🗑️ Cleaned up: ${filePath}`);
            }
        } catch (error) {
            console.log(`⚠️ Could not delete ${filePath}:`, error.message);
        }
    }
}

// --- API Routes ---

// Authentication routes
app.post('/api/login', (req, res) => {
    console.log('📥 Login request:', req.body);
    const { email, password } = req.body;
    const user = users.get(email);

    if (!user || user.password !== password) {
        console.log(`❌ Login failed for ${email}`);
        return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
    }

    console.log(`✅ Login successful for ${email}`);
    const { password: _, ...userToReturn } = user;
    res.json({ success: true, user: userToReturn });
});

app.post('/api/register', (req, res) => {
    console.log('📥 Register request:', req.body);
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'נא למלא את כל השדות' });
    }
    
    if (users.has(email)) {
        return res.status(409).json({ success: false, error: 'משתמש עם אימייל זה כבר קיים' });
    }
    
    const newUser = { 
        id: Date.now().toString(), 
        name, 
        email, 
        password, 
        isAdmin: false 
    };
    users.set(email, newUser);
    console.log(`✅ New user registered: ${email}`);
    
    const { password: _, ...userToReturn } = newUser;
    res.status(201).json({ success: true, user: userToReturn });
});

// File upload and transcription route
app.post('/api/transcribe', upload.single('audioFile'), async (req, res) => {
    const jobId = crypto.randomBytes(16).toString('hex');
    
    try {
        console.log('📥 Transcription request received');
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'לא הועלה קובץ' 
            });
        }

        const { userEmail } = req.body;
        if (!userEmail) {
            await cleanupFiles(req.file.path);
            return res.status(400).json({ 
                success: false, 
                error: 'חסר אימייל משתמש' 
            });
        }

        // Store job status
        transcriptionJobs.set(jobId, {
            status: 'processing',
            fileName: req.file.originalname,
            userEmail: userEmail,
            startTime: new Date()
        });

        console.log(`🎬 Processing file: ${req.file.originalname} for ${userEmail}`);
        
        // Send immediate response with job ID
        res.json({
            success: true,
            message: 'הקובץ התקבל ומעובד כעת. תקבל התמלול במייל בקרוב.',
            jobId: jobId
        });

        // Process asynchronously
        processTranscription(req.file, userEmail, req.file.originalname, jobId);

    } catch (error) {
        console.error('❌ Upload error:', error.message);
        transcriptionJobs.set(jobId, {
            status: 'failed',
            error: error.message
        });
        
        if (req.file) {
            await cleanupFiles(req.file.path);
        }
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                error: 'שגיאה בהעלאת הקובץ: ' + error.message 
            });
        }
    }
});

// Process transcription asynchronously
async function processTranscription(file, userEmail, originalName, jobId) {
    let convertedPath = null;
    
    try {
        // Update job status
        transcriptionJobs.set(jobId, {
            ...transcriptionJobs.get(jobId),
            status: 'converting'
        });

        // Convert to WAV if needed
        convertedPath = await convertToWav(file.path);
        
        // Update job status
        transcriptionJobs.set(jobId, {
            ...transcriptionJobs.get(jobId),
            status: 'transcribing'
        });

        // Transcribe
        const transcription = await transcribeAudio(convertedPath, userEmail, originalName);
        
        // Update job status
        transcriptionJobs.set(jobId, {
            ...transcriptionJobs.get(jobId),
            status: 'generating_document'
        });

        // Create Word document
        const wordBuffer = await createWordDocument(transcription, originalName);
        
        // Update job status
        transcriptionJobs.set(jobId, {
            ...transcriptionJobs.get(jobId),
            status: 'sending_email'
        });

        // Send email
        await sendTranscriptionEmail(userEmail, transcription, originalName, wordBuffer);
        
        // Update final status
        transcriptionJobs.set(jobId, {
            ...transcriptionJobs.get(jobId),
            status: 'completed',
            completedTime: new Date()
        });
        
        console.log(`✅ Transcription completed successfully for ${originalName}`);

    } catch (error) {
        console.error('❌ Processing failed:', error.message);
        
        transcriptionJobs.set(jobId, {
            ...transcriptionJobs.get(jobId),
            status: 'failed',
            error: error.message
        });
        
        // Try to send error email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: userEmail,
                subject: `שגיאה בתמלול: ${originalName}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif;">
                        <h2>שגיאה בתמלול</h2>
                        <p>מצטערים, אירעה שגיאה בתמלול הקובץ: <strong>${originalName}</strong></p>
                        <p>שגיאה: ${error.message}</p>
                        <p>אנא נסה שוב או צור קשר לתמיכה.</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('❌ Could not send error email:', emailError.message);
        }
        
    } finally {
        // Cleanup files
        await cleanupFiles(file.path, convertedPath);
        
        // Remove old job statuses (keep only last 100)
        if (transcriptionJobs.size > 100) {
            const entries = Array.from(transcriptionJobs.entries());
            entries.sort((a, b) => b[1].startTime - a[1].startTime);
            transcriptionJobs.clear();
            entries.slice(0, 100).forEach(([key, value]) => {
                transcriptionJobs.set(key, value);
            });
        }
    }
}

// Check job status
app.get('/api/job/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = transcriptionJobs.get(jobId);
    
    if (!job) {
        return res.status(404).json({ 
            success: false, 
            error: 'לא נמצאה משימה עם מזהה זה' 
        });
    }
    
    res.json({ success: true, job });
});

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- Base Route ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                error: 'הקובץ גדול מדי. מקסימום 100MB' 
            });
        }
    }
    
    res.status(500).json({ 
        success: false, 
        error: 'שגיאה בשרת' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Transcription Server running on port ${PORT}`);
    console.log(`📧 Email configured: ${process.env.EMAIL_USER ? '✅' : '❌'}`);
    console.log(`🤖 Gemini AI configured: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
});
