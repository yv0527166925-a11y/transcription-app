const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function extractRTLSettings() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('🔍 מחפש הגדרות RTL בקובץ הטוב...');

    // נבדוק את ההגדרות של הפסקאות
    const paragraphMatches = documentXml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g);
    if (paragraphMatches) {
      console.log(`\n📊 מצאתי ${paragraphMatches.length} פסקאות`);

      // נבדוק את הפסקה הראשונה
      const firstParagraph = paragraphMatches[0];
      console.log('\n🔍 פסקה ראשונה:');
      console.log(firstParagraph.substring(0, 500) + '...');

      // נחפש הגדרות ספציפיות
      const hasJc = firstParagraph.includes('<w:jc w:val="right"/>');
      const hasBidi = firstParagraph.includes('<w:bidi');
      const hasRtl = firstParagraph.includes('<w:rtl');
      const hasLang = firstParagraph.includes('w:lang');

      console.log('\n✅ הגדרות שמצאתי:');
      console.log('יישור לימין (jc):', hasJc);
      console.log('דו-כיווני (bidi):', hasBidi);
      console.log('RTL:', hasRtl);
      console.log('שפה:', hasLang);
    }

    // נבדוק גם את ההגדרות של המסמך כולו
    console.log('\n🔍 בודק הגדרות כלליות...');
    const hasDocumentBidi = documentXml.includes('<w:bidi');
    const hasDocumentRtl = documentXml.includes('<w:rtl');
    console.log('מסמך דו-כיווני:', hasDocumentBidi);
    console.log('מסמך RTL:', hasDocumentRtl);

    // נשמור חלק מהXML לניתוח
    console.log('\n💾 שומר דוגמה מה-XML...');
    const sampleXml = documentXml.substring(0, 2000);
    fs.writeFileSync('sample-xml.txt', sampleXml);
    console.log('נשמר ב-sample-xml.txt');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

extractRTLSettings();