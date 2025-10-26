const fs = require('fs');
const path = require('path');

// העתקת הפונקציות מהשרת המתוקן
function cleanFilename(filename) {
  return filename.replace(/\.[^/.]+$/, "").replace(/[^א-תa-zA-Z0-9\s]/g, '').trim();
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#39;';
    }
  });
}

// הפונקציה המתוקנת מהשרת
async function createWordDocumentFixed(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document with FIXED server logic for: ${cleanName}`);

    const JSZip = require('jszip');
    const templatePath = path.join(__dirname, 'template.docx');

    if (!fs.existsSync(templatePath)) {
      throw new Error('Template not found!');
    }

    // 1. טען את התבנית החדשה (ללא כותרת אוטומטית)
    const templateData = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // 2. נקה את התמלול מהערות מיותרות (הלוגיקה החדשה)
    const cleanedTranscription = transcription
      .replace(/\[מוזיקה\]|\[רעש רקע\]|\[צלילים\]|\[רעש\]|\[קולות\]|\[הפסקה\]|\[שקט\]|\[.*?ברור.*?\]/gi, '')
      .replace(/\n{3,}/g, '\n\n') // שמור על מעברי פסקאות קיימים
      .trim();

    // 3. פיצול לפסקאות כפי שה-AI יצר (ללא עיבוד יתר!)
    const shortParagraphs = cleanedTranscription.split(/\n\s*\n/);

    console.log(`📝 Processing ${shortParagraphs.length} AI paragraphs (preserving original structure)`);

    // 4. החלפת התוכן בתבנית החדשה - הלוגיקה המתוקנת
    let paragraphIndex = 0;
    let newDocXml = docXml.replace(/<w:t>REPLACECONTENT<\/w:t>/g, () => {
      if (paragraphIndex < shortParagraphs.length) {
        const text = shortParagraphs[paragraphIndex];
        paragraphIndex++;
        return `<w:t>${escapeXml(text)}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // 5. תיקון הגדרות שפה
    newDocXml = newDocXml
      .replace(/w:lang w:val="ar-SA"/g, 'w:lang w:val="he-IL"')
      .replace(/w:lang w:eastAsia="ar-SA"/g, 'w:lang w:eastAsia="he-IL"')
      .replace(/w:lang w:bidi="ar-SA"/g, 'w:lang w:bidi="he-IL"');

    // 6. יצירת קובץ Word חדש
    const newZip = new JSZip();
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

    console.log(`✅ FIXED Word document created with ${shortParagraphs.length} preserved paragraphs`);
    return buffer;

  } catch (error) {
    console.error('❌ Error creating FIXED Word document:', error);
    throw error;
  }
}

// בדיקה עם טקסט שמדמה ג'מיני
async function demonstrateFix() {
  try {
    console.log('🧪 Demonstrating Word document fixes...');
    console.log('=====================================\n');

    // טקסט דוגמה שמדמה פלט מג'מיני עם 4 פסקאות ברורות
    const geminiTranscription = `שלום וברכה לכולם! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. זהו תמלול דוגמה שמראה איך ג'מיני יוצר פסקאות יxxxxxxסודרות. הפסקה הראשונה הזאת מכילה כמה משפטים שקשורים זה לזה ומתארים רעיון אחד שלם. בעבר, הפונקציה הישנה הייתה מפרקת את זה למשפטים נפרדים, אבל עכשיו זה יישאר יחד כפסקה אחת!

הפסקה השנייה מכילה נושא אחר לגמרי. "זו דוגמה מצוינת של ציטוט חשוב מאוד", כפי שמישהו חכם אמר פעם. האם התיקונים שלנו עובדים כמו שצריך? אני מקווה שכן, כי השקענו בזה הרבה מאמץ ועבודה יסודית. הפיסוק צריך להיות צמוד למילים: שאלה? קריאה! נקודתיים: בדיוק כך.

זוהי הפסקה השלישית בלבד והיא נפרדת לחלוטין. היא מדגימה איך ג'מיני מחלק טקסט באופן טבעי לרעיונות נפרדים וברורים. כל פסקה מכילה מחשבה שלמה וקוהרנטית שלא צריכה להיפרק יותר כלל וכלל. זה בדיוק מה שרצינו להשיג!

הפסקה הרביעית והאחרונה מסכמת את הבדיקה המושלמת הזאת: אם הכל עובד נכון, נראה את הטקסט הזה בקובץ Word עם בדיוק 4 פסקאות מובחנות וברורות, סימני פיסוק צמודים למילים, יישור לימין מושלם, וללא שום כותרת אוטומטית מעצבנת! זו הוכחה חיה שהתיקונים שלנו עובדים במיטבם.`;

    console.log('📝 Original Gemini text structure:');
    const originalParagraphs = geminiTranscription.split(/\n\s*\n/);
    originalParagraphs.forEach((p, i) => {
      console.log(`פסקה ${i + 1}: "${p.substring(0, 80)}..."`);
    });

    console.log(`\n📊 Total paragraphs: ${originalParagraphs.length} (should remain ${originalParagraphs.length})`);

    // יצירת קובץ Word עם הפונקציה המתוקנת
    const wordBuffer = await createWordDocumentFixed(geminiTranscription, 'fixed-demo.mp3', 7);

    fs.writeFileSync('DEMO-FIXED-WORD-DOCUMENT.docx', wordBuffer);

    console.log('\n✅ Demo document created successfully!');
    console.log('📁 File: DEMO-FIXED-WORD-DOCUMENT.docx');
    console.log('\n🔍 What to check in the document:');
    console.log('   ✅ Exactly 4 paragraphs (not broken into smaller pieces)');
    console.log('   ✅ NO automatic title "תומלל על די אלף בוט"');
    console.log('   ✅ Punctuation attached to words: שאלה? קריאה! נקודתיים:');
    console.log('   ✅ Quotes properly formatted: "זו דוגמה מצוינת"');
    console.log('   ✅ Right-to-left alignment throughout');
    console.log('   ✅ Professional Hebrew font (David)');
    console.log('\n📈 This demonstrates the complete fix Gemini suggested!');

  } catch (error) {
    console.error('❌ Error demonstrating fixes:', error);
  }
}

if (require.main === module) {
  demonstrateFix();
}

module.exports = { demonstrateFix };