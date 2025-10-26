const fs = require('fs');
const path = require('path');

// העתקה של הפונקציות הנדרשות מהשרת
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

// פונקציה מקוצרת של createWordDocument (רק החלק שיוצר את הפסקאות)
async function createCurrentWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document (current method) for: ${cleanName}`);

    const JSZip = require('jszip');
    const templatePath = path.join(__dirname, 'template.docx');

    if (!fs.existsSync(templatePath)) {
      throw new Error('Template not found');
    }

    const templateData = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // העיבוד הנוכחי - עם createShortParagraphs
    function createShortParagraphs(text) {
      const words = text.replace(/\n\s*\n/g, ' ').split(/\s+/);
      const paragraphs = [];
      let currentParagraph = '';
      let wordCount = 0;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        currentParagraph += word + ' ';
        wordCount++;

        const endsWithPunctuation = word.match(/[.!?]$/);
        const nextWord = i < words.length - 1 ? words[i + 1] : '';

        const shouldBreak =
          wordCount >= 50 ||
          (endsWithPunctuation && wordCount >= 25) ||
          (endsWithPunctuation && wordCount >= 30 && nextWord.match(/^[א-ת]/));

        if (shouldBreak) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
          wordCount = 0;
        }
      }

      if (currentParagraph.trim().length > 0) {
        paragraphs.push(currentParagraph.trim());
      }

      return paragraphs;
    }

    let fullText = transcription
      .replace(/\[מוזיקה\]|\[רעש רקע\]|\[צלילים\]|\[רעש\]|\[קולות\]|\[הפסקה\]|\[שקט\]|\[.*?ברור.*?\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const shortParagraphs = createShortParagraphs(fullText);

    // יצירת XML עם פסקאות מפורקות
    const paragraphElements = shortParagraphs.map(paragraph => `
      <w:p>
        <w:pPr>
          <w:jc w:val="right"/>
          <w:bidi w:val="1"/>
          <w:spacing w:after="240"/>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
            <w:rtl/>
          </w:rPr>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
            <w:rtl/>
          </w:rPr>
          <w:t>${escapeXml(paragraph)}</w:t>
        </w:r>
      </w:p>`);

    // כותרת
    const titleParagraph = `
      <w:p>
        <w:pPr>
          <w:spacing w:after="400"/>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:sz w:val="32"/>
            <w:b/>
          </w:rPr>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:sz w:val="32"/>
            <w:b/>
          </w:rPr>
          <w:t>${escapeXml(cleanName)}</w:t>
        </w:r>
      </w:p>`;

    const newParagraphs = [titleParagraph, ...paragraphElements];

    // החלפת התוכן בתבנית
    let newDocXml = docXml
      .replace(/REPLACETITLE/g, '')
      .replace(/REPLACECONTENT/g, '');

    newDocXml = newDocXml.replace('</w:body>', newParagraphs.join('') + '</w:body>');

    // יצירת ZIP חדש
    const newZip = new JSZip();
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, newDocXml);
      } else if (!file.dir) {
        const content = await file.async('nodebuffer');
        newZip.file(relativePath, content);
      }
    }

    const buffer = await newZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    console.log(`✅ Current method Word document created with ${shortParagraphs.length} paragraphs`);
    return buffer;

  } catch (error) {
    console.error('❌ Error creating current Word document:', error);
    throw error;
  }
}

// טקסט הדוגמה
const sampleTranscription = `שלום וברכה, היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. אנחנו צריכים להתייחס לזה עכשיו, ברגע הזה, כי הזמן עובר והמצב לא מחכה לאף אחד.

בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.

אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה, רגע של בהירות מוחלטת שבו הכל הסתדר במקום.

השאלה החשובה היא מה אנחנו עושים עם ההבנה הזו. איך אנחנו מתרגמים את זה לפעולה קונקרטית. כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל.`;

async function createTestWordFile() {
  try {
    console.log('🧪 Creating actual Word document to demonstrate the problem...');

    const wordBuffer = await createCurrentWordDocument(sampleTranscription, 'test-sample.mp3', 5);

    const outputPath = path.join(__dirname, 'current-method-output.docx');
    fs.writeFileSync(outputPath, wordBuffer);

    console.log('✅ Word document created successfully!');
    console.log('📁 Saved to:', outputPath);
    console.log('🔍 Open this file to see how the current method breaks up paragraphs');
    console.log('📝 Originally: 4 nice paragraphs from AI');
    console.log('❌ Result: Multiple broken paragraphs due to createShortParagraphs');

  } catch (error) {
    console.error('❌ Error creating test Word file:', error);
  }
}

if (require.main === module) {
  createTestWordFile();
}

module.exports = { createTestWordFile };