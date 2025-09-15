const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

// העתק מהפונקציה מהשרת
function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function createWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document with HTML-to-DOCX for: ${cleanName}`);

    // נקה את הטקסט
    let cleanedText = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // פצל לפסקאות
    const sections = cleanedText.split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);

    // בנה HTML עם הגדרות RTL נכונות
    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      // תיקון רווחים סביב סימני פיסוק
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
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="language" content="Hebrew">
          <meta http-equiv="Content-Language" content="he-IL">
          <title>תמלול</title>
        </head>
        <body style="direction: rtl; text-align: right; font-family: Arial, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; writing-mode: horizontal-tb;" lang="he-IL" xml:lang="he-IL">
          <h1 style="font-size: 18pt; font-weight: bold; margin-bottom: 24pt;">${cleanName}</h1>
          <div style="font-size: 12pt; line-height: 1.8;">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    const buffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      lang: 'he-IL',
      locale: 'he-IL'
    });

    console.log(`✅ Word document created successfully for: ${cleanName}`);
    return buffer;

  } catch (error) {
    console.error('Error creating Word document:', error);
    throw error;
  }
}

// בדיקה
async function testFinalImplementation() {
  const testTranscription = `זהו תמלול בדיקה סופי לפני השימוש בשרת.

הטקסט הזה צריך להיות מיושר לימין ועם הגדרת שפה עברית.

זה המשפט האחרון בבדיקה. הכל אמור לעבוד מושלם!`;

  const buffer = await createWordDocument(testTranscription, "בדיקה_סופית.mp3", 180);
  fs.writeFileSync('Test-Final-Implementation.docx', buffer);
  console.log('🎯 Final test completed! Check Test-Final-Implementation.docx');
}

testFinalImplementation();