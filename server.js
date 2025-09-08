// תיקון 1: שיפור קידוד שמות קבצים
// החלף את הפונקציה filename בmulter:

filename: (req, file, cb) => {
  const timestamp = Date.now();
  const extension = path.extname(file.originalname);
  // תיקון שיפור קידוד עברית
  let safeName;
  try {
    // נסה UTF-8 תחילה
    safeName = decodeURIComponent(escape(file.originalname));
  } catch (error) {
    // אם זה לא עובד, השתמש בBuffer
    safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
  }
  // נקה תווים לא חוקיים
  safeName = safeName.replace(/[<>:"/\\|?*]/g, '_');
  cb(null, `${timestamp}_${safeName}`);
}

// תיקון 2: פרומפט חזק יותר לתמלול מלא
// החלף את הפונקציה realGeminiTranscription:

async function realGeminiTranscription(filePath, filename, language) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768  // הגדל את המגבלה
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

    // פרומפט מחוזק לתמלול מלא
    const prompt = `תמלל את כל הקובץ האודיו הבא לעברית בצורה מלאה ומדויקת, מההתחלה ועד הסוף הגמור, ללא קיצורים או סיכומים.

🔥 חובה מוחלטת - תמלל הכל:
- תמלל כל מילה, כל משפט, כל רעיון מההתחלה עד הסוף
- אם הקובץ ארוך 30 דקות - תמלל את כל ה-30 דקות
- אם הקובץ ארוך שעה - תמלל את כל השעה
- אל תעצור באמצע, אל תקצר, אל תסכם
- המשך לתמלל עד שהאודיו נגמר לחלוטין

📝 עיצוב הטקסט:
- חלק לפסקאות של 2-4 משפטים
- השאר שורה ריקה בין כל פסקה
- כל משפט מסתיים בנקודה
- זיהוי דוברים: "רב:", "שואל:", "תלמיד:" (רק אם ברור)

💬 ציטוטים במירכאות:
- "שנאמר בתורה..."
- "כדאיתא בגמרא..."
- "אמרו חכמים..."
- "כמו שכתוב..."
- "תניא..."
- "כדכתיב..."
- "משנה במסכת..."

⚠️ זכור: זה הקובץ ${filename}
תמלל אותו במלואו ללא קיצורים!

התחל עכשיו ותמלל הכל:`;

    console.log(`🎯 Starting FULL transcription for: ${filename}`);

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
    
    console.log(`🎯 Raw transcription length: ${transcription.length} characters`);
    
    // ניקוי טקסט משופר
    transcription = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n')
      .replace(/^\s+|\s+$/gm, '')
      .replace(/([.!?])\s*([א-ת])/g, '$1 $2')
      .trim();
    
    // בדיקה שהתמלול לא קצר מדי
    if (!transcription || transcription.length < 100) {
      throw new Error('התמלול נכשל - טקסט קצר מדי או ריק');
    }
    
    // אזהרה אם התמלול קצר
    if (transcription.length < 500) {
      console.warn(`⚠️ WARNING: Transcription seems short (${transcription.length} chars) for file: ${filename}`);
    }
    
    console.log(`✅ Transcription completed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('🔥 Gemini transcription error:', error);
    throw new Error(`שגיאה בתמלול: ${error.message}`);
  }
}

// תיקון 3: שיפור עיצוב קובץ Word (פחות דחוס)
// החלף את הפונקציה createWordDocument:

async function createWordDocument(transcription, filename, duration) {
  try {
    console.log(`📄 Creating Word document for: ${filename}`);
    
    // נקה את שם הקובץ מתווים מוזרים
    const cleanFilename = filename.replace(/[^\u0590-\u05FF\u0020-\u007E]/g, '').trim();
    
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 2160,    // יותר מרווח
              right: 1800,
              bottom: 2160,
              left: 1800
            }
          }
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "תמלול אוטומטי",
                bold: true,
                size: 36,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 600,
              line: 480
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `שם הקובץ: ${cleanFilename}`,
                size: 26,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 300,
              line: 400
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `משך זמן: ${duration} דקות`,
                size: 26,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 300,
              line: 400
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `תאריך: ${new Date().toLocaleDateString('he-IL')}`,
                size: 26,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            spacing: { 
              after: 600,
              line: 400
            }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: "─".repeat(60),
                size: 24,
                font: {
                  name: "Arial Unicode MS"
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { 
              after: 600,
              line: 400
            }
          }),
          
          ...processTranscriptionContentImproved(transcription)
        ]
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    console.log(`✅ Word document created successfully for: ${cleanFilename}`);
    return buffer;
    
  } catch (error) {
    console.error('Error creating Word document:', error);
    throw error;
  }
}

// תיקון 4: עיצוב תוכן Word משופר (פחות דחוס)
// החלף את הפונקציה processTranscriptionContent:

function processTranscriptionContentImproved(transcription) {
  const paragraphs = [];
  
  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  const sections = cleanedText.split(/\n\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0);
  
  sections.forEach((section, index) => {
    section = section.replace(/\n+/g, ' ').trim();
    
    if (!section.endsWith('.') && !section.endsWith('!') && !section.endsWith('?') && !section.endsWith(':')) {
      section += '.';
    }
    
    // זיהוי שורות דוברים
    const isSpeakerLine = /^(רב|הרב|שואל|תשובה|שאלה|המשיב|התלמיד|השואל|מרצה|דובר)\s*:/.test(section.trim());
    
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: section,
          size: 26,  // גודל טקסט יותר גדול
          font: {
            name: "Arial Unicode MS"
          },
          bold: isSpeakerLine
        })
      ],
      spacing: { 
        before: isSpeakerLine ? 600 : 400,  // יותר מרווח
        after: 400,
        line: 480  // יותר מרווח בין שורות
      }
    }));
    
    // הוסף מרווח נוסף כל כמה פסקאות
    if ((index + 1) % 3 === 0) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({
            text: "",
            size: 20
          })
        ],
        spacing: { 
          after: 300
        }
      }));
    }
  });
  
  return paragraphs;
}

// תיקון 5: שיפור המייל (שמות קבצים נכונים)
// החלף את הפונקציה sendTranscriptionEmail:

async function sendTranscriptionEmail(userEmail, transcriptions) {
  try {
    console.log(`📧 Preparing email for: ${userEmail}`);
    
    const attachments = transcriptions.map(trans => {
      // נקה את שם הקובץ
      const cleanFilename = trans.filename
        .replace(/[^\u0590-\u05FF\u0020-\u007E\u00A0-\u017F]/g, '')
        .replace(/\.[^/.]+$/, '')
        .trim();
      
      return {
        filename: `תמלול_${cleanFilename}.docx`,
        content: trans.wordDoc,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    });

    const fileList = transcriptions.map(t => {
      const cleanName = t.filename.replace(/[^\u0590-\u05FF\u0020-\u007E\u00A0-\u017F]/g, '').trim();
      return `<li>📄 ${cleanName}</li>`;
    }).join('');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: '✅ התמלול הושלם בהצלחה - קבצי Word מעוצבים מצורפים',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2 style="color: #667eea;">🎯 התמלול הושלם בהצלחה!</h2>
          <p>שלום,</p>
          <p>התמלול שלך הושלם בהצלחה ומצורפים הקבצים המעוצבים:</p>
          <ul style="margin: 20px 0;">
            ${fileList}
          </ul>
          <div style="background: #f8f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #764ba2; margin-bottom: 10px;">✨ מה מיוחד בתמלול:</h3>
            <ul style="margin: 0;">
              <li>💫 <strong>תמלול מלא ומדויק</strong> עם Gemini 2.5 Pro</li>
              <li>🎯 <strong>מותאם לעברית</strong> עם הגיה ליטאית ומושגי ארמית</li>
              <li>📄 <strong>קובץ Word מעוצב</strong> עם פסקאות נקיות</li>
              <li>💬 <strong>ציטוטים במירכאות</strong> וזיהוי דוברים</li>
            </ul>
          </div>
          <p><strong>תודה שבחרת במערכת התמלול החכמה!</strong></p>
          <p style="color: #666;">בברכה,<br>צוות התמלול החכם</p>
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
