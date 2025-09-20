const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function checkOriginalLanguage() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('🔍 בודק הגדרות שפה בקובץ המקורי הטוב...');

    // נחפש את הפסקה הראשונה ונראה איך השפה מוגדרת
    const firstPMatch = documentXml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/);
    if (firstPMatch) {
      console.log('\n📋 פסקה ראשונה מהקובץ המקורי:');
      console.log(firstPMatch[0].substring(0, 800) + '...');

      // נחפש הגדרות שפה
      if (firstPMatch[0].includes('w:lang')) {
        console.log('\n✅ יש הגדרת שפה בפסקה הראשונה');
        const langMatch = firstPMatch[0].match(/w:lang[^>]*>/g);
        if (langMatch) {
          console.log('🔤 הגדרות שפה:', langMatch);
        }
      } else {
        console.log('\n❌ אין הגדרת שפה בפסקה הראשונה');
      }

      // נחפש הגדרות rPr
      if (firstPMatch[0].includes('<w:rPr>')) {
        console.log('\n📝 יש הגדרות rPr (run properties)');
        const rPrMatch = firstPMatch[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (rPrMatch) {
          console.log('⚙️ תוכן rPr:', rPrMatch[0]);
        }
      } else {
        console.log('\n❌ אין הגדרות rPr');
      }
    }

    // נבדוק גם הגדרות כלליות במסמך
    console.log('\n🌐 בודק הגדרות כלליות במסמך...');
    const hasDocumentLang = documentXml.includes('w:lang');
    console.log('יש הגדרת שפה כלשהי במסמך:', hasDocumentLang);

    // נשמור דוגמה גדולה יותר לניתוח
    fs.writeFileSync('original-document-sample.xml', documentXml.substring(0, 3000));
    console.log('\n💾 שמרתי דוגמה מהמסמך המקורי ב-original-document-sample.xml');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

checkOriginalLanguage();