const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

// פונקציה שמייצרת פסקאות מתוקנות (מהקובץ server.js)
function processTranscriptionContent(transcription) {
  const paragraphs = [];

  let cleanedText = transcription
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sections = cleanedText
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  sections.forEach(section => {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: section,
          font: { name: "Arial" },
          size: 24,
          rightToLeft: true,
          languageComplexScript: "he-IL"
        })
      ],
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      rightToLeft: true,
      spacing: { after: 240, line: 360 }
    }));
  });

  return paragraphs;
}

// דרשה ארוכה לבדיקה
const testText = `פרק ראשון: על חשיבות הלמידה
הלמידה היא אחד הכלים החשובים ביותר שיש לאדם לפיתוח עצמו ולהבנת העולם שמסביבו. בעזרת הלמידה אנו יכולים לרכוש ידע חדש, לפתח כישורים, ולהעמיק את הבנתנו בנושאים שונים.

חשיבות הלמידה המתמשכת
בעולם המשתנה במהירות שלנו, הלמידה המתמשכת הפכה לצורך חיוני. טכנולוגיות חדשות מתפתחות כל הזמן, שיטות עבודה משתנות, והידע שרכשנו בעבר עלול להתיישן. לכן, על כל אחד מאיתנו להמשיך ולהתעדכן ולרכוש ידע חדש לאורך כל החיים.

שיטות למידה יעילות
קיימות שיטות רבות ללמידה יעילה. ביניהן: קריאה מעמיקה, כתיבת הערות, דיונים עם אחרים, תרגול מעשי, ולמידה ממקורות מגוונים. כל אדם צריך למצוא את השיטות המתאימות לו ביותר.

פרק שני: הטכנולוגיה והחינוך
הטכנולוגיה שינתה את פני החינוך בשנים האחרונות. כיום אנו יכולים ללמוד מרחוק, לגשת למידע בקלות, ולהשתמש בכלים דיגיטליים מתקדמים לשיפור חוויית הלמידה.

יתרונות הלמידה הדיגיטלית
הלמידה הדיגיטלית מציעה יתרונות רבים: גמישות בזמנים, גישה למגוון רחב של חומרים, אפשרות ללמידה אישית המותאמת לקצב של כל תלמיד, וחיסכון בעלויות. בנוסף, היא מאפשרת שימוש בטכנולוגיות אינטראקטיביות שהופכות את הלמידה למעניינת ומשכנעת יותר.

אתגרים בלמידה דיגיטלית
עם זאת, קיימים גם אתגרים בלמידה הדיגיטלית. חוסר המגע הפיזי עם המורה והתלמידים האחרים יכול להקשות על החוויה החברתית של הלמידה. בנוסף, נדרשת משמעת עצמית גבוהה ויכולת ניהול זמן טובה כדי להצליח בלמידה מרחוק.

פרק שלישי: עתיד החינוך
עתיד החינוך צפוי להיות מושפע מהתפתחויות טכנולוגיות נוספות. בינה מלאכותית, מציאות מדומה ומציאות מוגברת, ולמידת מכונה - כל אלה צפויים לשנות את אופן הלמידה וההוראה.

המלצות לעתיד
על מערכת החינוך להתכונן לשינויים הצפויים ולהתאים עצמה לטכנולוגיות החדשות. זה כולל הכשרת מורים, עדכון תוכניות הלימודים, והשקעה בתשתיות טכנולוגיות. במקביל, חשוב לשמור על הערכים הבסיסיים של החינוך ועל חשיבות המגע האנושי בתהליך הלמידה.`;

async function createTestDocument() {
  try {
    const doc = new Document({
      sections: [{
        properties: {
          rtl: true
        },
        children: processTranscriptionContent(testText)
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = './test-paragraph-structure-rtl-fixed.docx';
    fs.writeFileSync(outputPath, buffer);

    console.log('✅ קובץ הבדיקה נוצר בהצלחה:', outputPath);
    console.log('📊 מספר פסקאות שנוצרו:', testText.split(/\n\s*\n/).filter(Boolean).length);
  } catch (error) {
    console.error('❌ שגיאה ביצירת קובץ הבדיקה:', error);
  }
}

createTestDocument();