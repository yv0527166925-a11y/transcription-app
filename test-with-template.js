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
  const outPath = path.join(__dirname, 'test-with-correct-template.docx');
  const title = 'פרשת בחוקותי';

  const transcription = `פרשת השבוע שנקראה בעזרת השם, בחוקותי, שנת תשע"ד.

הפרשה המסיימת את חומש תורת כהנים, והיינו רוצים לעמוד על נקודה אחת בפרשה, בפסוק הראשון בפרשה, ולחבר אותה לבעל ההילולה של יום ראשון, ל"ג בעומר, רבי שמעון בר יוחאי. נתחיל בביאור הפסוק:

אם בחוקותי תלכו ואת מצוותי תשמרו ועשיתם אותם. מבטיח הקדוש ברוך הוא הבטחות של הנהגה מיוחדת מאוד בהנהגת הטבע.`;

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
    console.log('✅ יצרתי מסמך עם התבנית:', outPath);
    console.log('📊 מספר פסקאות:', transcription.split(/\n\s*\n/).filter(Boolean).length);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createWithTemplate();