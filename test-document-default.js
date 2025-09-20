const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

// 🟢 פונקציה שמחזירה פסקה בעברית
function makeHebrewParagraph(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    style: "HebrewParagraph",
    spacing: { after: 240, line: 360 },
    children: [
      new TextRun({
        text: text,
        font: { name: "Arial" },
        size: 24,
        rightToLeft: true,
        rtl: true,
        language: "he-IL",
        languageComplexScript: "he-IL"
      })
    ]
  });
}

// 🟢 פיצול טקסט לפסקאות
function processTranscriptionContent(transcription) {
  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sections = cleanedText
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  return sections.map(section => makeHebrewParagraph(section));
}

const testText = `פרשת השבוע שנקראה בעזרת השם, בחוקותי, שנת תשע"ד.

הפרשה המסיימת את חומש תורת כהנים, והיינו רוצים לעמוד על נקודה אחת בפרשה, בפסוק הראשון בפרשה, ולחבר אותה לבעל ההילולה של יום ראשון, ל"ג בעומר, רבי שמעון בר יוחאי. נתחיל בביאור הפסוק:

אם בחוקותי תלכו ואת מצוותי תשמרו ועשיתם אותם. מבטיח הקדוש ברוך הוא הבטחות של הנהגה מיוחדת מאוד בהנהגת הטבע.`;

async function createTestDocument() {
  try {
    const paragraphs = processTranscriptionContent(testText);

    const doc = new Document({
      sections: [{
        properties: { rtl: true },
        children: paragraphs
      }],
      styles: {
        default: {
          document: {
            run: {
              rtl: true,
              rightToLeft: true,
              language: "he-IL",
              font: "Arial",
              size: 24
            },
            paragraph: {
              alignment: AlignmentType.RIGHT,
              bidirectional: true
            }
          }
        },
        paragraphStyles: [
          {
            id: "HebrewParagraph",
            name: "Hebrew Paragraph",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              rtl: true,
              rightToLeft: true,
              language: "he-IL",
              font: "Arial",
              size: 24
            },
            paragraph: {
              alignment: AlignmentType.RIGHT,
              bidirectional: true
            }
          }
        ]
      }
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = './test-document-default.docx';
    fs.writeFileSync(outputPath, buffer);

    console.log('✅ קובץ עם ברירת מחדל RTL נוצר:', outputPath);
    console.log('📊 מספר פסקאות:', testText.split(/\n\s*\n/).filter(Boolean).length);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createTestDocument();