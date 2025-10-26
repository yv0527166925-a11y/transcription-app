const fs = require('fs');
const path = require('path');

// טקסט דוגמה ארוך יותר שמדמה פלט מגמיני עם פסקאות יפות אבל ארוכות
const sampleTranscription = `שלום וברכה, היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. אנחנו צריכים להתייחס לזה עכשיו, ברגע הזה, כי הזמן עובר והמצב לא מחכה לאף אחד. אם לא נפעל עכשיו, אנחנו עלולים לפספס הזדמנויות חשובות שלא יחזרו עוד פעם. אני יודע שזה נשמע דרמטי, אבל זה באמת כך.

בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות. אני מאמין שאם נתאמץ מספיק ונהיה מוכנים לקחת סיכונים מחושבים, נוכל להגיע למקומות שלא חלמנו עליהם. זה דורש אומץ, נחישות, וגם קצת מזל, אבל זה בהחלט אפשרי.

אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה, רגע של בהירות מוחלטת שבו הכל הסתדר במקום. לפני כן חשבתי שאני מבין את המצב, אבל הבנתי שאני בכלל לא הבנתי כלום. זה היה קצת מבלבל בהתחלה, אבל גם מאוד מעצים. זה הראה לי שתמיד יש מה ללמוד, תמיד יש דרכים חדשות להסתכל על דברים, ותמיד יש מקום לצמיחה ולהתפתחות.

השאלה החשובה היא מה אנחנו עושים עם ההבנה הזו. איך אנחנו מתרגמים את זה לפעולה קונקרטית. כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום. אני למדתי את זה על בשרי, כי היו לי הרבה רעיונות מעולים שמעולם לא יצאו לפועל, בדיוק בגלל שלא היה מי שייקח אחריות על ההוצאה לפועל.`;

// גם טקסט עם בעיית חזרות לדוגמה
const transcriptionWithRepetitions = `היום אני רוצה לדבר על- זה היה נושא אחר, e, זה היה נושא אחר, זה היה נושא אחר שמעניין אותי מאוד. אני חושב שזה- זה באמת- זה באמת משהו שכולנו צריכים לשמוע עליו.

הנקודה החשובה היא שאנחנו צריכים להבין את- את הנושא הזה בצורה מעמיקה. כי בלי הבנה נכונה אנחנו לא נוכל להתקדם ולעשות את מה שצריך לעשות. זה פשוט לא אפשרי.`;

// פונקציה פשוטה שמראה איך יראה הטקסט אחרי createShortParagraphs
function simulateCurrentProcessing(text) {
  console.log('📝 Original paragraphs:');
  const originalParagraphs = text.split(/\n\s*\n/);
  originalParagraphs.forEach((p, i) => {
    console.log(`${i + 1}. "${p.substring(0, 100)}..."`);
  });

  console.log('\n🔧 After createShortParagraphs processing:');

  // מדמה את הלוגיקה מ createShortParagraphs
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

    // תנאי הפיצול המקוריים
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

  paragraphs.forEach((p, i) => {
    console.log(`${i + 1}. "${p.substring(0, 100)}..."`);
  });

  return paragraphs;
}

async function testWordGeneration() {
  try {
    console.log('🧪 Testing current Word document processing...');
    console.log('📝 Sample text has', sampleTranscription.split(/\n\s*\n/).length, 'paragraphs originally');

    const processedParagraphs = simulateCurrentProcessing(sampleTranscription);

    console.log(`\n📊 Result: ${sampleTranscription.split(/\n\s*\n/).length} original paragraphs → ${processedParagraphs.length} processed paragraphs`);
    console.log('❌ Problem: The createShortParagraphs function is breaking up the nice AI-generated paragraphs!');

  } catch (error) {
    console.error('❌ Error in test:', error);
  }
}

// בדיקה אם זה מופעל ישירות
if (require.main === module) {
  testWordGeneration();
}

module.exports = { testWordGeneration };