const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

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

    // בנה HTML עם הגדרות RTL נכונות וחלוקה לפסקאות
    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      // תיקון רווחים - סימני פיסוק צמודים למילים בעברית
      combinedSection = combinedSection
        .replace(/\s+([.,!?:])/g, '$1')           // הסר רווחים לפני סימני פיסוק
        .replace(/([.,!?:])\s+/g, '$1&nbsp;')     // החלף רווח אחרי פיסוק ב-&nbsp;
        .replace(/\s{2,}/g, ' ')                  // רווחים כפולים לרווח יחיד
        .trim();

      if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
        combinedSection += '.';
      }

      // חלק לפסקאות קצרות יותר אם הטקסט ארוך
      if (combinedSection.length > 400) {
        const sentences = combinedSection.split(/(?<=[.!?])\s+/);
        let currentParagraph = '';

        sentences.forEach(sentence => {
          if (currentParagraph.length + sentence.length > 400 && currentParagraph.length > 0) {
            contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${currentParagraph.trim()}</span></p>`;
            currentParagraph = sentence + ' ';
          } else {
            currentParagraph += sentence + ' ';
          }
        });

        if (currentParagraph.trim()) {
          contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${currentParagraph.trim()}</span></p>`;
        }
      } else {
        contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
      }
    });

    const htmlString = `
      <!DOCTYPE html>
      <html lang="he-IL" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="language" content="Hebrew">
          <meta http-equiv="Content-Language" content="he-IL">
          <title>תמלול</title>
        </head>
        <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
          <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">${cleanName}</h1>
          <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8;">
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

// בדיקה סופית
async function testFinalServerPunctuation() {
  const testTranscription = `זהו תמלול בדיקה סופי עם פיסוק מתוקן: פסיקים, נקודות. סימני קריאה! שאלות? ונקודתיים: שכולם צריכים להיות צמודים למילים.

זהו המשפט השני בפסקה נפרדת, עם פיסוק נוסף. האם הפתרון עובד? אני מקווה שכן! זה חשוב מאוד.

זהו המשפט האחרון: בבדיקה הסופית. גודל הפונט צריך להיות 15px, והכל מיושר RTL בעברית.`;

  const buffer = await createWordDocument(testTranscription, "בדיקה_סופית_פיסוק.mp3", 180);
  fs.writeFileSync('Test-Final-Server-Punctuation.docx', buffer);
  console.log('🎯 Final server test completed! Check Test-Final-Server-Punctuation.docx');
}

testFinalServerPunctuation();