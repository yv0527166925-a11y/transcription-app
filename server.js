const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Multer – שמירת קובץ זמני
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());

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
async function createWordDocument(transcription, filename) {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outputPath = path.join(__dirname, `${filename}.docx`);

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
    fs.writeFileSync(outputPath, outBuffer);

    return outputPath;

  } catch (error) {
    console.error('❌ Error creating Word document:', error);
    throw error;
  }
}

// 🟢 נקודת קצה: העלאה + יצירת Word
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { transcription, filename } = req.body;
    if (!transcription || !filename) {
      return res.status(400).json({ error: 'Missing transcription or filename' });
    }

    const docPath = await createWordDocument(transcription, filename);
    res.download(docPath, err => {
      if (err) console.error(err);
      fs.unlinkSync(docPath); // מחיקת הקובץ אחרי שליחה
    });
  } catch (err) {
    console.error('❌ Error in /upload:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});