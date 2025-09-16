const fs = require('fs');
const JSZip = require('jszip');

async function checkPunctuation() {
  try {
    console.log('🔍 בודק סימני פיסוק בקובץ החדש...');

    const data = fs.readFileSync('בדיקת_פיסוק_מתוקן.docx');
    const zip = await JSZip.loadAsync(data);
    const docXml = await zip.file('word/document.xml').async('text');

    // חילוץ הטקסט
    const textMatches = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
    console.log('📝 טקסט שנמצא בקובץ:');
    textMatches.forEach((match, index) => {
      const text = match.replace(/<[^>]+>/g, '');
      if (text.trim() && text.length > 5) {
        console.log(`  ${index + 1}. ${text}`);
      }
    });

    // בדיקת בעיות פיסוק ספציפיות
    const allText = textMatches.map(match => match.replace(/<[^>]+>/g, '')).join(' ');

    console.log('\n🔍 בדיקת בעיות פיסוק:');

    // בדיקה לפסיקים צמודים (רק אם אין רווח אחר הפסיק)
    const commaIssues = allText.match(/[א-ת],[^\s]/g) || [];
    console.log('  פסיקים צמודים למילים:', commaIssues.length, commaIssues.slice(0, 3));

    // בדיקה לנקודות צמודות (רק אם אין רווח אחרי הנקודה)
    const dotIssues = allText.match(/[א-ת]\.[^\s]/g) || [];
    console.log('  נקודות צמודות למילים:', dotIssues.length, dotIssues.slice(0, 3));

    // בדיקה לרווחים כפולים
    const spaceIssues = allText.match(/ {2,}/g) || [];
    console.log('  רווחים כפולים:', spaceIssues.length);

    // הדפסת הטקסט המלא לבדיקה
    console.log('\n📄 הטקסט המלא:');
    console.log('"' + allText + '"');

    // בדיקה כללית
    if (commaIssues.length > 0 || dotIssues.length > 0 || spaceIssues.length > 0) {
      console.log('\n❌ נמצאו בעיות פיסוק שצריכות תיקון');
      return false;
    } else {
      console.log('\n✅ סימני הפיסוק נראים תקינים');
      return true;
    }

  } catch (error) {
    console.error('❌ שגיאה:', error);
    return false;
  }
}

checkPunctuation();