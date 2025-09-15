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

    // פצל לפסקאות - גם על בסיס שורות ריקות וגם על בסיס אורך
    let sections = cleanedText.split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);

    // אם יש רק פסקה אחת ארוכה, חלק אותה למשפטים
    if (sections.length === 1 && sections[0].length > 800) {
      const longText = sections[0];
      const sentences = longText.split(/(?<=[.!?])\s+/);
      sections = [];
      let currentSection = '';

      sentences.forEach(sentence => {
        if (currentSection.length + sentence.length > 400 && currentSection.length > 0) {
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

    // בנה HTML עם הגדרות RTL נכונות וחלוקה לפסקאות
    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      // תיקון בעיות פיסוק ורווחים
      combinedSection = combinedSection
        .replace(/([א-ת])\.([א-ת])/g, '$1 $2')    // תקן נקודות בין מילים עבריות צמודות
        .replace(/([א-ת]),([א-ת])/g, '$1, $2')   // תקן פסיקים בין מילים עבריות צמודות
        .replace(/\s+([.,!?:])/g, '$1')           // הסר רווחים לפני סימני פיסוק
        .replace(/([.,!?:])\s+/g, '$1&nbsp;')     // החלף רווח אחרי פיסוק ב-&nbsp;
        .replace(/\s{2,}/g, ' ')                  // רווחים כפולים לרווח יחיד
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

    console.log(`✅ Word document created successfully for: ${cleanName}`);
    return buffer;

  } catch (error) {
    console.error('Error creating Word document:', error);
    throw error;
  }
}

async function testParagraphAndDotsFix() {
  console.log(`📄 Testing paragraph separation and dots fix`);

  // בדיקה 1: טקסט ארוך ללא שורות ריקות (בעיית פסקאות)
  const longText = `זהו טקסט ארוך מאוד ללא חלוקה לפסקאות שאמור להתחלק אוטומטיט למשפטים נפרדים. המשפט הזה ממשיך את הטקסט הארוך. זהו משפט נוסף באותו טקסט רצוף. המשפט הזה גם כן חלק מהטקסט הארוך. עוד משפט בטקסט הארוך הזה. המשפט הזה ממשיך את הסדרה. זהו משפט נוסף שאמור לגרום לחלוקה לפסקה חדשה. המשפט הזה במחצית השנייה. עוד משפט בטקסט הארוך. המשפט הזה קרוב לסוף. זהו המשפט האחרון בטקסט הארוך הזה שבודק חלוקה לפסקאות.`;

  console.log('🔄 Test 1: Long text without line breaks');
  const buffer1 = await createWordDocument(longText, "טקסט_ארוך_ללא_פסקאות.mp3", 180);
  fs.writeFileSync('Test-Long-Text-Paragraphs.docx', buffer1);

  // בדיקה 2: טקסט עם נקודות בין מילים צמודות
  const textWithDotIssues = `זהו.טקסט עם.בעיות של.נקודות בין,מילים צמודות. כאן.יש עוד.דוגמאות של.בעיות דומות. המילים.האלה צריכות.להיות מופרדות.נכון.`;

  console.log('🔄 Test 2: Text with dots between adjacent words');
  const buffer2 = await createWordDocument(textWithDotIssues, "בעיות_נקודות.mp3", 180);
  fs.writeFileSync('Test-Dots-Fix.docx', buffer2);

  // בדיקה 3: שילוב של שתי הבעיות
  const combinedIssues = `זהו.טקסט שמשלב.את שתי הבעיות יחד. הוא ארוך.ולא מחולק לפסקאות. בנוסף יש.בו נקודות בין.מילים צמודות שצריכות.תיקון. המשפט הזה.ממשיך את הבעיות. עוד.משפט עם נקודות.בעייתיות. זהו משפט.נוסף בטקסט.הארוך. המשפט הזה.קרוב לסוף הבדיקה. זהו המשפט.האחרון עם כל.הבעיות המשולבות.יחד.`;

  console.log('🔄 Test 3: Combined issues - long text + dot problems');
  const buffer3 = await createWordDocument(combinedIssues, "בעיות_משולבות.mp3", 180);
  fs.writeFileSync('Test-Combined-Issues.docx', buffer3);

  console.log('✅ All tests completed! Check:');
  console.log('   - Test-Long-Text-Paragraphs.docx (paragraph separation)');
  console.log('   - Test-Dots-Fix.docx (dots between words)');
  console.log('   - Test-Combined-Issues.docx (both issues)');
}

testParagraphAndDotsFix();