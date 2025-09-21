const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

// העתק הפונקציה המשופרת מהשרת
function applyParagraphBreaking(text) {
  console.log(`🔧 Starting enhanced paragraph breaking...`);

  // שלב 1: תיקון פיסוק מתקדם וקיצורים עבריים
  text = text
    // תיקון קיצורים עבריים נפוצים עם רווחים תקינים
    .replace(/רש\s*["\u0022\u201C\u201D]\s*י/g, 'רש"י')
    .replace(/חז\s*["\u0022\u201C\u201D]\s*ל/g, 'חז"ל')
    .replace(/החיד\s*["\u0022\u201C\u201D]\s*א/g, 'החיד"א')
    .replace(/הגר\s*["\u0022\u201C\u201D]\s*א/g, 'הגר"א')
    .replace(/רמב\s*["\u0022\u201C\u201D]\s*ם/g, 'רמב"ם')
    .replace(/רמב\s*["\u0022\u201C\u201D]\s*ן/g, 'רמב"ן')
    .replace(/משנ\s*["\u0022\u201C\u201D]\s*ב/g, 'משנ"ב')
    .replace(/שו\s*["\u0022\u201C\u201D]\s*ע/g, 'שו"ע')
    .replace(/שו\s*["\u0022\u201C\u201D]\s*ת/g, 'שו"ת')
    .replace(/מהר\s*["\u0022\u201C\u201D]\s*ל/g, 'מהר"ל')

    // תיקון גרשיים וציטוטים מתקדם - גרסה חזקה
    // קודם כול נקה את כל סוגי הגרשיים לסוג אחיד
    .replace(/["\u0022\u201C\u201D]/g, '"')

    // תיקון גרשיים צמודים ישירות למילה עברית
    .replace(/([א-ת])"([א-ת])/g, '$1 "$2')           // מילה"מילה -> מילה "מילה
    .replace(/([א-ת])"([.,!?])/g, '$1" $2')          // מילה". -> מילה" .
    .replace(/([א-ת])"([.,!?])/g, '$1"$2')           // מילה"? -> מילה"?

    // תיקון רווחים לפני גרשיים פותחים
    .replace(/([א-ת])\s*"([א-ת])/g, '$1 "$2')        // וודא רווח לפני גרשיים פותחים

    // תיקון גרשיים סוגרים
    .replace(/([א-ת])\s*"([.,!?])/g, '$1"$2')        // גרשיים סגירה לפני פיסוק ללא רווח
    .replace(/([א-ת])\s*"/g, '$1"')                  // גרשיים סגירה צמודים למילה

    // תיקון מקרים מיוחדים
    .replace(/(\w)"(\w)/g, '$1 "$2')                 // כל מילה"מילה
    .replace(/"([א-ת])/g, '"$1')                     // גרשיים פתיחה צמודים
    .replace(/([א-ת])"/g, '$1"')                     // גרשיים סגירה צמודים

    // תיקון רווחים סביב גרשיים
    .replace(/\s+"/g, ' "')                          // רווח יחיד לפני גרשיים
    .replace(/"\s+/g, '" ')                          // רווח יחיד אחרי גרשיים פותחים
    .replace(/([.,!?])"\s+/g, '$1" ')                // רווח אחרי גרשיים עם פיסוק

    // תיקון פיסוק חזק יותר - הסרת רווחים לפני פיסוק
    .replace(/\s+([.,!?:;])/g, '$1')                           // הסר כל רווח לפני פיסוק
    .replace(/([.,!?:;])\s+/g, '$1 ')                          // רווח יחיד אחרי פיסוק

    // תיקון פיסוק עם מילים עבריות
    .replace(/([א-ת])([.,!?:;])([א-ת])/g, '$1$2 $3')          // רווח אחרי פיסוק בין מילים עבריות

    // ניקוי רווחים מיותרים
    .replace(/\s{2,}/g, ' ')                                   // רווחים כפולים לרווח יחיד
    .replace(/^\s+|\s+$/gm, '')                                // רווחים בתחילת/סוף שורות
    .trim();

  console.log(`✅ Punctuation fixing completed`);

  // שלב 2: זיהוי משפטים מלאים עם הגיון מתקדם וטיפול בציטוטים
  const sentences = [];
  let currentSentence = '';
  let insideQuotation = false;
  let quotationDepth = 0;
  const words = text.split(/\s+/);

  console.log(`📝 Processing ${words.length} words into complete sentences with quotation handling...`);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = i < words.length - 1 ? words[i + 1] : '';
    const prevWord = i > 0 ? words[i - 1] : '';

    currentSentence += word + ' ';

    // זיהוי גרשיים פתיחה וסגירה
    const hasOpenQuote = word.includes('"') && word.match(/^[^"]*"[^"]*$/);
    const hasCloseQuote = word.includes('"') && word.match(/[^"]*"[^"]*$/);

    // ספירת גרשיים בתוך המילה
    const quoteCount = (word.match(/"/g) || []).length;

    if (quoteCount > 0) {
      quotationDepth += quoteCount % 2 === 1 ? (insideQuotation ? -1 : 1) : 0;
      insideQuotation = quotationDepth > 0;
    }

    // זיהוי סוף משפט אמיתי עם בדיקות מתקדמות
    const endsWithPunctuation = word.match(/[.!?]$/);

    if (endsWithPunctuation && !insideQuotation) {
      // בדיקות שזה לא קיצור או מספר
      const isCommonAbbreviation = word.match(/^(רש"י|חז"ל|החיד"א|הגר"א|רמב"ם|רמב"ן|משנ"ב|שו"ע|שו"ת|מהר"ל|ר"ת|תוס'|ע"ש|ע"פ|כו'|וכו'|שם|דף|עמ'|פס'|סי'|ח"א|ח"ב|ח"ג|ח"ד|ח"ה)\.?$/);
      const isNumber = word.match(/^\d+\.$/);
      const isInitials = word.match(/^[א-ת]"[א-ת]\.$/);

      // זיהוי שהמילה הבאה מתחילה משפט חדש
      const nextStartsNewSentence = nextWord && (
        nextWord.match(/^[א-ת]/i) ||  // מילה עברית
        nextWord.match(/^[A-Z]/) ||   // מילה באנגלית עם אות גדולה
        nextWord.match(/^"[א-ת]/)     // ציטוט חדש
      );

      // תנאי סיום משפט - רק אם לא בתוך ציטוט
      if (!isCommonAbbreviation && !isNumber && !isInitials && nextStartsNewSentence) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
        insideQuotation = false;
        quotationDepth = 0;
      }
    }

    // אם אנחנו בתוך ציטוט ורואים גרשיים סוגרים, המשך לבדוק סוף משפט
    if (insideQuotation && word.includes('"') && word.match(/[.!?]"$/)) {
      insideQuotation = false;
      quotationDepth = 0;

      // בדוק אם זה סוף משפט אמיתי אחרי סגירת הציטוט
      if (nextWord && nextWord.match(/^[א-ת]/i)) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
    }
  }

  // הוסף משפט אחרון
  if (currentSentence.trim()) {
    sentences.push(currentSentence.trim());
  }

  console.log(`✅ Created ${sentences.length} complete sentences`);

  // שלב 3: חלוקה חכמה לפסקאות על פי תוכן
  const paragraphs = [];
  let currentParagraph = '';
  let sentenceCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const nextSentence = i < sentences.length - 1 ? sentences[i + 1] : '';

    currentParagraph += sentence + ' ';
    sentenceCount++;

    // זיהוי תחילת נושא/רעיון חדש
    const startsNewTopic = nextSentence && nextSentence.match(/^(אומר|כותב|שואל|מביא|אז|כך|למה|איך|מה|ועכשיו|והנה|אבל|אמנם|ולכן|לכן|בנוסף|כמו|דהיינו|הרי|לדוגמה|בפרט|מכאן|שהסיבה|והשאלה|בפרשת|כיוון|היינו|נמצא|הוכחה|וכן|ועוד|בנוסף|למשל|לדוגמה)/);

    // זיהוי סוף רעיון מלא
    const endsIdea = sentence.match(/\b(הקדוש ברוך הוא|חז"ל|רש"י|רמב"ם|התורה|הגמרא|המשנה|התלמוד|המדרש)\b.*[.!?]\s*$/) ||
                    sentence.match(/\b(לכן|אם כן|ומכאן|לסיכום|בסופו של דבר|זהו|זו|לסיום|בסוף|לבסוף)\b.*[.!?]\s*$/);

    // זיהוי מעבר בין דוברים
    const speakerChange = nextSentence && (
      nextSentence.match(/^(הרב|המורה|השואל|המשיב|המלמד|התלמיד)/i) ||
      nextSentence.match(/^[א-ת]+\s+(אמר|אומר|שאל|ענה|הוסיף|המשיך)/i)
    );

    // תנאים לפיצול פסקה
    const wordCount = currentParagraph.split(' ').length;
    const shouldBreak =
      sentenceCount >= 4 ||                               // מקסימום 4 משפטים
      (sentenceCount >= 2 && startsNewTopic) ||          // 2 משפטים + נושא חדש
      (sentenceCount >= 2 && endsIdea) ||                // 2 משפטים + סוף רעיון
      (sentenceCount >= 2 && speakerChange) ||           // 2 משפטים + החלפת דובר
      wordCount >= 60;                                    // מקסימום 60 מילים

    if (shouldBreak && currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
      currentParagraph = '';
      sentenceCount = 0;
    }
  }

  // הוסף את הפסקה האחרונה
  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }

  console.log(`📝 Enhanced paragraph breaking completed: ${paragraphs.length} logical paragraphs created`);
  console.log(`📊 Average paragraph length: ${Math.round(text.length / paragraphs.length)} characters`);

  return paragraphs.join('\n\n');
}

async function testUserExamples() {
  console.log('🧪 Testing enhanced solution with user examples...');

  // הדוגמאות מהמשתמש
  const problemText = `למה התורה כותבת"המצוות שאדם דש"?  אתה שואל אותו"מה?", אתה שואל אותם"מה?" ישראל"מאפטא  נשאל אותו את השאלה הזאת"."אבל אולי  אם יעשו את הניתוח?" "כן." "כמה זה יעלה?" "200,000 דולר." "נכון. אבל שישה חודשים הוא יענה אמן?""כל אמן "מה החזיר אותך בתשובה?"סיפר את הסיפור הזה  הוא אומר, "למה כתבו את כל הדברים האלה?"הוא אומר, "דור המבול, במה השם הרג אותם? מים."זה היה הלגיון של מים.  "אלא במזלא."ככה אומרת הגמרא.  "מאיפה יצא היצר הרע של עבודה זרה? מבית קודש הקודשים?"אומר,  אומרים"שמע ישראל השם אלוקינו השם אחד", מצליחים לעשות פסיעה. ממשיכים עוד פעם, "שמע ישראל השם אלוקינו השם אחד", עוד פסיעה. אומר, הם הגיעו אליו. אומר להם, כשמגיעים אליו, הוא רואה שהם הגיעו עד אליו, "בטח אתם יהודים?"אמרו לו, "כן"."אמרתם פסוקים של יהודים?"אמרו לו, "כן. "לכו לחמו בלחמי"בלבד`;

  console.log('Original problematic text:');
  console.log(problemText);
  console.log('\n=== PROCESSING ===\n');

  const processed = applyParagraphBreaking(problemText);

  console.log('Processed text:');
  console.log(processed);

  // יצירת קובץ Word לבדיקה
  const paragraphs = processed.split('\n\n');
  let contentHtml = '';

  paragraphs.forEach((paragraph, index) => {
    contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 15px;"><span lang="he-IL" xml:lang="he-IL">${paragraph}</span></p>`;
  });

  const htmlString = `
    <!DOCTYPE html>
    <html lang="he-IL" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="language" content="Hebrew">
        <meta http-equiv="Content-Language" content="he-IL">
        <title>בדיקת פתרון משופר</title>
      </head>
      <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial; font-size: 15px;" lang="he-IL">
        <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 18px; font-weight: bold; margin-bottom: 24px; margin-top: 0;">בדיקת פתרון משופר - דוגמאות המשתמש</h1>
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

  fs.writeFileSync('Test-Enhanced-Solution.docx', buffer);
  console.log('\n✅ Test completed: Test-Enhanced-Solution.docx');
  console.log('🔍 Check the Word document to see if quotation marks and paragraphs are fixed!');
}

testUserExamples().catch(console.error);