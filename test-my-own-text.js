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

function processTranscriptionForTemplate(transcription) {
  const paragraphs = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split(/\n\s*\n/)
    .filter(p => p.length > 0);

  const RLM = '&#x200F;';
  let xmlContent = '';
  paragraphs.forEach(paragraph => {
    xmlContent += `
      <w:p>
        <w:pPr>
          <w:jc w:val="right"/>
          <w:bidi/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
            <w:sz w:val="24"/>
            <w:lang w:val="he-IL"/>
            <w:rtl/>
          </w:rPr>
          <w:t xml:space="preserve">${RLM}${escapeXml(paragraph)}</w:t>
        </w:r>
      </w:p>`;
  });

  return xmlContent;
}

async function createWithTemplate() {
  const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
  const outPath = path.join(__dirname, 'test-my-own-text.docx');
  const title = 'טקסט חדש לבדיקה';

  // טקסט חדש שאני כותב עכשיו
  const transcription = `זהו טקסט חדש לגמרי שאני כותב עכשיו כדי לבדוק את התבנית. אני רוצה לוודא שהיישור לימין עובד כמו שצריך ושהפסקאות מחולקות נכון.

זוהי הפסקה השנייה במסמך הזה. כאן אני בודק שהפיצול לפי שורות ריקות עובד נכון. זה אמור להיות טקסט שונה לגמרי ממה שהיה קודם.

פסקה שלישית כדי לוודא שהטכנולוגיה עובדת. אני מקווה שהפעם המסמך ייווצר עם הטקסט הנכון ועם יישור לימין.

פסקה רביעית ואחרונה. אם זה עובד, נוכל להמשיך עם הטקסט שהמשתמש ביקש.`;

  try {
    const content = processTranscriptionForTemplate(transcription);
    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);
    let documentXml = await zip.file('word/document.xml').async('string');

    documentXml = documentXml.replace(/TITLE/g, escapeXml(title));
    const contentParaRegex = /<w:p[^>]*>[\s\S]*?CONTENT[\s\S]*?<\/w:p>/;
    if (contentParaRegex.test(documentXml)) {
      documentXml = documentXml.replace(contentParaRegex, content);
    } else {
      documentXml = documentXml.replace(/CONTENT/g, content);
    }

    zip.file('word/document.xml', documentXml);
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);
    console.log('✅ יצרתי מסמך עם טקסט חדש משלי:', outPath);
    console.log('📊 מספר פסקאות:', transcription.split(/\n\s*\n/).filter(Boolean).length);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createWithTemplate();