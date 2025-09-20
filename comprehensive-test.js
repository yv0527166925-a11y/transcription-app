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

function fixHebrewPunctuation(text) {
  text = text.replace(/\."/g, '".');
  text = text.replace(/,"/g, '",');
  text = text.replace(/;"/g, '";');
  return text;
}

// הפונקציה המדויקת שנשלב בשרת
async function createWordDocumentFromTemplate(transcription, filename, templatePath) {
  try {
    const outPath = path.join(__dirname, filename);

    // מתקנים פיסוק
    transcription = fixHebrewPunctuation(transcription);

    // מחלקים לפסקאות
    const paragraphs = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n\s*\n/)
      .filter(p => p.length > 0);

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    // מתקנים הגדרות שפה
    if (zip.files['word/styles.xml']) {
      let stylesXml = await zip.file('word/styles.xml').async('string');
      stylesXml = stylesXml.replace(/w:val="ar-SA"/g, 'w:val="he-IL"');
      stylesXml = stylesXml.replace(/w:eastAsia="ar-SA"/g, 'w:eastAsia="he-IL"');
      stylesXml = stylesXml.replace(/w:bidi="ar-SA"/g, 'w:bidi="he-IL"');
      zip.file('word/styles.xml', stylesXml);
    }

    let documentXml = await zip.file('word/document.xml').async('string');

    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w14:paraId="13B47B51" w14:textId="77777777" w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
        </w:rPr>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
    });

    const newDocumentXml = documentXml.substring(0, bodyStart) +
                          newBodyContent +
                          documentXml.substring(bodyEnd);

    zip.file('word/document.xml', newDocumentXml);

    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);

    return {
      success: true,
      filePath: outPath,
      paragraphCount: paragraphs.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// בדיקות מקיפות
async function runComprehensiveTests() {
  console.log('🧪 מתחיל בדיקות מקיפות לפני שילוב בשרת...');
  console.log('=' .repeat(60));

  const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
  let testsPassed = 0;
  let testsTotal = 0;

  // בדיקה 1: טקסט פשוט
  testsTotal++;
  console.log('\n📝 בדיקה 1: טקסט פשוט');
  const simpleText = `זהו טקסט פשוט לבדיקה.

פסקה שנייה עם "ציטוטים".

פסקה שלישית ואחרונה.`;

  const result1 = await createWordDocumentFromTemplate(simpleText, 'test1-simple.docx', templatePath);
  if (result1.success && result1.paragraphCount === 3) {
    console.log('✅ בדיקה 1 עברה - 3 פסקאות');
    testsPassed++;
  } else {
    console.log('❌ בדיקה 1 נכשלה');
  }

  // בדיקה 2: טקסט עם פיסוק מורכב
  testsTotal++;
  console.log('\n📝 בדיקה 2: פיסוק מורכב');
  const complexText = `טקסט עם "ציטוט ונקודה." ועם "ציטוט ופסיק," וגם עם "ציטוט ונקודה-פסיק;".

בדיקה נוספת: "השאלה נשארת?" ו"הקריאה גם!".

סוף הבדיקה.`;

  const result2 = await createWordDocumentFromTemplate(complexText, 'test2-punctuation.docx', templatePath);
  if (result2.success && result2.paragraphCount === 3) {
    console.log('✅ בדיקה 2 עברה - פיסוק מורכב');
    testsPassed++;
  } else {
    console.log('❌ בדיקה 2 נכשלה');
  }

  // בדיקה 3: טקסט ארוך (כמו מהמשתמש)
  testsTotal++;
  console.log('\n📝 בדיקה 3: טקסט ארוך');
  const longText = `פסקה ראשונה ארוכה עם הרבה תוכן ומילים רבות כדי לבדוק שהמערכת מתמודדת גם עם טקסטים ארוכים יותר ולא רק עם משפטים קצרים.

פסקה שנייה עם ציטוטים: "זה ציטוט ארוך שמכיל הרבה מילים ואני רוצה לוודא שהוא מתנהג נכון." ועוד המשך לפסקה.

פסקה שלישית עם תווים מיוחדים: (סוגריים), [סוגריים מרובעים], {סוגריים מסולסלים}, "ציטוטים", 'מירכאות יחיד', וגם סימני פיסוק שונים: נקודה. פסיק, נקודה-פסיק; שאלה? וקריאה!

פסקה רביעית ואחרונה לסיום הבדיקה.`;

  const result3 = await createWordDocumentFromTemplate(longText, 'test3-long.docx', templatePath);
  if (result3.success && result3.paragraphCount === 4) {
    console.log('✅ בדיקה 3 עברה - טקסט ארוך');
    testsPassed++;
  } else {
    console.log('❌ בדיקה 3 נכשלה');
  }

  // בדיקה 4: טקסט עם שורות ריקות מרובות
  testsTotal++;
  console.log('\n📝 בדיקה 4: שורות ריקות מרובות');
  const multiLineText = `פסקה ראשונה.




פסקה שנייה אחרי שורות ריקות רבות.


פסקה שלישית.`;

  const result4 = await createWordDocumentFromTemplate(multiLineText, 'test4-multiline.docx', templatePath);
  if (result4.success && result4.paragraphCount === 3) {
    console.log('✅ בדיקה 4 עברה - שורות ריקות מרובות');
    testsPassed++;
  } else {
    console.log('❌ בדיקה 4 נכשלה');
  }

  // בדיקה 5: טקסט ריק
  testsTotal++;
  console.log('\n📝 בדיקה 5: טקסט ריק');
  const emptyText = '';

  const result5 = await createWordDocumentFromTemplate(emptyText, 'test5-empty.docx', templatePath);
  if (!result5.success) {
    console.log('✅ בדיקה 5 עברה - טיפול נכון בטקסט ריק');
    testsPassed++;
  } else if (result5.success && result5.paragraphCount === 0) {
    console.log('✅ בדיקה 5 עברה - 0 פסקאות');
    testsPassed++;
  } else {
    console.log('❌ בדיקה 5 נכשלה');
  }

  // סיכום
  console.log('\n' + '=' .repeat(60));
  console.log(`🏁 סיכום בדיקות: ${testsPassed}/${testsTotal} עברו`);

  if (testsPassed === testsTotal) {
    console.log('🎉 כל הבדיקות עברו בהצלחה!');
    console.log('✅ המערכת מוכנה לשילוב בשרת');
    console.log('📁 קבצי הבדיקה נוצרו: test1-simple.docx, test2-punctuation.docx, test3-long.docx, test4-multiline.docx');
  } else {
    console.log('⚠️  יש בדיקות שנכשלו - יש לבדוק לפני השילוב');
  }

  return { passed: testsPassed, total: testsTotal };
}

runComprehensiveTests();