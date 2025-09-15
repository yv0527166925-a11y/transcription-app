const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function testPunctuationAndFontFix() {
  // טקסט עם הרבה סימני פיסוק לבדיקה
  const testTranscription = `זהו טקסט בדיקה עם פיסוק: נקודות, פסיקים! סימני קריאה? ושאלות. הפסיקים והנקודות צריכים להיות צמודים למילים.

זהו המשפט השני, עם פסיקים נוספים: כמו כאן. האם הם צמודים? אני מקווה שכן! זה חשוב מאוד.

המשפט הזה בודק גם את גודל הפונט החדש: 15px שאמור להיות כמו 11pt בוורד. זה צריך להיות בגודל נוח לקריאה.`;

  const filename = "בדיקת_פיסוק_ופונט.mp3";

  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Testing punctuation spacing and font size fixes`);

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

      // תיקון רווחים - סימני פיסוק צמודים למילים בעברית
      combinedSection = combinedSection
        .replace(/\s+([.,!?:])/g, '$1')  // הסר רווחים לפני סימני פיסוק
        .replace(/([.,!?:])\s+/g, '$1 ') // רווח יחיד אחרי סימני פיסוק
        .replace(/\s+/g, ' ')            // רווחים כפולים לרווח יחיד
        .trim();

      if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
        combinedSection += '.';
      }

      contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
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

    fs.writeFileSync('Test-Punctuation-Font-Fix.docx', buffer);
    console.log(`✅ Test completed! Check Test-Punctuation-Font-Fix.docx for:`);
    console.log(`   - Proper punctuation spacing (no spaces before punctuation)`);
    console.log(`   - Smaller font size (15px ≈ 11pt)`);

  } catch (error) {
    console.error('Error creating Word document:', error);
  }
}

testPunctuationAndFontFix();