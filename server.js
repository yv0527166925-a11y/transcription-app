const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const cors = require('cors');
const { connectDB } = require('./config/database');
const User = require('./models/User');
const {
  findOrCreateUser,
  checkUserMinutes,
  useUserMinutes,
  addTranscriptionToHistory
} = require('./utils/userHelpers');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

    // Try to preserve original Hebrew filename
    let safeName = file.originalname;

    // Clean invalid characters but keep Hebrew
    safeName = safeName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

    const finalName = `${timestamp}_${safeName}`;
    cb(null, finalName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for large files
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp3|mp4|wav|m4a|mov|avi|mkv|flac|aac|ogg)$/i;
    if (allowedTypes.test(file.originalname) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('סוג קובץ לא נתמך'), false);
    }
  }
});

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  console.log('📁 Created downloads directory');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// API Routes
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

// Helper function to clean filename
function cleanFilename(filename) {
  return filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Clean invalid chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();
}

// 🟢 פונקציות עזר
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fixHebrewPunctuation(text) {
  text = text.replace(/\."/g, '".');
  text = text.replace(/,"/g, '",');
  text = text.replace(/;"/g, '";');
  return text;
}

// 🟢 יצירת קובץ Word מתבנית
async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating template-based Word document with guaranteed RTL for: ${cleanName}`);

    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');

    // בדיקה אם התבנית קיימת
    if (!fs.existsSync(templatePath)) {
      console.log('⚠️ Template not found, using fallback method');
      throw new Error('Template not found');
    }

    // תיקון פיסוק עברי
    transcription = fixHebrewPunctuation(transcription);

    // מחלקים לפסקאות לפי שורות ריקות
    const paragraphs = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n\s*\n/)
      .filter(p => p.length > 0);

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    // תיקון הגדרות שפה בסטיילים
    if (zip.files['word/styles.xml']) {
      let stylesXml = await zip.file('word/styles.xml').async('string');
      stylesXml = stylesXml.replace(/w:val="ar-SA"/g, 'w:val="he-IL"');
      stylesXml = stylesXml.replace(/w:eastAsia="ar-SA"/g, 'w:eastAsia="he-IL"');
      stylesXml = stylesXml.replace(/w:bidi="ar-SA"/g, 'w:bidi="he-IL"');
      zip.file('word/styles.xml', stylesXml);
    }

    let documentXml = await zip.file('word/document.xml').async('string');

    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w14:paraId="13B47B51" w14:textId="77777777" w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
        </w:rPr>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
    });

    const newDocumentXml = documentXml.substring(0, bodyStart) +
                          newBodyContent +
                          documentXml.substring(bodyEnd);

    zip.file('word/document.xml', newDocumentXml);

    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    console.log(`✅ Template-based Word document created successfully for: ${cleanName}`);
    return outBuffer;

  } catch (error) {
    console.error('Error creating template-based Word document:', error);
    throw error;
  }
}

// 🟢 נקודת קצה: העלאה + יצירת Word
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { transcription, filename, userEmail, duration } = req.body;
    if (!transcription || !filename) {
      return res.status(400).json({ error: 'Missing transcription or filename' });
    }

    console.log(`📋 Processing transcription request for: ${filename}`);
    console.log(`📧 User email: ${userEmail || 'unknown'}`);
    console.log(`⏱️ Duration: ${duration || 'unknown'} seconds`);

    let user = null;
    const durationMinutes = duration ? Math.ceil(duration / 60) : 0;

    // User management if email provided
    if (userEmail) {
      try {
        user = await findOrCreateUser(userEmail);
        console.log(`👤 User found: ${user.email} (${user.minutesRemaining} minutes left)`);

        // Check if user has enough minutes
        const minuteCheck = await checkUserMinutes(userEmail, durationMinutes);
        if (!minuteCheck.hasEnough) {
          return res.status(403).json({
            error: 'Not enough minutes remaining',
            remainingMinutes: minuteCheck.remaining,
            requiredMinutes: durationMinutes
          });
        }

        // Deduct minutes
        await useUserMinutes(userEmail, durationMinutes);
        console.log(`💳 Deducted ${durationMinutes} minutes from user`);
      } catch (error) {
        console.error('❌ User management error:', error);
        // Continue without user management
      }
    }

    // Create Word document
    const buffer = await createWordDocument(transcription, filename, duration);

    // Save to downloads directory for persistent storage
    const cleanName = cleanFilename(filename);
    const timestamp = Date.now();
    const savedFilename = `${timestamp}_${cleanName}.docx`;
    const savedPath = path.join(downloadsDir, savedFilename);

    fs.writeFileSync(savedPath, buffer);
    console.log(`💾 Document saved to: ${savedPath}`);

    // Add to user history if user exists
    if (user) {
      try {
        await addTranscriptionToHistory(userEmail, {
          fileName: savedFilename,
          originalName: cleanName,
          transcriptionText: transcription.substring(0, 1000), // First 1000 chars only
          wordDocumentPath: savedPath,
          fileSize: buffer.length,
          processingTime: duration,
          audioLength: durationMinutes,
          language: 'hebrew',
          status: 'completed'
        });
        console.log(`📚 Added to user history`);
      } catch (error) {
        console.error('❌ Error adding to history:', error);
      }
    }

    // Send the file for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanName}.docx"`);
    res.send(buffer);

    console.log(`✅ Document sent successfully: ${cleanName}.docx`);

  } catch (err) {
    console.error('❌ Error in /upload:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await connectDB();
    console.log('✅ MongoDB connected successfully');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📁 Downloads directory: ${downloadsDir}`);
      console.log(`📄 Template file: חזר מהשרת תקין 2.docx`);
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    console.log('🚀 Starting server without MongoDB...');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} (without MongoDB)`);
    });
  }
};

startServer();