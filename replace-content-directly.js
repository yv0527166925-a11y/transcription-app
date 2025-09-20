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

async function replaceContentDirectly() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-direct-replacement.docx');

    // הטקסט החדש שלי
    const myText = `זהו טקסט חדש שכותב קלוד קוד.

זוהי פסקה שנייה של הטקסט החדש.

פסקה שלישית ואחרונה לבדיקה.`;

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);
    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('🔍 מחפש את הטקסט הישן...');

    // נחפש את הטקסט הראשון ונחליף אותו
    const oldFirstParagraph = 'פרשת השבוע שנקראה בעזרת השם, בחוקותי, שנת תשע"ד.';
    const newFirstParagraph = 'זהו טקסט חדש שכותב קלוד קוד.';

    if (documentXml.includes(oldFirstParagraph)) {
      console.log('✅ מצאתי את הטקסט הישן, מחליף...');
      documentXml = documentXml.replace(oldFirstParagraph, newFirstParagraph);

      // נחליף עוד כמה חלקים
      documentXml = documentXml.replace('הפרשה המסיימת', 'זוהי פסקה שנייה של הטקסט החדש.');
      documentXml = documentXml.replace('אם בחוקותי תלכו', 'פסקה שלישית ואחרונה לבדיקה.');

      zip.file('word/document.xml', documentXml);
      const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(outPath, outBuffer);

      console.log('✅ יצרתי קובץ עם החלפה ישירה:', outPath);
    } else {
      console.log('❌ לא מצאתי את הטקסט הישן');
    }

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

replaceContentDirectly();