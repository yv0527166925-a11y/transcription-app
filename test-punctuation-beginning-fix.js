const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function testPunctuationBeginningFix() {
  console.log(`📄 Testing punctuation at beginning of sentences`);

  // טקסט עם בעיות של סימני פיסוק בתחילת משפטים
  const testTexts = [
    `. זהו משפט שמתחיל בנקודה בעייתית`,
    `, זהו משפט שמתחיל בפסיק בעייתי`,
    `! זהו משפט שמתחיל בסימן קריאה`,
    `? זהו משפט שמתחיל בסימן שאלה`,
    `: זהו משפט שמתחיל בנקודתיים`,
    `" זהו משפט שמתחיל בגרשיים`,
    `; זהו משפט שמתחיל בנקודה פסיק`,
    `זהו.טקסט רגיל עם,בעיות אמצע. והמשפט הבא טוב`
  ];

  let allResults = '';

  testTexts.forEach((text, index) => {
    console.log(`\n🔄 Testing text ${index + 1}: "${text}"`);

    let combinedSection = text.trim();

    console.log('Before fix:', combinedSection);

    // החל את כל התיקונים מהשרת
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
      .replace(/([.,!?:"';])\s+/g, '$1&nbsp;')    // החלף רווח אחרי פיסוק ב-&nbsp;
      .replace(/^([.,!?:"';])\s*/g, '')           // הסר סימני פיסוק מתחילת משפט
      .replace(/\s{2,}/g, ' ')                    // רווחים כפולים לרווח יחיד
      .trim();

    console.log('After fix:', combinedSection);

    allResults += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL"><strong>טקסט ${index + 1}:</strong> ${combinedSection}</span></p>`;
  });

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
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">בדיקת פיסוק בתחילת משפט</h1>
        <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8;">
          ${allResults}
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

  fs.writeFileSync('Test-Punctuation-Beginning-Fix.docx', buffer);
  console.log('✅ Test completed: Test-Punctuation-Beginning-Fix.docx');
  console.log('Check that no punctuation marks appear at the beginning of sentences!');
}

testPunctuationBeginningFix();