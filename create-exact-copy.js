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

async function createExactCopy() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-exact-copy-no-lang.docx');

    let testText = `בדיקה שלא מוסיפה שום הגדרות שפה. רק מעתיקה בדיוק את המבנה המקורי.

פסקה שנייה עם ציטוטים: "זה טקסט בדיוק כמו המקורי." ללא הגדרות נוספות.

בדיקה עם פיסוק: "ציטוט עם נקודה." ו"ציטוט עם פסיק," כמו שצריך.

פסקה אחרונה: האם השפה תהיה עברית כמו במקורי?`;

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

    console.log('📋 יוצר קובץ בדיוק כמו המקורי - ללא הגדרות שפה...');

    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // יוצרים תוכן בדיוק כמו במקורי - ללא הגדרות נוספות
    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w14:paraId="13B47B51" w14:textId="77777777" w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
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

    console.log('✅ יצרתי קובץ העתק מדויק:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('🔧 השתמשתי במבנה המדויק של המקורי');
    console.log('   - אותם paraId ו-textId');
    console.log('   - אותם rsidR ו-rsidRDefault');
    console.log('   - ללא הגדרות שפה נוספות');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createExactCopy();