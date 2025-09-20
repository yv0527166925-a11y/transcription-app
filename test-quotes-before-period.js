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

function fixHebrewPunctuation(text) {
  // תיקון סדר פיסוק בעברית - סימני פיסוק לפני גרשיים
  text = text.replace(/\."/g, '".');  // נקודה אחרי גרשיים → נקודה לפני גרשיים
  text = text.replace(/,"/g, '",');   // פסיק אחרי גרשיים → פסיק לפני גרשיים
  text = text.replace(/;"/g, '";');   // נקודה-פסיק אחרי גרשיים → נקודה-פסיק לפני גרשיים

  return text;
}

async function testQuotesBeforePeriod() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-quotes-period-combination.docx');

    // טקסט בדיקה מיוחד עם שילובים של גרשיים לפני נקודה
    let testText = `בדיקה מיוחדת לשילוב גרשיים ונקודה. המשפט הזה מסתיים "כאן."

פסקה שנייה עם מקרים שונים: "ציטוט ראשון." ואחר כך "ציטוט שני." בסוף המשפט.

מקרה מיוחד עם גרשיים לפני נקודה: הוא אמר "שלום" וסיים את הדברים.

בדיקה אחרונה: "טקסט עם נקודה." ו"טקסט עם פסיק," ו"טקסט עם נקודה-פסיק;" בשורה אחת.`;

    console.log('🔍 בודק שילוב גרשיים לפני נקודה:');
    console.log('   - "ציטוט." ← נקודה אחרי גרשיים');
    console.log('   - "ציטוט". ← נקודה לפני גרשיים (אחרי תיקון)');

    // מתקנים את סדר הפיסוק
    testText = fixHebrewPunctuation(testText);

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

    // נמצא את ההתחלה והסוף של הגוף
    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // ניצור תוכן חדש עם יישור פשוט לימין
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

    console.log('✅ יצרתי קובץ לבדיקת שילוב גרשיים ונקודה:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('🔍 בדוק במסמך:');
    console.log('   - האם הגרשיים והנקודות מופיעים בסדר הנכון?');
    console.log('   - האם הטקסט מיושר לימין?');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

testQuotesBeforePeriod();