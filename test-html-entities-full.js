const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function testHTMLEntitiesFull() {
  console.log(`📄 Testing HTML entities approach with full punctuation`);

  // טקסט עם הרבה סימני פיסוק
  let testText = `זהו טקסט בדיקה עם פסיקים, נקודות. סימני קריאה! שאלות? ונקודתיים: כדי לבדוק את הפיסוק.`;

  console.log('Original text:', testText);

  // גישת HTML entities מחוזקת
  testText = testText
    .replace(/\s+([.,!?:])/g, '$1')           // הסר רווחים לפני פיסוק
    .replace(/([.,!?:])\s+/g, '$1&nbsp;')     // החלף רווח אחרי פיסוק ב-&nbsp;
    .replace(/\s{2,}/g, ' ')                  // רווחים כפולים לרווח יחיד
    .trim();

  console.log('After HTML entities processing:', testText);

  const htmlString = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="language" content="Hebrew">
        <meta http-equiv="Content-Language" content="he-IL">
        <title>בדיקת פיסוק מלא</title>
      </head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">בדיקת פיסוק HTML entities</h1>
        <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8;">
          <p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${testText}</span></p>
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

  fs.writeFileSync('Test-HTML-Entities-Full.docx', buffer);
  console.log(`✅ Test completed! Check Test-HTML-Entities-Full.docx for proper punctuation with &nbsp;`);

  // גם ניסיון עם גישה אחרת - zero-width space
  console.log('🔄 Also testing with zero-width space approach');

  let testText2 = `זהו טקסט נוסף עם פסיקים, נקודות. סימני קריאה! שאלות? ונקודתיים: לבדיקה.`;

  testText2 = testText2
    .replace(/\s+([.,!?:])/g, '$1')           // הסר רווחים לפני פיסוק
    .replace(/([.,!?:])\s+/g, '$1&#8203; ')   // zero-width space אחרי פיסוק
    .replace(/\s{2,}/g, ' ')
    .trim();

  console.log('With zero-width space:', testText2);

  const htmlString2 = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head><meta charset="UTF-8"><title>zero-width space</title></head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <p dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px;">${testText2}</p>
      </body>
    </html>
  `;

  const buffer2 = await HTMLtoDOCX(htmlString2, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-Zero-Width-Space.docx', buffer2);

  console.log('✅ Both tests completed!');
  console.log('   - Test-HTML-Entities-Full.docx (with &nbsp;)');
  console.log('   - Test-Zero-Width-Space.docx (with zero-width space)');
}

testHTMLEntitiesFull();