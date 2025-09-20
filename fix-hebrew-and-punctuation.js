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

async function fixHebrewAndPunctuation() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-hebrew-fixed.docx');

    // טקסט עם בדיקות ספציפיות לבעיות
    const testText = `זהו טקסט בדיקה לבעיות שפה וסימני פיסוק. אני רוצה לראות איך מטופלים "ציטוטים בעברית".

בפסקה זו יש משפט עם "גרשיים בתחילה ובסוף". כמו כן, יש כאן משפט שמסתיים ב"גרשיים". האם הנקודה תהיה במקום הנכון?

בדיקה נוספת: "האם זה עובד נכון?" ועוד משפט: "בואו נראה מה קורה כאן."

משפט אחרון לבדיקה עם מירכאות 'יחיד' ומירכאות "כפולות" יחד במשפט אחד.`;

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

    console.log('🔧 מתקן הגדרות שפה וסימני פיסוק...');

    // נמצא את ההתחלה והסוף של הגוף
    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // ניצור תוכן חדש עם הגדרות עברית נכונות
    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
        <w:bidi/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
          <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
          <w:rtl/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(paragraph)}</w:t>
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

    console.log('✅ יצרתי קובץ עם תיקוני עברית:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('🔧 תיקונים שבוצעו:');
    console.log('   - הוספת הגדרת שפה עברית: w:lang="he-IL"');
    console.log('   - הוספת w:bidi ו-w:rtl');
    console.log('   - הגדרת פונט Arial לעברית');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

fixHebrewAndPunctuation();