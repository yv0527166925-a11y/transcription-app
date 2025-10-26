// טעינת הפונקציות מהשרת המעודכן
const fs = require('fs');

// העתקת הפונקציות הדרושות
function cleanFilename(filename) {
  return filename.replace(/\.[^/.]+$/, "").replace(/[^א-תa-zA-Z0-9\s]/g, '').trim();
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#39;';
    }
  });
}

// טקסט דוגמה מג'מיני
const geminiTranscription = `שלום וברכה! זהו דוגמה לתמלול שמגיע מג'מיני. הפסקה הזאת צריכה להישמר כפי שהיא, כי ג'מיני כבר חילק אותה לפסקאות בצורה טובה.

הפסקה השנייה מכילה ציטוט: "זה ציטוט חשוב מאוד". היא גם מכילה שאלה חשובה: האם אנחנו מבינים את החשיבות? אני חושב שכן!

זוהי הפסקה השלישית. היא מדגימה שג'מיני יודע לחלק טקסט בצורה הגיונית למחשבות ורעיונות נפרדים.

הפסקה האחרונה מסכמת: כל פסקה צריכה להישאר כפי שהAI יצר אותה!`;

// בדיקה פשוטה של הלוגיקה
function testUpdatedLogic() {
  console.log('🧪 Testing updated server logic...');

  // סימולציה של הלוגיקה החדשה
  const cleanedTranscription = geminiTranscription
    .replace(/\[מוזיקה\]|\[רעש רקע\]|\[צלילים\]|\[רעש\]|\[קולות\]|\[הפסקה\]|\[שקט\]|\[.*?ברור.*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = cleanedTranscription.split(/\n\s*\n/);

  console.log('📝 Original Gemini text split into paragraphs:');
  paragraphs.forEach((p, i) => {
    console.log(`${i + 1}: "${p.substring(0, 80)}..."`);
  });

  // בדיקה שהטקסט יצטמצם נכון לXML
  console.log('\n🔤 Checking XML escaping:');
  paragraphs.forEach((p, i) => {
    const escaped = escapeXml(p);
    if (escaped !== p) {
      console.log(`Paragraph ${i + 1} had special characters that were escaped`);
    }
  });

  console.log(`\n📊 Summary: ${paragraphs.length} paragraphs will be preserved as-is`);
  console.log('✅ This should work with the updated template!');
}

if (require.main === module) {
  testUpdatedLogic();
}

module.exports = { testUpdatedLogic };