const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function debugParagraphStructure() {
  console.log(`📄 Debugging paragraph structure`);

  // טקסט ארוך לבדיקה
  const longText = `זהו טקסט ארוך מאוד ללא חלוקה לפסקאות שאמור להתחלק אוטומטיט למשפטים נפרדים. המשפט הזה ממשיך את הטקסט הארוך. זהו משפט נוסף באותו טקסט רצוף. המשפט הזה גם כן חלק מהטקסט הארוך. עוד משפט בטקסט הארוך הזה. המשפט הזה ממשיך את הסדרה. זהו משפט נוסף שאמור לגרום לחלוקה לפסקה חדשה. המשפט הזה במחצית השנייה. עוד משפט בטקסט הארוך. המשפט הזה קרוב לסוף. זהו המשפט האחרון בטקסט הארוך הזה שבודק חלוקה לפסקאות.`;

  // נקה את הטקסט
  let cleanedText = longText.trim();

  // פצל לפסקאות
  let sections = cleanedText.split(/\n\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0);

  console.log('Initial sections:', sections.length);
  console.log('First section length:', sections[0]?.length);

  // אם יש רק פסקה אחת ארוכה, חלק אותה למשפטים
  if (sections.length === 1 && sections[0].length > 800) {
    console.log('🔄 Splitting long section into sentences...');
    const longTextSection = sections[0];
    const sentences = longTextSection.split(/(?<=[.!?])\s+/);
    console.log('Found sentences:', sentences.length);

    sections = [];
    let currentSection = '';

    sentences.forEach((sentence, index) => {
      console.log(`Sentence ${index + 1}: "${sentence.substring(0, 50)}..." (length: ${sentence.length})`);

      if (currentSection.length + sentence.length > 400 && currentSection.length > 0) {
        console.log(`📝 Creating new section (current length: ${currentSection.length})`);
        sections.push(currentSection.trim());
        currentSection = sentence + ' ';
      } else {
        currentSection += sentence + ' ';
      }
    });

    if (currentSection.trim()) {
      sections.push(currentSection.trim());
    }
  }

  console.log('Final sections count:', sections.length);
  sections.forEach((section, index) => {
    console.log(`Section ${index + 1} length: ${section.length}`);
    console.log(`Section ${index + 1} preview: "${section.substring(0, 100)}..."`);
  });

  // בנה HTML פשוט יותר
  let contentHtml = '';
  sections.forEach((section, index) => {
    console.log(`Adding section ${index + 1} to HTML`);
    contentHtml += `<p style="margin-bottom: 20px; text-align: right; direction: rtl;">${section}</p>\n`;
  });

  console.log('Generated HTML structure:');
  console.log(contentHtml.substring(0, 500) + '...');

  const htmlString = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>Debug Paragraphs</title>
      </head>
      <body style="direction: rtl; text-align: right; font-family: Arial; font-size: 15px;">
        <h1 style="text-align: right; direction: rtl;">בדיקת פסקאות</h1>
        ${contentHtml}
      </body>
    </html>
  `;

  const buffer = await HTMLtoDOCX(htmlString, null, {
    lang: 'he-IL',
    locale: 'he-IL'
  });

  fs.writeFileSync('Debug-Paragraph-Structure.docx', buffer);
  console.log('✅ Debug file created: Debug-Paragraph-Structure.docx');
}

debugParagraphStructure();