// יצירת קובץ בדיקה לוורד
const fs = require('fs');

function createWordTest() {
  console.log('📄 Creating Word test document...');

  // טקסט בעייתי לפני תיקון
  const problemText = `רש" י כותב שחז "ל אמרו על ה "אוהב ישראל" שהוא צדיק.
שליט" א הרב אמר: "מה החזיר אותך בתשובה?"סיפר לנו את הסיפור.
האר'י ז" ל וחז "לים היו בק" ב ואמרו אמן-ים לברכה.
אני לא יודעתראו מה אמרתיכן לו בעניין הזה.
"וכל מדוי מצרים... לא ישימם בך" ]יורד שורה הפסוק] כתוב.`;

  // טקסט מתוקן
  let fixedText = problemText
    // תיקון קיצורים בסיסיים
    .replace(/רש\s*"\s*י/g, 'רש"י')
    .replace(/חז\s*"\s*ל/g, 'חז"ל')
    .replace(/שליט\s*"\s*א/g, 'שליט"א')
    .replace(/בק\s*"\s*ב/g, 'בק"ב')

    // תיקון מילים מחוברות
    .replace(/חז\s*"\s*לים/g, 'חז"לים')
    .replace(/אמן-ים/g, 'אמנים')
    .replace(/יודעתראו/g, 'יודעת ראו')
    .replace(/אמרתיכן/g, 'אמרתי כן')

    // תיקון האר'י ז"ל
    .replace(/האר'י\s+ז\s*"\s*ל/g, 'האר"י ז"ל')

    // תיקון גרשיים סביב שמות
    .replace(/ה\s+"([^"]+)"/g, 'ה"$1"')

    // תיקון גרשיים סוגרים
    .replace(/([.,!?])"([א-ת])/g, '$1" $2')

    // ניקוי רווחים
    .replace(/\s{2,}/g, ' ')
    .trim();

  // יצירת HTML
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <title>בדיקת תיקונים עבריים</title>
    <style>
        body {
            font-family: 'David', 'Times New Roman', serif;
            font-size: 14pt;
            line-height: 1.8;
            direction: rtl;
            margin: 3cm;
        }
        h1 { color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 10px; }
        .before { background: #ffe6e6; padding: 20px; margin: 15px 0; border-right: 4px solid #ff6b6b; }
        .after { background: #e6ffe6; padding: 20px; margin: 15px 0; border-right: 4px solid #51cf66; }
        .fixes { background: #e3f2fd; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .fix-item { margin: 8px 0; }
        .checkmark { color: #4caf50; font-weight: bold; }
    </style>
</head>
<body>
    <h1>בדיקת תיקונים עבריים - מסמך Word</h1>

    <h2>טקסט לפני תיקון:</h2>
    <div class="before">${problemText.replace(/\n/g, '<br>')}</div>

    <h2>טקסט אחרי תיקון:</h2>
    <div class="after">${fixedText.replace(/\n/g, '<br>')}</div>

    <div class="fixes">
        <h2>תיקונים שבוצעו:</h2>
        <div class="fix-item"><span class="checkmark">✅</span> רש"י (מ: רש" י)</div>
        <div class="fix-item"><span class="checkmark">✅</span> חז"ל (מ: חז "ל)</div>
        <div class="fix-item"><span class="checkmark">✅</span> שליט"א (מ: שליט" א)</div>
        <div class="fix-item"><span class="checkmark">✅</span> ה"אוהב ישראל" (מ: ה "אוהב ישראל")</div>
        <div class="fix-item"><span class="checkmark">✅</span> "בתשובה?" סיפר (מ: "בתשובה?"סיפר)</div>
        <div class="fix-item"><span class="checkmark">✅</span> האר"י ז"ל (מ: האר'י ז" ל)</div>
        <div class="fix-item"><span class="checkmark">✅</span> חז"לים (מ: חז "לים)</div>
        <div class="fix-item"><span class="checkmark">✅</span> בק"ב (מ: בק" ב)</div>
        <div class="fix-item"><span class="checkmark">✅</span> אמנים (מ: אמן-ים)</div>
        <div class="fix-item"><span class="checkmark">✅</span> יודעת ראו (מ: יודעתראו)</div>
        <div class="fix-item"><span class="checkmark">✅</span> אמרתי כן (מ: אמרתיכן)</div>
    </div>

    <h2>הוראות:</h2>
    <p>1. בחר הכל (Ctrl+A) והעתק (Ctrl+C)</p>
    <p>2. פתח Word חדש והדבק (Ctrl+V)</p>
    <p>3. שמור כקובץ .docx</p>

    <p style="text-align: center; margin-top: 40px; color: #666;">
        נוצר: ${new Date().toLocaleDateString('he-IL')} ${new Date().toLocaleTimeString('he-IL')}
    </p>
</body>
</html>`;

  fs.writeFileSync('hebrew-word-test.html', html, 'utf8');

  console.log('✅ קובץ נוצר: hebrew-word-test.html');
  console.log('📋 פתח את הקובץ בדפדפן, העתק והדבק ב-Word');
}

createWordTest();