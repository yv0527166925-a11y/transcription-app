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

async function createWithSpecialChars() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'test-special-characters.docx');

    // טקסט חדש משלי עם סוגריים, גרשיים, מירכאות וציטוטים
    const myTextWithSpecialChars = `זהו טקסט בדיקה מיוחד (עם סוגריים) שאני כותב כדי לבדוק איך הקובץ מטפל בתווים מיוחדים. אני רוצה לראות מה קורה עם "מירכאות כפולות" ועם 'מירכאות יחיד'.

הפסקה השנייה מכילה ציטוט: "אמר החכם: זה טקסט לדוגמה." בנוסף, יש כאן סוגריים מרובעים [כמו כאן] וגם סוגריים מסולסלים {כמו אלה}. יש גם פסיק, נקודה, וסימן שאלה?

בפסקה השלישית נבדוק ציטוטים מורכבים: "הרב אמר: 'זהו דבר חשוב' ואז המשיך לדבר." האם זה יוצא טוב? בואו נראה מה קורה עם סימני פיסוק נוספים: נקודותיים, פסיק; ואפילו סימן קריאה!

פסקה רביעית ואחרונה עם עוד בדיקות: (א) רשימה ממוספרת, (ב) עוד פריט ברשימה, וגם "ציטוט בתוך ציטוט של 'מישהו אחר'" לבדיקה מתקדמת. האם הכל יוצא נכון?`;

    // מחלקים לפסקאות לפי שורות ריקות
    const paragraphs = myTextWithSpecialChars
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n\s*\n/)
      .filter(p => p.length > 0);

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);
    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('🗑️ מוחק את כל התוכן הישן...');

    // נמצא את ההתחלה והסוף של הגוף
    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    // ניצור תוכן חדש עם הפסקאות עם התווים המיוחדים
    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
    });

    // נרכיב את המסמך מחדש
    const newDocumentXml = documentXml.substring(0, bodyStart) +
                          newBodyContent +
                          documentXml.substring(bodyEnd);

    zip.file('word/document.xml', newDocumentXml);
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);

    console.log('✅ יצרתי קובץ עם תווים מיוחדים:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('🔍 התווים המיוחדים שנבדקים:');
    console.log('   - סוגריים: ( ) [ ] { }');
    console.log('   - מירכאות: " " \' \'');
    console.log('   - סימני פיסוק: , . ? ! ; :');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createWithSpecialChars();