const fs = require('fs');
const path = require('path');

// פונקציה לחיפוש ומחיקת הכותרת האוטומטית
async function findAndRemoveTitle() {
  try {
    console.log('🔍 Searching for automatic title in document...');

    const JSZip = require('jszip');
    const perfectTemplatePath = path.join(__dirname, 'perfect-template.docx');

    if (!fs.existsSync(perfectTemplatePath)) {
      console.log('❌ Perfect template not found');
      return;
    }

    // טעינת התבנית
    const templateData = fs.readFileSync(perfectTemplatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    console.log('📄 Analyzing document structure...');

    // חיפוש אחר כל הפסקאות
    const paragraphMatches = docXml.match(/<w:p[^>]*>.*?<\/w:p>/gs);
    if (paragraphMatches) {
      console.log(`Found ${paragraphMatches.length} paragraphs`);

      console.log('\n📝 All paragraphs content:');
      paragraphMatches.forEach((paragraph, i) => {
        // חילוץ הטקסט מהפסקה
        const textMatches = paragraph.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
        if (textMatches) {
          const texts = textMatches.map(match =>
            match.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, '$1')
          );
          const fullText = texts.join(' ').trim();

          if (fullText && fullText !== 'REPLACECONTENT') {
            console.log(`${i + 1}: "${fullText}"`);

            // בדיקה אם זו הכותרת האוטומטית
            if (fullText.includes('תומלל על די אלף בוט') ||
                fullText.includes('transcribed') ||
                fullText.includes('Generated') ||
                fullText.includes('תמלול') ||
                fullText.includes('בוט')) {
              console.log(`   ^^^ 🎯 FOUND AUTOMATIC TITLE! Paragraph ${i + 1}`);
            }
          }
        }
      });
    }

    // חיפוש ספציפי אחר הכותרת
    console.log('\n🎯 Searching specifically for title patterns...');

    // דפוסים שונים לחיפוש הכותרת
    const titlePatterns = [
      /תומלל על די אלף בוט/g,
      /תמלול אוטומטי/g,
      /Generated.*?AI/g,
      /transcribed.*?bot/g,
      /אלף בוט/g
    ];

    let foundTitles = false;
    titlePatterns.forEach((pattern, i) => {
      const matches = docXml.match(pattern);
      if (matches) {
        console.log(`Pattern ${i + 1} found ${matches.length} times: ${matches}`);
        foundTitles = true;
      }
    });

    if (!foundTitles) {
      console.log('🤔 No obvious title patterns found. Let me check header/footer...');

      // בדיקת header ו-footer
      const files = Object.keys(zip.files);
      console.log('📁 Document files:', files.filter(f => f.includes('header') || f.includes('footer')));
    }

    // עכשיו ננסה למחוק את הכותרת בכמה דרכים
    console.log('\n🗑️ Attempting to remove automatic titles...');

    let originalXml = docXml;

    // שיטה 1: מחיקת פסקאות ראשונות שמכילות טקסט חשוד
    docXml = docXml.replace(/<w:p[^>]*>.*?(?:תומלל|תמלול|Generated|transcribed|אלף בוט).*?<\/w:p>/gsi, '');

    // שיטה 2: מחיקת פסקאות ריקות או עם רווחים
    docXml = docXml.replace(/<w:p[^>]*>\s*<w:pPr[^>]*>.*?<\/w:pPr>\s*<\/w:p>/gs, '');

    // שיטה 3: מחיקת פסקאות עם styling מיוחד (כותרות)
    docXml = docXml.replace(/<w:p[^>]*>\s*<w:pPr>.*?<w:b\/>.*?<\/w:pPr>.*?<\/w:p>/gs, '');

    if (originalXml !== docXml) {
      console.log('✅ Found and removed automatic title content');
    } else {
      console.log('⚠️ No automatic title found to remove');
    }

    // יצירת template חדש נקי
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

    fs.writeFileSync('super-clean-template.docx', buffer);
    console.log('✅ Super clean template created: super-clean-template.docx');

    // בדיקה עם טקסט חדש
    await testSuperCleanTemplate();

  } catch (error) {
    console.error('❌ Error finding and removing title:', error);
  }
}

// בדיקת התבנית הסופר נקייה
async function testSuperCleanTemplate() {
  try {
    console.log('\n🧪 Testing super clean template...');

    const JSZip = require('jszip');
    const superCleanPath = path.join(__dirname, 'super-clean-template.docx');

    const templateData = fs.readFileSync(superCleanPath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // טקסט דוגמה
    const sampleParagraphs = [
      'שלום וברכה! זהו טקסט דוגמה ללא כותרת אוטומטית.',
      'הפסקה השנייה עם פיסוק נכון: "ציטוט מושלם" וסימני שאלה?',
      'פסקה שלישית עם סימני קריאה! ונקודתיים: כמו כאן.',
      'הפסקה האחרונה בדוגמה זו מראה שהכל עובד כמו שצריך!'
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

    fs.writeFileSync('SUPER-CLEAN-FINAL.docx', buffer);

    console.log('✅ Super clean final test created!');
    console.log('📁 File: SUPER-CLEAN-FINAL.docx');
    console.log('🔍 This should be completely clean with no automatic title');

  } catch (error) {
    console.error('❌ Error testing super clean template:', error);
  }
}

if (require.main === module) {
  findAndRemoveTitle();
}

module.exports = { findAndRemoveTitle };