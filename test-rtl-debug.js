const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

async function createTestDocument() {
  try {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "זהו טקסט בעברית שצריך להיות מיושר לימין",
                font: "Arial",
                size: 24,
                rightToLeft: true
              })
            ],
            alignment: AlignmentType.RIGHT,
            bidirectional: true
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "זוהי פסקה שנייה בעברית",
                font: "Arial",
                size: 24,
                rightToLeft: true
              })
            ],
            alignment: AlignmentType.RIGHT,
            bidirectional: true
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = './test-rtl-debug.docx';
    fs.writeFileSync(outputPath, buffer);

    console.log('✅ קובץ בדיקת RTL נוצר:', outputPath);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createTestDocument();