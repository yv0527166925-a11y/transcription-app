const fs = require('fs');
const JSZip = require('jszip');

async function analyzePythonWordDocument() {
  try {
    console.log('🔍 מנתח מסמך Word שנוצר ב-Python...');

    const data = fs.readFileSync('בדיקת_פייתון.docx');
    const zip = await JSZip.loadAsync(data);
    const docXml = await zip.file('word/document.xml').async('text');

    // בדיקת הגדרות RTL
    const rtlSettings = docXml.match(/<w:bidi[^\/]*\/>/g) || [];
    console.log(`➡️ הגדרות RTL (bidi): ${rtlSettings.length}`);

    // בדיקת יישור ימין
    const rightAlign = docXml.match(/<w:jc w:val="right"\/>/g) || [];
    console.log(`↩️ יישור ימין: ${rightAlign.length}`);

    // בדיקת כיוון טקסט
    const textDirection = docXml.match(/<w:textDirection[^\/]*\/>/g) || [];
    console.log(`🔄 כיוון טקסט: ${textDirection.length}`);

    // בדיקת פסקאות
    const paragraphs = docXml.match(/<w:p[^>]*>.*?<\/w:p>/gs) || [];
    console.log(`📄 מספר פסקאות: ${paragraphs.length}`);

    // הצגת מבנה של פסקה ראשונה
    if (paragraphs.length > 0) {
      console.log('\n🔍 מבנה XML של פסקה ראשונה:');
      const firstParagraph = paragraphs[0].substring(0, 300);
      console.log(firstParagraph + '...');
    }

    // הצגת מבנה של פסקת תוכן
    if (paragraphs.length > 1) {
      console.log('\n🔍 מבנה XML של פסקת תוכן:');
      const contentParagraph = paragraphs[1].substring(0, 400);
      console.log(contentParagraph + '...');
    }

    console.log('\n📊 סיכום:');
    if (rightAlign.length > 0 || rtlSettings.length > 0) {
      console.log('✅ המסמך מכיל הגדרות RTL/יישור ימין');
    } else {
      console.log('❌ המסמך לא מכיל הגדרות RTL/יישור ימין');
    }

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

analyzePythonWordDocument();