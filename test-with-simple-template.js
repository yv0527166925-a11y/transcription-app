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

function createParagraphsXml(transcription) {
  const paragraphs = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split(/\n\s*\n/)
    .filter(p => p.length > 0);

  let xmlContent = '';
  paragraphs.forEach(paragraph => {
    xmlContent += `
    <w:p w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
  });

  return xmlContent;
}

async function createWithSimpleTemplate() {
  const templatePath = path.join(__dirname, 'template-simple.docx');
  const outPath = path.join(__dirname, 'test-with-simple-template.docx');

  // טקסט חדש משלי
  const myText = `אני קלוד קוד ואני כותב טקסט חדש לגמרי כדי לבדוק את התבנית.

זוהי פסקה שנייה שאני כותב עכשיו. אני רוצה לוודא שהטקסט הזה מופיע במסמך.

פסקה שלישית ואחרונה לבדיקה. זה צריך להיות מיושר לימין נכון.`;

  try {
    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);
    let documentXml = await zip.file('word/document.xml').async('string');

    // נחליף את CONTENT בפסקאות החדשות
    const newContent = createParagraphsXml(myText);
    documentXml = documentXml.replace('CONTENT', newContent);

    zip.file('word/document.xml', documentXml);
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);

    console.log('✅ יצרתי מסמך עם התבנית הפשוטה:', outPath);
    console.log('📊 מספר פסקאות:', myText.split(/\n\s*\n/).filter(Boolean).length);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createWithSimpleTemplate();