const fs = require('fs');
const path = require('path');

// העתקת הפונקציות מהשרת המעודכן
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

// פונקציה שמדמה את הלוגיקה המעודכנת של השרת
async function testServerWordDocument(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);
    console.log(`📄 Creating Word document with UPDATED server logic for: ${cleanName}`);

    const JSZip = require('jszip');
    const templatePath = path.join(__dirname, 'template.docx');

    if (!fs.existsSync(templatePath)) {
      throw new Error('Template not found!');
    }

    // טעינת התבנית החדשה
    const templateData = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // עיבוד התמלול עם תיקון פיסוק מתקדם (הקוד הישן שנשאר)
    let cleanedText = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      // תיקונים טכניים מינימליים בלבד
      .replace(/\.([א-ת])/g, '. $1')
      .replace(/!([א-ת])/g, '! $1')
      .replace(/\?([א-ת])/g, '? $1')
      .replace(/,([א-ת])/g, ', $1')
      .replace(/:([א-ת])/g, ': $1')
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // חלוקה לשורות - כל משפט בשורה נפרדת (הקוד הישן)
    const allSentences = cleanedText
      .split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0)
      .flatMap(section => {
        return section
          .split(/([.!?]\s+)/)
          .reduce((acc, part, index, array) => {
            if (index % 2 === 0) {
              const sentence = part.trim();
              const punctuation = array[index + 1] || '';
              if (sentence && sentence.length > 3) {
                acc.push(sentence + punctuation.trim());
              }
            }
            return acc;
          }, []);
      });

    const sections = allSentences;

    // כותרת (הקוד הישן)
    const titleParagraph = `
      <w:p w14:paraId="6A1F55DC" w14:textId="77777777" w:rsidR="0056303E" w:rsidRPr="0056303E" w:rsidRDefault="0056303E" w:rsidP="0056303E">
        <w:pPr>
          <w:spacing w:after="400"/>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:sz w:val="32"/>
            <w:b/>
          </w:rPr>
        </w:pPr>
        <w:r w:rsidRPr="0056303E">
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:sz w:val="32"/>
            <w:b/>
          </w:rPr>
          <w:t>${escapeXml(cleanName)}</w:t>
        </w:r>
      </w:p>`;

    // פונקציה ישנה שעדיין בשרת
    function createShortParagraphs(text) {
      const words = text.split(/\s+/);
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

    let fullText = sections.join(' ').trim();

    // ניקוי רעש רקע
    fullText = fullText
      .replace(/\[מוזיקה\]/gi, '')
      .replace(/\[רעש רקע\]/gi, '')
      .replace(/\[צלילים\]/gi, '')
      .replace(/\[רעש\]/gi, '')
      .replace(/\[קולות\]/gi, '')
      .replace(/\[הפסקה\]/gi, '')
      .replace(/\[שקט\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const shortParagraphs = createShortParagraphs(fullText);

    // יצירת XML לכל פסקה קצרה
    const paragraphElements = shortParagraphs.map(paragraph => `
      <w:p w14:paraId="346CE71B" w14:textId="424A57EE" w:rsidR="009550AA" w:rsidRPr="009F17F4" w:rsidRDefault="0056303E" w:rsidP="0056303E">
        <w:pPr>
          <w:jc w:val="right"/>
          <w:bidi w:val="1"/>
          <w:textDirection w:val="rl"/>
          <w:spacing w:after="240"/>
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
            <w:rtl/>
          </w:rPr>
        </w:pPr>
        <w:r w:rsidRPr="0056303E">
          <w:rPr>
            <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
            <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
            <w:rtl/>
          </w:rPr>
          <w:t>${escapeXml(paragraph)}</w:t>
        </w:r>
      </w:p>`);

    const newParagraphs = [titleParagraph, ...paragraphElements];

    // החלפת התוכן בתבנית החדשה - זה החלק שהתעדכן!
    let paragraphIndex = 0;
    let newDocXml = docXml.replace(/<w:t>REPLACECONTENT<\/w:t>/g, () => {
      if (paragraphIndex < shortParagraphs.length) {
        const text = shortParagraphs[paragraphIndex];
        paragraphIndex++;
        return `<w:t>${escapeXml(text)}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // תיקון הגדרות שפה
    newDocXml = newDocXml
      .replace(/w:lang w:val="ar-SA"/g, 'w:lang w:val="he-IL"')
      .replace(/w:lang w:eastAsia="ar-SA"/g, 'w:lang w:eastAsia="he-IL"')
      .replace(/w:lang w:bidi="ar-SA"/g, 'w:lang w:bidi="he-IL"');

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

    console.log(`✅ Server-style Word document created with ${shortParagraphs.length} paragraphs`);
    return buffer;

  } catch (error) {
    console.error('❌ Error creating server-style Word document:', error);
    throw error;
  }
}

// בדיקה עם טקסט שמדמה ג'מיני
async function testServerFixes() {
  try {
    console.log('🧪 Testing server fixes with Gemini-style text...');

    // טקסט שמדמה פלט ג'מיני עם פסקאות יפות
    const geminiText = `שלום וברכה! זהו תמלול שמדמה פלט מג'מיני עם פסקאות מסודרות. הפסקה הזאת מכילה כמה משפטים שקשורים זה לזה ומתארים רעיון אחד. בעבר הפונקציה הישנה הייתה מפרקת את זה למשפטים נפרדים, אבל עכשיו זה אמור להישאר יחד.

הפסקה השנייה מכילה נושא אחר לגמרי. "זו דוגמה של ציטוט חשוב", כפי שמישהו אמר פעם. האם התיקונים שלנו עובדים כמו שצריך? אני מקווה שכן, כי השקענו בזה הרבה מאמץ ועבודה.

זוהי הפסקה השלישית. היא מדגימה איך ג'מיני מחלק טקסט באופן טבעי לרעיונות נפרדים. כל פסקה מכילה מחשבה שלמה וקוהרנטית שלא צריכה להיפרק יותר.

הפסקה האחרונה מסכמת את הבדיקה: אם הכל עובד נכון, נראה את הטקסט הזה בקובץ Word עם פסקאות יפות וסימני פיסוק צמודים למילים!`;

    const wordBuffer = await testServerWordDocument(geminiText, 'test-server-fixes.mp3', 5);

    fs.writeFileSync('SERVER-FIXES-TEST.docx', wordBuffer);

    console.log('✅ Server fixes test created!');
    console.log('📁 File: SERVER-FIXES-TEST.docx');
    console.log('🔍 This shows how the updated server processes text');
    console.log('📝 Check if:');
    console.log('   - Paragraphs are properly formatted');
    console.log('   - Punctuation is attached to words');
    console.log('   - RTL alignment works');
    console.log('   - No automatic title appears');

  } catch (error) {
    console.error('❌ Error testing server fixes:', error);
  }
}

if (require.main === module) {
  testServerFixes();
}

module.exports = { testServerFixes };