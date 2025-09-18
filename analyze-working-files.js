const fs = require('fs');
const JSZip = require('jszip');

async function analyzeWorkingFiles() {
  try {
    const files = [
      'חזר מהשרת תקין 1.docx',
      'חזר מהשרת תקין 2.docx'
    ];

    for (const fileName of files) {
      console.log(`\n📋 מנתח קובץ: ${fileName}`);
      console.log('=' .repeat(50));

      const data = fs.readFileSync(fileName);
      const zip = await JSZip.loadAsync(data);
      const docXml = await zip.file('word/document.xml').async('text');

      // חילוץ הטקסט
      const textMatches = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
      console.log(`📝 מספר אלמנטי טקסט: ${textMatches.length}`);

      // הצגת הטקסט המלא
      const allText = textMatches.map(match => match.replace(/<[^>]+>/g, '')).join(' ');
      console.log(`📄 אורך הטקסט: ${allText.length} תווים`);

      // בדיקת מבנה פסקאות
      const paragraphs = docXml.match(/<w:p[^>]*>.*?<\/w:p>/gs) || [];
      console.log(`📄 מספר פסקאות: ${paragraphs.length}`);

      // בדיקת הגדרות RTL
      const rtlSettings = docXml.match(/<w:bidi[^\/]*\/>/g) || [];
      console.log(`➡️ הגדרות RTL: ${rtlSettings.length}`);

      // בדיקת הגדרות פונט
      const fontSettings = docXml.match(/<w:rFonts[^>]*>/g) || [];
      console.log(`🔤 הגדרות פונט: ${fontSettings.length}`);
      if (fontSettings.length > 0) {
        console.log('   דוגמאות פונט:', fontSettings.slice(0, 2));
      }

      // בדיקת סימני פיסוק
      const punctuation = allText.match(/[.,!?;:]/g) || [];
      console.log(`📝 סימני פיסוק: ${punctuation.length}`);

      // בדיקת רווחים לפני/אחרי פיסוק
      const spacingIssues = {
        beforeComma: (allText.match(/[א-ת] ,/g) || []).length,
        afterComma: (allText.match(/,[^ ]/g) || []).length,
        beforeDot: (allText.match(/[א-ת] \./g) || []).length,
        afterDot: (allText.match(/\.[^ ]/g) || []).length
      };
      console.log('📏 רווחים סביב פיסוק:', spacingIssues);

      // הצגת דוגמת XML של פסקה ראשונה
      if (paragraphs.length > 0) {
        console.log('\n🔍 מבנה XML של פסקה ראשונה:');
        const firstParagraph = paragraphs[0].substring(0, 500);
        console.log(firstParagraph + (paragraphs[0].length > 500 ? '...' : ''));
      }

      // הצגת דוגמת הטקסט הראשונה
      console.log('\n📖 דוגמת הטקסט הראשונה (100 תווים):');
      console.log(`"${allText.substring(0, 100)}..."`);
    }

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

analyzeWorkingFiles();