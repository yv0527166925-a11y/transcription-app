const fs = require('fs');
const path = require('path');

// פונקציה למחיקת כותרת מה-header
async function removeHeaderTitle() {
  try {
    console.log('🔍 Checking and removing title from header...');

    const JSZip = require('jszip');
    const perfectTemplatePath = path.join(__dirname, 'perfect-template.docx');

    if (!fs.existsSync(perfectTemplatePath)) {
      console.log('❌ Perfect template not found');
      return;
    }

    // טעינת התבנית
    const templateData = fs.readFileSync(perfectTemplatePath);
    const zip = await JSZip.loadAsync(templateData);

    // בדיקת ה-header
    const headerFile = zip.file('word/header1.xml');
    if (headerFile) {
      let headerXml = await headerFile.async('text');
      console.log('📄 Header content found:');
      console.log(headerXml.substring(0, 500) + '...');

      // חיפוש אחר הכותרת ב-header
      const titlePatterns = [
        /תומלל על די אלף בוט/g,
        /תמלול אוטומטי/g,
        /Generated.*?AI/g,
        /transcribed.*?bot/g,
        /אלף בוט/g
      ];

      let foundInHeader = false;
      titlePatterns.forEach((pattern, i) => {
        const matches = headerXml.match(pattern);
        if (matches) {
          console.log(`🎯 Found title pattern ${i + 1} in header: ${matches}`);
          foundInHeader = true;
        }
      });

      if (foundInHeader) {
        console.log('🗑️ Removing title from header...');

        // מחיקת הכותרת מה-header
        titlePatterns.forEach(pattern => {
          headerXml = headerXml.replace(pattern, '');
        });

        // מחיקת פסקאות ריקות שנוצרו
        headerXml = headerXml.replace(/<w:p[^>]*>\s*<w:pPr[^>]*>.*?<\/w:pPr>\s*<\/w:p>/gs, '');
        headerXml = headerXml.replace(/<w:p[^>]*>\s*<\/w:p>/gs, '');

        console.log('✅ Title removed from header');
      } else {
        console.log('ℹ️ No title found in header, making header completely empty...');

        // יצירת header ריק לחלוטין
        headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
</w:hdr>`;
      }

      // יצירת ZIP חדש עם header מעודכן
      const newZip = new JSZip();
      for (const [relativePath, file] of Object.entries(zip.files)) {
        if (relativePath === 'word/header1.xml') {
          newZip.file(relativePath, headerXml);
        } else if (!file.dir) {
          const content = await file.async('nodebuffer');
          newZip.file(relativePath, content);
        }
      }

      const buffer = await newZip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      fs.writeFileSync('no-header-template.docx', buffer);
      console.log('✅ Template without header title created: no-header-template.docx');

      // בדיקה עם טקסט
      await testNoHeaderTemplate();

    } else {
      console.log('ℹ️ No header file found');
    }

  } catch (error) {
    console.error('❌ Error removing header title:', error);
  }
}

// בדיקת התבנית ללא header
async function testNoHeaderTemplate() {
  try {
    console.log('\n🧪 Testing template without header title...');

    const JSZip = require('jszip');
    const noHeaderPath = path.join(__dirname, 'no-header-template.docx');

    const templateData = fs.readFileSync(noHeaderPath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // טקסט דוגמה
    const sampleParagraphs = [
      'שלום וברכה! זהו מסמך ללא כותרת אוטומטית כלל.',
      'הפסקה השנייה: "עם גרשיים נכונות" ושאלה?',
      'פסקה שלישית עם קריאה! ונקודתיים: מושלם.',
      'הפסקה האחרונה מוכיחה שהכל עובד בצורה מושלמת!'
    ];

    // החלפת התוכן
    docXml = docXml.replace(/<w:t>REPLACECONTENT<\/w:t>/g, () => {
      if (sampleParagraphs.length > 0) {
        const text = sampleParagraphs.shift();
        return `<w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // יצירת קובץ בדיקה סופי
    const newZip = new JSZip();
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, docXml);
      } else if (!file.dir) {
        const content = await file.async('nodebuffer');
        newZip.file(relativePath, content);
      }
    }

    const buffer = await newZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    fs.writeFileSync('FINAL-NO-HEADER-TITLE.docx', buffer);

    console.log('✅ Final document without header title created!');
    console.log('📁 File: FINAL-NO-HEADER-TITLE.docx');
    console.log('🔍 This should have absolutely NO automatic title anywhere!');

  } catch (error) {
    console.error('❌ Error testing no header template:', error);
  }
}

if (require.main === module) {
  removeHeaderTitle();
}

module.exports = { removeHeaderTitle };