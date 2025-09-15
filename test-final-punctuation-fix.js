const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function testFinalPunctuationFix() {
  console.log(`📄 Testing final punctuation fix (correct order)`);

  const testText = `. זהו משפט שמתחיל בנקודה. והכל.צריך להיעשות,נכון וגם"בצורה טובה!`;

  console.log('Original text:', testText);

  let combinedSection = testText.trim();

  // החל את התיקונים בסדר הנכון
  combinedSection = combinedSection
    .replace(/([א-ת])\.([א-ת])/g, '$1 $2')      // תקן נקודות בין מילים עבריות צמודות
    .replace(/([א-ת]),([א-ת])/g, '$1, $2')     // תקן פסיקים בין מילים עבריות צמודות
    .replace(/([א-ת])"([א-ת])/g, '$1" $2')     // תקן גרשיים בין מילים עבריות צמודות
    .replace(/([א-ת])'([א-ת])/g, '$1\' $2')    // תקן גרש בין מילים עבריות צמודות
    .replace(/([א-ת])\?([א-ת])/g, '$1? $2')    // תקן סימני שאלה בין מילים עבריות צמודות
    .replace(/([א-ת])!([א-ת])/g, '$1! $2')     // תקן סימני קריאה בין מילים עבריות צמודות
    .replace(/([א-ת]):([א-ת])/g, '$1: $2')     // תקן נקודתיים בין מילים עבריות צמודות
    .replace(/([א-ת]);([א-ת])/g, '$1; $2')     // תקן נקודה פסיק בין מילים עבריות צמודות
    .replace(/\s+([.,!?:"';])/g, '$1')          // הסר רווחים לפני סימני פיסוק
    .replace(/^([.,!?:"';])\s*/g, '')           // הסר סימני פיסוק מתחילת משפט
    .replace(/([.,!?:"';])\s+/g, '$1&nbsp;')    // החלף רווח אחרי פיסוק ב-&nbsp;
    .replace(/\s{2,}/g, ' ')                    // רווחים כפולים לרווח יחיד
    .trim();

  console.log('After fix:', combinedSection);

  const htmlString = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="language" content="Hebrew">
        <meta http-equiv="Content-Language" content="he-IL">
        <title>תמלול</title>
      </head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">בדיקת תיקון פיסוק סופי</h1>
        <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8;">
          <p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>
        </div>
      </body>
    </html>
  `;

  const buffer = await HTMLtoDOCX(htmlString, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
    lang: 'he-IL',
    locale: 'he-IL'
  });

  fs.writeFileSync('Test-Final-Punctuation-Fix.docx', buffer);
  console.log('✅ Test completed: Test-Final-Punctuation-Fix.docx');
}

testFinalPunctuationFix();