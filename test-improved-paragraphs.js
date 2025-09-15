const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

function cleanFilename(filename) {
  return filename.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').trim();
}

async function testImprovedParagraphs() {
  console.log(`📄 Testing improved paragraph separation`);

  // טקסט ארוך יותר עם משפטים רבים
  const longText = `זהו המשפט הראשון בטקסט הארוך שלנו. המשפט השני ממשיך את הנושא. זהו המשפט השלישי שמוסיף מידע נוסף. המשפט הרביעי מעמיק בנושא. זהו המשפט החמישי שמביא דוגמאות. המשפט השישי מסכם את החלק הראשון. זהו המשפט השביעי שמתחיל חלק חדש. המשפט השמיני ממשיך את הרעיון החדש. זהו המשפט התשיעי שמוסיף פרטים חשובים. המשפט העשירי מביא ניתוח מעמיק. זהו המשפט האחד עשר שמרחיב על הנושא. המשפט השנים עשר מסיים את הדיון.`;

  // העתק הקוד המעודכן מהשרת
  let cleanedText = longText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  console.log('Original text length:', cleanedText.length);

  let sections = cleanedText.split(/\n\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0);

  console.log('Initial sections:', sections.length);

  // אם יש רק פסקה אחת ארוכה, חלק אותה למשפטים
  if (sections.length === 1 && sections[0].length > 300) {
    console.log('🔄 Splitting long section...');
    const longTextSection = sections[0];
    const sentences = longTextSection.split(/(?<=[.!?])\s+/);

    console.log('Found sentences:', sentences.length);

    // אם יש מספיק משפטים לחלוקה
    if (sentences.length > 3) {
      console.log('✅ Enough sentences for splitting');
      sections = [];
      let currentSection = '';

      sentences.forEach((sentence, index) => {
        console.log(`Processing sentence ${index + 1}: "${sentence.substring(0, 30)}..." (length: ${sentence.length})`);

        if (currentSection.length + sentence.length > 200 && currentSection.length > 0) {
          console.log(`📝 Creating new section (current: ${currentSection.length} chars)`);
          sections.push(currentSection.trim());
          currentSection = sentence + ' ';
        } else {
          currentSection += sentence + ' ';
        }
      });

      if (currentSection.trim()) {
        sections.push(currentSection.trim());
      }
    }
  }

  console.log('Final sections:', sections.length);
  sections.forEach((section, index) => {
    console.log(`Section ${index + 1}: ${section.length} chars - "${section.substring(0, 50)}..."`);
  });

  // בנה HTML
  let contentHtml = '';
  sections.forEach((section, index) => {
    // תיקון פיסוק כמו בשרת
    let combinedSection = section
      .replace(/([א-ת])\.([א-ת])/g, '$1 $2')
      .replace(/([א-ת]),([א-ת])/g, '$1, $2')
      .replace(/\s+([.,!?:])/g, '$1')
      .replace(/([.,!?:])\s+/g, '$1&nbsp;')
      .replace(/\s{2,}/g, ' ')
      .trim();

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
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">בדיקת פסקאות משופרת</h1>
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

  fs.writeFileSync('Test-Improved-Paragraphs.docx', buffer);
  console.log('✅ Test completed: Test-Improved-Paragraphs.docx');
}

testImprovedParagraphs();