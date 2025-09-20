const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fixPunctuation(text) {
  // תיקון סדר גרשיים ונקודות בעברית
  // הבעיה: כאן." צריך להיות: כאן".
  text = text.replace(/\."/g, '".');

  // תיקון נוסף לסימני פיסוק אחרים
  text = text.replace(/,"/g, '",');
  text = text.replace(/;"/g, '";');
  text = text.replace(/\?"/g, '"?');
  text = text.replace(/!"/g, '"!');

  return text;
}

async function fixSimpleAndPunctuation() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-simple-punctuation-fixed.docx');

    // טקסט עם בדיקות ספציפיות לבעיות סימני פיסוק
    let testText = `זהו טקסט בדיקה חדש עם בעיות סימני פיסוק. המשפט הזה מסתיים עם "גרשיים כאן."

בפסקה השנייה יש משפט שמתחיל ב"גרשיים" ומסתיים גם עם "גרשיים כאן." האם זה יתוקן?

משפט עם שאלה: "האם זה יעבוד כראוי?" ומשפט עם קריאה: "בטח שכן!"

בדיקה אחרונה עם פסיק: "זה טקסט עם פסיק," ועם נקודה-פסיק: "וזה עם נקודה-פסיק;"`;

    // מתקנים את סדר הפיסוק לפני יצירת המסמך
    testText = fixPunctuation(testText);

    console.log('🔧 תיקנתי את סדר הפיסוק:');
    console.log('   - הועברו נקודות לפני גרשיים');
    console.log('   - תוקנו גם פסיקים וסימני שאלה');

    // מחלקים לפסקאות לפי שורות ריקות
    const paragraphs = testText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n\s*\n/)
      .filter(p => p.length > 0);

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);
    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('📝 יוצר מסמך עם יישור פשוט לימין...');

    // נמצא את ההתחלה והסוף של הגוף
    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // ניצור תוכן חדש עם יישור פשוט (כמו בקובץ הטוב המקורי)
    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
    });

    // נרכיב את המסמך מחדש
    const newDocumentXml = documentXml.substring(0, bodyStart) +
                          newBodyContent +
                          documentXml.substring(bodyEnd);

    zip.file('word/document.xml', newDocumentXml);
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);

    console.log('✅ יצרתי קובץ עם יישור פשוט וסימני פיסוק מתוקנים:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

fixSimpleAndPunctuation();