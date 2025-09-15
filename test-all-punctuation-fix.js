const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function testAllPunctuationFix() {
  console.log(`📄 Testing all punctuation fixes`);

  // טקסט עם כל סוגי הפיסוק הבעייתיים
  const testText = `זהו.טקסט עם,בעיות פיסוק"שונות עם'גרש ועוד?בעיות של!קריאה ונקודתיים:צמודים וגם;נקודה פסיק בעייתית. המילים"האלה צריכות'להיות מופרדות?נכון וגם!בצורה טובה:יותר מכפי;שהיה קודם. זהו"הטקסט האחרון'עם הבעיות?הללו שצריכות!תיקון מהיר:וטוב;מאוד.`;

  console.log('Original text:', testText);

  // העתק את ההגיקה מהשרת
  let cleanedText = testText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let sections = cleanedText.split(/\n\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0);

  let contentHtml = '';
  sections.forEach(section => {
    const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let combinedSection = lines.join(' ').trim();

    console.log('Before punctuation fix:', combinedSection);

    // תיקון בעיות פיסוק ורווחים - כל סימני הפיסוק
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
      .replace(/\s{2,}/g, ' ')                    // רווחים כפולים לרווח יחיד
      .trim();

    console.log('After punctuation fix:', combinedSection);

    if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
      combinedSection += '.';
    }

    contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
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
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">בדיקת כל סימני הפיסוק</h1>
        <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 15px; line-height: 1.8;">
          ${contentHtml}
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

  fs.writeFileSync('Test-All-Punctuation-Fix.docx', buffer);
  console.log('✅ Test completed: Test-All-Punctuation-Fix.docx');
  console.log('Check that all punctuation marks are properly separated from words!');
}

testAllPunctuationFix();