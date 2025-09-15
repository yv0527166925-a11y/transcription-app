const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function testPunctuationDebug() {
  console.log(`📄 Testing different punctuation spacing approaches`);

  // ניסיון 1: ללא רווחים כלל
  console.log('🔄 Test 1: No spacing processing at all');
  const text1 = `זהו טקסט ללא עיבוד רווחים.המילים והפסיקים,הנקודות!והסימנים?צריכים להיות צמודים.`;

  const html1 = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head><meta charset="UTF-8"><title>ללא רווחים</title></head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <p dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px;">${text1}</p>
      </body>
    </html>
  `;

  const buffer1 = await HTMLtoDOCX(html1, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-No-Spacing.docx', buffer1);

  // ניסיון 2: רגקס מחוזק יותר
  console.log('🔄 Test 2: Stronger regex approach');
  let text2 = `זהו טקסט עם רווחים לפני הפסיקים , והנקודות . וסימני קריאה ! ושאלות ?`;

  // רגקס מחוזק יותר
  text2 = text2
    .replace(/\s+([.,!?:])/g, '$1')     // הסר כל רווח לפני פיסוק
    .replace(/([.,!?:])\s+/g, '$1 ')    // רווח יחיד אחרי פיסוק
    .replace(/\s{2,}/g, ' ')            // רווחים כפולים לרווח יחיד
    .trim();

  console.log('Text after regex:', text2);

  const html2 = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head><meta charset="UTF-8"><title>רגקס מחוזק</title></head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <p dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px;">${text2}</p>
      </body>
    </html>
  `;

  const buffer2 = await HTMLtoDOCX(html2, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-Strong-Regex.docx', buffer2);

  // ניסיון 3: עם non-breaking space
  console.log('🔄 Test 3: Using HTML entities');
  let text3 = `זהו טקסט עם ישיי HTML לפיסוק`;
  text3 = text3.replace(/([א-ת]+)([.,!?:])/g, '$1$2'); // צמוד פיסוק למילה עברית
  text3 += '&nbsp;עם רווח קשיח.';

  const html3 = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head><meta charset="UTF-8"><title>HTML entities</title></head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <p dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px;">${text3}</p>
      </body>
    </html>
  `;

  const buffer3 = await HTMLtoDOCX(html3, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-HTML-Entities.docx', buffer3);

  console.log('✅ Debug tests completed! Check the 3 files to see which works best:');
  console.log('   - Test-No-Spacing.docx (no processing)');
  console.log('   - Test-Strong-Regex.docx (stronger regex)');
  console.log('   - Test-HTML-Entities.docx (HTML entities)');
}

testPunctuationDebug();