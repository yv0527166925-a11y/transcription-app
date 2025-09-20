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

async function replaceAllContent() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-only-4-paragraphs.docx');

    // 4 פסקאות חדשות משלי
    const newParagraphs = [
      'זוהי הפסקה הראשונה מתוך ארבע פסקאות חדשות שאני כותב עכשיו.',
      'פסקה שנייה: אני בודק האם הטקסט הישן נמחק לגמרי ונשאר רק הטקסט החדש.',
      'פסקה שלישית: זה צריך להיות מיושר לימין עם אותן הגדרות כמו הקובץ המקורי.',
      'פסקה רביעית ואחרונה: אם זה עובד, נוכל להשתמש בשיטה הזו עם הטקסט שהמשתמש רוצה.'
    ];

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);
    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('🗑️ מוחק את כל התוכן הישן...');

    // נמצא את ההתחלה והסוף של הגוף
    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // ניצור תוכן חדש עם 4 פסקאות
    let newBodyContent = '';
    newParagraphs.forEach(paragraph => {
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

    console.log('✅ יצרתי קובץ עם 4 פסקאות חדשות בלבד:', outPath);
    console.log('📊 מספר פסקאות:', newParagraphs.length);

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

replaceAllContent();