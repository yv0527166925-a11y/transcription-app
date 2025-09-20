const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fixHebrewPunctuation(text) {
  text = text.replace(/\."/g, '".');
  text = text.replace(/,"/g, '",');
  text = text.replace(/;"/g, '";');
  return text;
}

async function fixAllLanguageSettings() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-hebrew-language-complete.docx');

    let testText = `בדיקה עם תיקון שפה מלא. השפה צריכה להיות עברית ולא ערבית.

פסקה שנייה: "טקסט עם ציטוטים." שצריך להיראות בעברית.

בדיקה נוספת עם פיסוק: "נקודה." ו"פסיק," ו"נקודה-פסיק;" נכון.

פסקה אחרונה: האם השפה תהיה עברית הפעם?`;

    testText = fixHebrewPunctuation(testText);

    const paragraphs = testText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n\s*\n/)
      .filter(p => p.length > 0);

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    console.log('🔍 בודק את כל הקבצים ב-Word...');
    const files = Object.keys(zip.files);
    console.log('קבצים ב-ZIP:', files.slice(0, 10) + '...');

    // בודקים settings.xml
    if (zip.files['word/settings.xml']) {
      let settingsXml = await zip.file('word/settings.xml').async('string');
      console.log('\n📋 נמצא settings.xml');

      // מחפשים הגדרות שפה בהגדרות
      if (settingsXml.includes('w:lang')) {
        console.log('✅ יש הגדרות שפה ב-settings');
        // מחליפים כל הגדרות ערבית לעברית
        settingsXml = settingsXml.replace(/w:val="ar-SA"/g, 'w:val="he-IL"');
        settingsXml = settingsXml.replace(/w:eastAsia="ar-SA"/g, 'w:eastAsia="he-IL"');
        settingsXml = settingsXml.replace(/w:bidi="ar-SA"/g, 'w:bidi="he-IL"');
        zip.file('word/settings.xml', settingsXml);
        console.log('🔧 תיקנתי הגדרות שפה ב-settings.xml');
      }
    }

    // בודקים styles.xml
    if (zip.files['word/styles.xml']) {
      let stylesXml = await zip.file('word/styles.xml').async('string');
      console.log('\n📋 נמצא styles.xml');

      if (stylesXml.includes('w:lang')) {
        console.log('✅ יש הגדרות שפה ב-styles');
        stylesXml = stylesXml.replace(/w:val="ar-SA"/g, 'w:val="he-IL"');
        stylesXml = stylesXml.replace(/w:eastAsia="ar-SA"/g, 'w:eastAsia="he-IL"');
        stylesXml = stylesXml.replace(/w:bidi="ar-SA"/g, 'w:bidi="he-IL"');
        zip.file('word/styles.xml', stylesXml);
        console.log('🔧 תיקנתי הגדרות שפה ב-styles.xml');
      }
    }

    // עוכבים את document.xml
    let documentXml = await zip.file('word/document.xml').async('string');

    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w14:paraId="13B47B51" w14:textId="77777777" w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
        </w:rPr>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
    });

    const newDocumentXml = documentXml.substring(0, bodyStart) +
                          newBodyContent +
                          documentXml.substring(bodyEnd);

    zip.file('word/document.xml', newDocumentXml);

    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);

    console.log('\n✅ יצרתי קובץ עם תיקון שפה מלא:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('🔧 תיקונים שבוצעו:');
    console.log('   - תיקון settings.xml');
    console.log('   - תיקון styles.xml');
    console.log('   - הוספת הגדרת שפה עברית במסמך');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

fixAllLanguageSettings();