const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function testLanguageFixV3() {
  const testTranscription = `זהו משפט ראשון בתמלול הבדיקה עם הגדרות שפה מתקדמות.

זהו משפט שני שבא אחרי פסקה ריקה. אנחנו בודקים פורמטים שונים של הגדרת שפה.

וזה משפט שלישי. אנחנו מנסים פתרונות שונים לבעיית השפה ב-html-to-docx.`;

  const filename = "בדיקה_שפה_v3.mp3";

  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Testing different language configuration formats`);

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

    // ניסיון 1: בלי אפשרויות כלל
    console.log('🔄 Test 1: No language options');
    const htmlString1 = `
      <!DOCTYPE html>
      <html lang="he-IL" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>תמלול - ללא אפשרויות</title>
        </head>
        <body style="direction: rtl; text-align: right; font-family: Arial;" lang="he-IL">
          <h1>${cleanName} - ללא אפשרויות</h1>
          <div>${contentHtml}</div>
        </body>
      </html>
    `;

    const buffer1 = await HTMLtoDOCX(htmlString1);
    fs.writeFileSync('Test-No-Options.docx', buffer1);
    console.log('✅ Created: Test-No-Options.docx');

    // ניסיון 2: רק אפשרויות בסיסיות
    console.log('🔄 Test 2: Basic options only');
    const htmlString2 = `
      <!DOCTYPE html>
      <html lang="he-IL" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>תמלול - אפשרויות בסיסיות</title>
        </head>
        <body style="direction: rtl; text-align: right; font-family: Arial;" lang="he-IL">
          <h1>${cleanName} - אפשרויות בסיסיות</h1>
          <div>${contentHtml}</div>
        </body>
      </html>
    `;

    const buffer2 = await HTMLtoDOCX(htmlString2, null, {
      orientation: 'portrait',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
    });
    fs.writeFileSync('Test-Basic-Options.docx', buffer2);
    console.log('✅ Created: Test-Basic-Options.docx');

    // ניסיון 3: פורמט אחר לשפה
    console.log('🔄 Test 3: Different language format');
    const buffer3 = await HTMLtoDOCX(htmlString2, null, {
      lang: 'he-IL',
      locale: 'he-IL'
    });
    fs.writeFileSync('Test-Different-Lang-Format.docx', buffer3);
    console.log('✅ Created: Test-Different-Lang-Format.docx');

    console.log('🎯 All tests completed! Check the three files to see if any has Hebrew language setting.');

  } catch (error) {
    console.error('Error creating Word document:', error);
  }
}

testLanguageFixV3();