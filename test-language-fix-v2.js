const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function testLanguageFixV2() {
  const testTranscription = `זהו משפט ראשון בתמלול הבדיקה.

זהו משפט שני שבא אחרי פסקה ריקה. המשפט הזה יותר ארוך מהמשפט הקודם.

וזה משפט שלישי באחר פסקה נוספת. אנחנו בודקים שהפונקציה החדשה עובדת נכון ויוצרת מסמך וורד עם יישור RTL נכון ושפה עברית.`;

  const filename = "בדיקה_שפה_v2.mp3";

  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document with enhanced Hebrew settings for: ${cleanName}`);

    let cleanedText = testTranscription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const sections = cleanedText.split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);

    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      combinedSection = combinedSection
        .replace(/\s*\.\s*/g, '. ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*!\s*/g, '! ')
        .replace(/\s*\?\s*/g, '? ')
        .replace(/\s*:\s*/g, ': ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
        combinedSection += '.';
      }

      contentHtml += `<p><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
    });

    const htmlString = `
      <!DOCTYPE html>
      <html lang="he-IL" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="language" content="Hebrew">
          <meta http-equiv="Content-Language" content="he-IL">
          <meta name="DC.language" content="he-IL">
          <title>תמלול</title>
        </head>
        <body style="direction: rtl; text-align: right; font-family: Arial, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; writing-mode: horizontal-tb;" lang="he-IL" xml:lang="he-IL">
          <h1 style="font-size: 18pt; font-weight: bold; margin-bottom: 24pt;" lang="he-IL">${cleanName}</h1>
          <div style="font-size: 12pt; line-height: 1.8;" lang="he-IL">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    const buffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      language: 'he-IL',
      defaultLanguage: 'he-IL',
      docx: {
        language: 'he-IL',
        rtl: true
      }
    });

    fs.writeFileSync('Test-Language-Fix-V2.docx', buffer);
    console.log(`✅ Word document created successfully with enhanced Hebrew settings`);

  } catch (error) {
    console.error('Error creating Word document:', error);
  }
}

testLanguageFixV2();