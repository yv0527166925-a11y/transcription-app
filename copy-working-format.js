const fs = require('fs');
const JSZip = require('jszip');

async function copyWorkingFormat() {
  try {
    console.log('📋 מעתיק מבנה מהקובץ העובד "חזר מהשרת תקין 2"...');

    // קריאת הקובץ העובד
    const workingData = fs.readFileSync('חזר מהשרת תקין 2.docx');
    const workingZip = await JSZip.loadAsync(workingData);
    const workingXml = await workingZip.file('word/document.xml').async('text');

    console.log('🔍 מחלץ מבנה XML מהקובץ העובד...');

    // חילוץ מבנה פסקה עובדת
    const paragraphs = workingXml.match(/<w:p[^>]*>.*?<\/w:p>/gs);
    if (paragraphs && paragraphs.length > 1) {
      console.log('✅ מצאתי מבנה פסקה עובד:');
      const workingParagraph = paragraphs[1]; // פסקה ראשונה של התוכן
      console.log(workingParagraph.substring(0, 400) + '...');

      // יצירת מסמך חדש עם המבנה הזה
      const newDocContent = createNewDocWithWorkingStructure(workingParagraph);

      // כתיבת המסמך החדש
      const newZip = new JSZip();

      // העתקת כל הקבצים מהמסמך העובד
      for (const [relativePath, file] of Object.entries(workingZip.files)) {
        if (relativePath === 'word/document.xml') {
          newZip.file(relativePath, newDocContent);
        } else if (!file.dir) {
          const content = await file.async('nodebuffer');
          newZip.file(relativePath, content);
        }
      }

      const buffer = await newZip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE'
      });

      fs.writeFileSync('מעתק_מבנה_עובד.docx', buffer);
      console.log('✅ נוצר מסמך חדש עם מבנה עובד: מעתק_מבנה_עובד.docx');
    }

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

function createNewDocWithWorkingStructure(workingParagraphTemplate) {
  const testTexts = [
    'בדיקת מבנה עובד - כותרת',
    'זהו טקסט מבחן ראשון. האם הוא מיושר לימין כהלכה?',
    'פסקה שנייה עם פיסוק: נקודות, פסיקים, סימני קריאה! האם זה עובד?',
    'פסקה שלישית לבדיקה סופית. הכל אמור להיראות מושלם עכשיו.'
  ];

  // התחלה בסיסית של המסמך
  let docContent = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>`;

  testTexts.forEach((text, index) => {
    if (index === 0) {
      // כותרת - נשתמש במבנה דומה אבל מוגדל
      docContent += `
<w:p>
  <w:pPr>
    <w:jc w:val="right"/>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
      <w:b/>
      <w:sz w:val="32"/>
    </w:rPr>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
      <w:b/>
      <w:sz w:val="32"/>
    </w:rPr>
    <w:t>${escapeXml(text)}</w:t>
  </w:r>
</w:p>`;
    } else {
      // תוכן - נשתמש במבנה מהקובץ העובד
      docContent += `
<w:p>
  <w:pPr>
    <w:jc w:val="right"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
    </w:rPr>
    <w:t>${escapeXml(text)}</w:t>
  </w:r>
</w:p>`;
    }
  });

  docContent += `
</w:body>
</w:document>`;

  return docContent;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

copyWorkingFormat();