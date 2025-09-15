const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function testFontApproaches() {
  const testText = `זהו טקסט בדיקה לגודל פונט. אנחנו בודקים דרכים שונות להגדיר פונט גדול יותר.`;

  console.log(`📄 Testing different font size approaches`);

  // ניסיון 1: עם px במקום pt
  console.log('🔄 Test 1: Using px instead of pt');
  const html1 = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
      <head><meta charset="UTF-8"><title>פונט px</title></head>
      <body style="direction: rtl; text-align: right; font-family: Arial; font-size: 20px;" lang="he-IL">
        <h1 style="font-size: 28px;">כותרת עם px</h1>
        <p style="font-size: 20px;">${testText}</p>
      </body>
    </html>
  `;

  const buffer1 = await HTMLtoDOCX(html1, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-Font-PX.docx', buffer1);

  // ניסיון 2: עם font-size באפשרויות
  console.log('🔄 Test 2: Using fontSize in options');
  const html2 = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
      <head><meta charset="UTF-8"><title>פונט אפשרויות</title></head>
      <body style="direction: rtl; text-align: right; font-family: Arial;" lang="he-IL">
        <h1>כותרת עם אפשרויות</h1>
        <p>${testText}</p>
      </body>
    </html>
  `;

  const buffer2 = await HTMLtoDOCX(html2, null, {
    lang: 'he-IL',
    locale: 'he-IL',
    fontSize: 16,
    font: 'Arial'
  });
  fs.writeFileSync('Test-Font-Options.docx', buffer2);

  // ניסיון 3: עם em
  console.log('🔄 Test 3: Using em units');
  const html3 = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
      <head><meta charset="UTF-8"><title>פונט em</title></head>
      <body style="direction: rtl; text-align: right; font-family: Arial; font-size: 1.5em;" lang="he-IL">
        <h1 style="font-size: 2em;">כותרת עם em</h1>
        <p style="font-size: 1.5em;">${testText}</p>
      </body>
    </html>
  `;

  const buffer3 = await HTMLtoDOCX(html3, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-Font-EM.docx', buffer3);

  // ניסיון 4: עם Word-specific CSS
  console.log('🔄 Test 4: Using Word-specific CSS');
  const html4 = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>פונט Word</title>
        <style>
          body { font-family: Arial; font-size: 16pt; direction: rtl; text-align: right; }
          h1 { font-size: 22pt; font-weight: bold; }
          p { font-size: 16pt; margin-bottom: 12pt; }
        </style>
      </head>
      <body lang="he-IL">
        <h1>כותרת עם Word CSS</h1>
        <p>${testText}</p>
      </body>
    </html>
  `;

  const buffer4 = await HTMLtoDOCX(html4, null, { lang: 'he-IL', locale: 'he-IL' });
  fs.writeFileSync('Test-Font-Word-CSS.docx', buffer4);

  console.log('✅ All font tests completed! Check the 4 files to see which works best:');
  console.log('   - Test-Font-PX.docx (using px)');
  console.log('   - Test-Font-Options.docx (using options)');
  console.log('   - Test-Font-EM.docx (using em)');
  console.log('   - Test-Font-Word-CSS.docx (using CSS style block)');
}

testFontApproaches();