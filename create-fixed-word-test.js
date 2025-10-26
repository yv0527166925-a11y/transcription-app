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

// פונקציה מתוקנת עם יישור לימין וסימני פיסוק
async function createFixedWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating FIXED Word document for: ${cleanName}`);

    const JSZip = require('jszip');
    const templatePath = path.join(__dirname, 'template.docx');

    if (!fs.existsSync(templatePath)) {
      throw new Error('Template not found');
    }

    const templateData = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // נקה את התמלול מהערות מיותרות (כמו רעשי רקע)
    const cleanedTranscription = transcription
      .replace(/\[מוזיקה\]|\[רעש רקע\]|\[צלילים\]|\[רעש\]|\[קולות\]|\[הפסקה\]|\[שקט\]|\[.*?ברור.*?\]/gi, '')
      .replace(/\n{3,}/g, '\n\n') // שמור על מעברי פסקאות קיימים
      .trim();

    // פיצול לפסקאות כפי שה-AI יצר (ללא עיבוד יתר)
    const paragraphs = cleanedTranscription.split(/\n\s*\n/);

    console.log(`📝 Using AI paragraphs as-is: ${paragraphs.length} paragraphs`);

    const paragraphXml = paragraphs.map(p => {
      // נטרל תווים מיוחדים כדי למנוע שגיאות XML
      const escapedText = escapeXml(p.trim());

      // כל פסקה מקבלת XML מלא עם יישור לימין וכיוון RTL
      return `
        <w:p>
          <w:pPr>
            <w:jc w:val="right"/>
            <w:bidi w:val="1"/>
            <w:textDirection w:val="rl"/>
            <w:spacing w:after="240"/>
            <w:rPr>
              <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
              <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
              <w:sz w:val="24"/>
              <w:rtl/>
            </w:rPr>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
              <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
              <w:sz w:val="24"/>
              <w:rtl/>
            </w:rPr>
            <w:t>${escapedText}</w:t>
          </w:r>
        </w:p>`;
    }).join('');

    // כותרת מתוקנת עם יישור לימין
    const titleXml = `
      <w:p>
        <w:pPr>
          <w:jc w:val="right"/>
          <w:bidi w:val="1"/>
          <w:textDirection w:val="rl"/>
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
            <w:rtl/>
          </w:rPr>
          <w:t>${escapeXml(cleanName)}</w:t>
        </w:r>
      </w:p>`;

    // החלף את מזהי המיקום בתבנית בתוכן האמיתי
    docXml = docXml.replace('REPLACETITLE', '');
    docXml = docXml.replace('REPLACECONTENT', titleXml + paragraphXml);

    // תיקון הגדרות שפה - החלפת כל הגדרה של ערבית לעברית
    docXml = docXml
      .replace(/w:lang w:val="ar-SA"/g, 'w:lang w:val="he-IL"')
      .replace(/w:lang w:eastAsia="ar-SA"/g, 'w:lang w:eastAsia="he-IL"')
      .replace(/w:lang w:bidi="ar-SA"/g, 'w:lang w:bidi="he-IL"')
      .replace(/w:lang w:val="ar"/g, 'w:lang w:val="he-IL"')
      .replace(/w:lang w:eastAsia="ar"/g, 'w:lang w:eastAsia="he-IL"')
      .replace(/w:lang w:bidi="ar"/g, 'w:lang w:bidi="he-IL"');

    // יצירת ZIP חדש
    const newZip = new JSZip();
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, docXml);
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

    console.log(`✅ FIXED Word document created with ${paragraphs.length} paragraphs (RTL + proper punctuation)`);
    return buffer;

  } catch (error) {
    console.error('❌ Error creating fixed Word document:', error);
    throw error;
  }
}

// טקסט הדוגמה עם סימני פיסוק
const sampleTranscription = `שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. האם אנחנו באמת מוכנים להתמודד עם זה? אני מאמין שכן, אבל זה דורש מאמץ רב.

בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. "זו הזדמנות זהב", כפי שאמר חברי אתמול. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.

אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה! רגע של בהירות מוחלטת שבו הכל הסתדר במקום. "עכשיו אני מבין", אמרתי לעצמי באותו רגע מכונן.

השאלה החשובה היא: מה אנחנו עושים עם ההבנה הזו? איך אנחנו מתרגמים את זה לפעולה קונקרטית? כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום!`;

async function createTestWordFiles() {
  try {
    console.log('🧪 Creating comparison Word documents...');

    // 1. קובץ עם השיטה המתוקנת
    const fixedWordBuffer = await createFixedWordDocument(sampleTranscription, 'fixed-test-sample.mp3', 5);
    const fixedOutputPath = path.join(__dirname, 'FIXED-method-output.docx');
    fs.writeFileSync(fixedOutputPath, fixedWordBuffer);

    console.log('✅ Documents created successfully!');
    console.log('📁 FIXED version (with RTL + punctuation):', fixedOutputPath);
    console.log('');
    console.log('🔍 Compare these files:');
    console.log('❌ current-method-output.docx (old method - broken paragraphs, no RTL)');
    console.log('✅ FIXED-method-output.docx (new method - AI paragraphs preserved, RTL, punctuation)');
    console.log('');
    console.log('📝 Notice how the FIXED version:');
    console.log('  - Preserves the 4 original AI paragraphs instead of breaking them');
    console.log('  - Has proper right-to-left alignment');
    console.log('  - Displays punctuation marks correctly (!, ?, "", :)');

  } catch (error) {
    console.error('❌ Error creating test Word files:', error);
  }
}

if (require.main === module) {
  createTestWordFiles();
}

module.exports = { createTestWordFiles };