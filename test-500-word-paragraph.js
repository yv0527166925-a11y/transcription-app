const text = `אני רוצה לספר לכם, שנייה, אני אמצא. כן. כתב השולחן ערוך בהלכות יום כיפור תרכ"א: נהגו לדור צדקות ביום הכיפורים בעד המתים. כותב שם המשנה ברורה, שגם המתים מתכפרים ביום הכיפורים כשנודרים בעבורם. ולמה? כי אנחנו אומרים, אם הוא היה ממשיך לחיות, הוא גם היה נותן צדקה. ואפילו היה עני, והוא לא יכל לתת צדקה כי לא היה לו ממה לתת, אומר המשנה ברורה, הוא היה טהור לב והוא היה רוצה לתת צדקה. אומר המשנה ברורה משהו מזעזע. אבל אם נותנים צדקה בעבור רשע, לא מועיל לו. אבל אם התוודה, אותו רשע קודם מותו, יש לומר שיש לו כפרה או כצדיק חשוב. אני רוצה להדגיש, כל זה שאני נותן עבור רשע אחר. אבל בן שנותן עבור אביו הרשע, בן כרעא דאבוה, כן יכול לכפר גם אם אביו רשע. אבל כתוב פה דבר נורא. אני רוצה לתת צדקה לעילוי נשמת רשע, לא יכול להיות. מי נקרא אבל צדיק? התוודה לפני מותו. רשע אחד שהתוודה. אני מכיר יהודי שהיה כופר גדול, צרפתי. שתי בנותיו חזרו בתשובה. הוא לא היה מוכן לקבל שהבנות שלו שהוא ציפה שיהיו רופאות בכירות, חזרו בתשובה. נשואות אברכים, בנים ונכדים. בערוב ימיו הוא חלה במחלה סופנית. הוא לא מצא טעם בחייו, לא היה אכפת לו למות, והוא כל הזמן דחק ברופאים שינתקו אותו ממכשירי הנשמה, כי הוא לא רוצה לחיות. הבנות שלו עזבו אותו, הנכדים שלו לא הולכים בדרך שלו, אין לו טעם בחיים. באו אליו הבנות, אמרו לו, גם אם אתה רוצה למות, תחשוב על הבנות שלך. אנחנו רוצות את אבא שלנו חי. והצליחו לשכנע אותו שיישאר מחובר למכונות. יום אחד הגריע עליו רופאה דתייה שעבדה באותו בית חולים. אמרה לו, תראה איזה בנות נחמדות יש לך. איזה נכדים מתוקים, תראה איזה נחת. מה אתה מעדיף שהם יסתובבו עם סמים בהודו הרחוקה? אתה היית רוצה שיסתובבו כהומלסים בכל מיני מקומות עם אנשים משונים ויחפשו כל מיני ערכים ריקים ונבובים? תשמח שאתה, הם יהודים. הם דואגים לך, תראה כמה שניתקת איתם קשר, איך הם באות, מטפלות בך, דואגות לך. הוא שמע את הדברים, פרץ בבכי, אמר אני באמת מתחרט על חיי. הייתי טיפש, הייתי רק עצלן מלעשות גם אני מעשה כמו הבנות שלי ולשוב אל השם. אומר, יכלתי לחיות איתם באהבה, בחום. הוא אומר, וניתקתי, בזבזתי את חיי. היה בוכה על כל החיים המבוזבזים. שלוש שעות אחר כך הוא נפטר. היהודי הזה נפטר מתוך וידוי של תשובה. איך קוראים לו בשמיים? אדם שניתק קשר עם בנות, רוצה למות. צדיק. למה? כי הוא הרהר תשובה. תשמעו את המתנה ששמה תשובה. כמה זה חשוב, כמה זה חשוב. הגר זורקת את ישמעאל תחת אחת השיחים, הורגת את הבן שלה. ותלך ותתע, חוזרת לגילולי בית אביה. פתאום באים המלאכים. נשבר לה הלב, בכתה, היה לה הרהור תשובה. מעבודה זרה, כמעט רוצחת. פוקח השם את עיניה, רואה באר מים חיים. מה זה כוח של בכי? מה הוא כוחו של הרהור תשובה? זה התורה מלמדת אותנו כמה אדם צריך להתחזק. לא סתם קוראים את הפרשה של הגר ביום א' של ראש השנה, כי אנחנו רוצים ללמד לכל אחד ואחד מאיתנו, מה הוא כוחו של תשובה? מה היא כוחה של תשובה? זה אדם צריך תמיד לדעת ולראות. כל הלשון, עולם שלם של תוכן איכותי.`;

console.log('🔍 Testing paragraph algorithm with 500-word text...\n');

function createSmartParagraphs(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  console.log(`📝 Total sentences found: ${sentences.length}`);

  const paragraphs = [];
  let currentParagraph = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    currentParagraph += sentence + ' ';

    const nextSentence = i < sentences.length - 1 ? sentences[i + 1].trim() : '';

    // חלוקה חכמה לפסקאות לפי כללים כלליים
    const currentWords = currentParagraph.trim().split(/\s+/);
    console.log(`📊 Sentence ${i + 1}: ${currentWords.length} words so far`);

    const shouldEndParagraph =
      // סיום פסקה במשפט אחרון
      i === sentences.length - 1 ||

      // פסקה ארוכה מדי (מעל 150 מילים)
      currentWords.length >= 150 ||

      // זיהוי שאלות בודדות שיכולות לסגור פסקה
      (sentence.endsWith('?') && currentWords.length > 20) ||

      // זיהוי ציטוטים שמסתיימים בפסקה
      (sentence.endsWith('".') && currentWords.length > 15);

    if (shouldEndParagraph && currentParagraph.trim().length > 0) {
      console.log(`✂️ Paragraph ${paragraphs.length + 1} ended with ${currentWords.length} words`);
      paragraphs.push(currentParagraph.trim());
      currentParagraph = '';
    }
  }

  // הוסף את מה שנשאר
  if (currentParagraph.trim().length > 0) {
    const finalWords = currentParagraph.trim().split(/\s+/);
    console.log(`✂️ Final paragraph with ${finalWords.length} words`);
    paragraphs.push(currentParagraph.trim());
  }

  return paragraphs.filter(p => p.length > 0);
}

const paragraphs = createSmartParagraphs(text);

console.log(`\n📊 Results:`);
console.log(`Total paragraphs: ${paragraphs.length}`);

paragraphs.forEach((paragraph, index) => {
  const wordCount = paragraph.split(/\s+/).length;
  console.log(`Paragraph ${index + 1}: ${wordCount} words`);
  console.log(`First 100 chars: "${paragraph.substring(0, 100)}..."`);
  console.log('---');
});