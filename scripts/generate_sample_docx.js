const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
const fs = require('fs');

const sampleParagraphs = [
  'זה טקסט בעברית לדוגמה כדי לבדוק RTL ויישור לימין.',
  'פסקה שנייה עם יישור לימין וכיוון RTL.',
  'מספרים 1, 2, 3 צריכים להופיע מיושרים מימין.'
];

const doc = new Document({
  language: 'he-IL',
  styles: {
    default: {
      document: {
        run: {
          font: 'Arial',
          size: 24,
          rightToLeft: true,
          languageComplexScript: 'he-IL'
        },
        paragraph: {
          alignment: AlignmentType.RIGHT,
          bidirectional: true
        }
      }
    },
    paragraphStyles: [
      {
        id: 'HebrewParagraph',
        name: 'Hebrew Paragraph',
        basedOn: 'Normal',
        run: {
          font: 'Arial',
          size: 24,
          rightToLeft: true,
          languageComplexScript: 'he-IL'
        },
        paragraph: {
          alignment: AlignmentType.RIGHT,
          bidirectional: true
        }
      }
    ]
  },
  sections: [{
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: 'מסמך מבחן RTL',
            bold: true,
            size: 36,
            rightToLeft: true,
            languageComplexScript: 'he-IL'
          })
        ],
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        style: 'HebrewParagraph',
        spacing: { after: 480 }
      }),
      ...sampleParagraphs.map(text => new Paragraph({
        children: [
          new TextRun({
            text,
            rightToLeft: true,
            languageComplexScript: 'he-IL'
          })
        ],
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        style: 'HebrewParagraph',
        spacing: { after: 240 }
      }))
    ]
  }]
});

Packer.toBuffer(doc)
  .then(buffer => {
    fs.writeFileSync('sample_hebrew.docx', buffer);
    console.log('✅ Generated sample_hebrew.docx');
  })
  .catch(error => {
    console.error('❌ Failed to generate sample DOCX:', error);
    process.exit(1);
  });

