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
  text = text.replace(/\."/g, '".');
  text = text.replace(/,"/g, '",');
  text = text.replace(/;"/g, '";');
  return text;
}

async function fixHebrewLanguage() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-hebrew-language-fixed.docx');

    let testText = `בדיקה לשפה עברית תקינה. המשפט הזה צריך להיות מזוהה כעברית ולא כערבית.

פסקה שנייה עם ציטוטים: "זה טקסט בעברית." והוא צריך להיראות נכון.

בדיקה נוספת עם סימני פיסוק: "ציטוט עם נקודה." ו"ציטוט עם פסיק," בשפה עברית.

פסקה אחרונה לוודא שהכל עובד: השפה צריכה להיות מוגדרת כעברית (ישראל) ולא כערבית.`;

    // מתקנים את סדר הפיסוק
    testText = fixHebrewPunctuation(testText);

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

    console.log('🔧 מוסיף הגדרת שפה עברית...');

    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // יוצרים תוכן עם הגדרת שפה עברית (אבל בזהירות)
    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:lang w:val="he-IL"/>
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
    fs.writeFileSync(outPath, outBuffer);

    console.log('✅ יצרתי קובץ עם הגדרת שפה עברית:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('🔧 הוספתי:');
    console.log('   - הגדרת שפה: w:lang="he-IL"');
    console.log('   - שמרתי על יישור פשוט לימין');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

fixHebrewLanguage();