const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

// פונקציה פשוטה לבדיקה
function processTranscriptionContent(transcription) {
  const paragraphs = [];

  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sections = cleanedText
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  sections.forEach(section => {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: section,
          font: { name: "Arial" },
          size: 24
        })
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 240, line: 360 }
    }));
  });

  return paragraphs;
}

const testText = `פרשת השבוע שנקראה בעזרת השם, בחוקותי, שנת תשע"ד.

הפרשה המסיימת את חומש תורת כהנים, והיינו רוצים לעמוד על נקודה אחת בפרשה, בפסוק הראשון בפרשה, ולחבר אותה לבעל ההילולה של יום ראשון, ל"ג בעומר, רבי שמעון בר יוחאי. נתחיל בביאור הפסוק:

אם בחוקותי תלכו ואת מצוותי תשמרו ועשיתם אותם. מבטיח הקדוש ברוך הוא הבטחות של הנהגה מיוחדת מאוד בהנהגת הטבע.`;

async function createTestDocument() {
  try {
    const doc = new Document({
      sections: [{
        children: processTranscriptionContent(testText)
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = './test-simple-rtl.docx';
    fs.writeFileSync(outputPath, buffer);

    console.log('✅ קובץ בדיקה פשוט נוצר:', outputPath);
    console.log('📊 מספר פסקאות:', testText.split(/\n\s*\n/).filter(Boolean).length);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createTestDocument();