const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function testRTLWithFont() {
  const testText = `זהו טקסט בעברית שצריך להיות מיושר לימין. הטקסט הזה חייב להיראות RTL נכון.`;

  console.log(`📄 Testing RTL with different font approaches`);

  // בדיקה 1: px עם RTL מחוזק
  console.log('🔄 Test 1: px with strong RTL');
  const html1 = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="language" content="Hebrew">
        <meta http-equiv="Content-Language" content="he-IL">
        <title>RTL חזק</title>
      </head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 20px;" lang="he-IL">
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 28px;">כותרת RTL</h1>
        <p dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 20px;">${testText}</p>
      </body>
    </html>
  `;

  const buffer1 = await HTMLtoDOCX(html1, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-RTL-Strong.docx', buffer1);

  // בדיקה 2: pt עם RTL (הקוד הישן שעבד)
  console.log('🔄 Test 2: pt with RTL (old working version)');
  const html2 = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="language" content="Hebrew">
        <meta http-equiv="Content-Language" content="he-IL">
        <title>תמלול</title>
      </head>
      <body style="direction: rtl; text-align: right; font-family: Arial, 'Times New Roman', serif; font-size: 16pt; line-height: 1.6; writing-mode: horizontal-tb; margin: 20pt;" lang="he-IL" xml:lang="he-IL">
        <h1 style="font-size: 22pt; font-weight: bold; margin-bottom: 24pt; margin-top: 0;">כותרת pt</h1>
        <div style="font-size: 16pt; line-height: 1.8;">
          <p style="margin-bottom: 16pt; line-height: 1.7; text-align: right;"><span lang="he-IL" xml:lang="he-IL">${testText}</span></p>
        </div>
      </body>
    </html>
  `;

  const buffer2 = await HTMLtoDOCX(html2, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-RTL-PT.docx', buffer2);

  // בדיקה 3: שילוב - pt עם px רק לפונט
  console.log('🔄 Test 3: Mixed - pt margins with px font');
  const html3 = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="language" content="Hebrew">
        <meta http-equiv="Content-Language" content="he-IL">
        <title>תמלול</title>
      </head>
      <body style="direction: rtl; text-align: right; font-family: Arial, 'Times New Roman', serif; font-size: 20px; line-height: 1.6; writing-mode: horizontal-tb; margin: 20pt;" lang="he-IL" xml:lang="he-IL">
        <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 24pt; margin-top: 0;">כותרת מעורב</h1>
        <div style="font-size: 20px; line-height: 1.8;">
          <p style="margin-bottom: 16pt; line-height: 1.7; text-align: right;"><span lang="he-IL" xml:lang="he-IL">${testText}</span></p>
        </div>
      </body>
    </html>
  `;

  const buffer3 = await HTMLtoDOCX(html3, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-RTL-Mixed.docx', buffer3);

  console.log('✅ RTL tests completed! Check:');
  console.log('   - Test-RTL-Strong.docx (px with strong RTL)');
  console.log('   - Test-RTL-PT.docx (original pt version)');
  console.log('   - Test-RTL-Mixed.docx (pt margins, px font)');
}

testRTLWithFont();