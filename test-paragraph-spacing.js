const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function testParagraphSpacing() {
  // טקסט ארוך לבדיקת פסקאות
  const testTranscription = `זהו המשפט הראשון בפסקה הראשונה של הבדיקה. המשפט הזה אמור להיות חלק מפסקה ראשונה. זהו המשפט השלישי באותה פסקה.

זהו המשפט הראשון בפסקה השנייה. הפסקה הזו צריכה להיות נפרדת מהפסקה הקודמת עם רווח ברור. זהו המשפט השלישי בפסקה השנייה.

זהו טקסט ארוך מאוד שאמור להתחלק לכמה פסקאות קטנות יותר כדי שיהיה נוח לקריאה. המשפט הזה המשך של אותו קטע ארוך. המשפט הזה גם כן חלק מאותו קטע ארוך. המשפט הזה ממשיך את הקטע הארוך. המשפט הזה גם ממשיך את הקטע הארוך. המשפט הזה הוא האחרון בקטע הארוך הזה שאמור להתחלק לפסקאות.

זהו משפט קצר בפסקה נפרדת.`;

  const filename = "בדיקת_פסקאות.mp3";

  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Testing paragraph spacing improvements`);

    // נקה את הטקסט
    let cleanedText = testTranscription
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

      // חלק לפסקאות קצרות יותר אם הטקסט ארוך
      if (combinedSection.length > 400) {
        const sentences = combinedSection.split(/(?<=[.!?])\s+/);
        let currentParagraph = '';

        sentences.forEach(sentence => {
          if (currentParagraph.length + sentence.length > 400 && currentParagraph.length > 0) {
            contentHtml += `<p style="margin-bottom: 16pt; line-height: 1.7; text-align: right;"><span lang="he-IL" xml:lang="he-IL">${currentParagraph.trim()}</span></p>`;
            currentParagraph = sentence + ' ';
          } else {
            currentParagraph += sentence + ' ';
          }
        });

        if (currentParagraph.trim()) {
          contentHtml += `<p style="margin-bottom: 16pt; line-height: 1.7; text-align: right;"><span lang="he-IL" xml:lang="he-IL">${currentParagraph.trim()}</span></p>`;
        }
      } else {
        contentHtml += `<p style="margin-bottom: 16pt; line-height: 1.7; text-align: right;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
      }
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
        <body style="direction: rtl; text-align: right; font-family: Arial, 'Times New Roman', serif; font-size: 14pt; line-height: 1.6; writing-mode: horizontal-tb; margin: 20pt;" lang="he-IL" xml:lang="he-IL">
          <h1 style="font-size: 20pt; font-weight: bold; margin-bottom: 24pt; margin-top: 0;">${cleanName}</h1>
          <div style="font-size: 14pt; line-height: 1.8;">
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

    fs.writeFileSync('Test-Paragraph-Spacing.docx', buffer);
    console.log(`✅ Test completed! Check Test-Paragraph-Spacing.docx for paragraph spacing`);

  } catch (error) {
    console.error('Error creating Word document:', error);
  }
}

testParagraphSpacing();