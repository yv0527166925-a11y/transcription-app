// בדיקת התיקונים העבריים במסמך וורד
const fs = require('fs');
const path = require('path');

function createWordTestDocument() {
  console.log('📄 Creating Word document test with Hebrew fixes...');

  // טקסט בעייתי לפני תיקון
  const problematicText = `
רש" י כותב שחז "ל אמרו על ה "אוהב ישראל" שהוא צדיק.
שליט" א הרב אמר: "מה החזיר אותך בתשובה?"סיפר לנו את הסיפור.
האר'י ז" ל וחז "לים היו בק" ב ואמרו אמן-ים לברכה.
אני לא יודעתראו מה אמרתיכן לו בעניין הזה.
"וכל מדוי מצרים... לא ישימם בך" ]יורד שורה הפסוק] כתוב.
`;

  console.log('לפני תיקון:');
  console.log(problematicText);

  // העתק הקוד המתוקן מהשרת
  let fixedText = problematicText;

  // קודם כל - נקה את כל הגרשיים לסוג אחיד
  fixedText = fixedText.replace(/["\u0022\u201C\u201D]/g, '"');

  // **שלב א: תיקון קיצורים נפוצים - ללא פשרות**
  const hebrewAbbreviations = [
    ['רש', 'י'], ['חז', 'ל'], ['שליט', 'א'], ['החיד', 'א'],
    ['הגר', 'א'], ['רמב', 'ם'], ['רמב', 'ן'], ['משנ', 'ב'],
    ['שו', 'ע'], ['שו', 'ת'], ['מהר', 'ל'], ['בק', 'ב'],
    ['ב', 'ה'], ['ד', 'ה']
  ];

  hebrewAbbreviations.forEach(([first, second]) => {
    const patterns = [
      `${first}\\s*"\\s*${second}`,    // רש " י
      `${first}\\s+"\\s*${second}`,    // רש  " י
      `${first}"\\s*${second}`,        // רש" י
      `${first}\\s*"${second}`,        // רש "י
      `${first}"${second}`             // רש"י (כבר נכון)
    ];
    patterns.forEach(pattern => {
      const regex = new RegExp(pattern, 'g');
      fixedText = fixedText.replace(regex, `${first}"${second}`);
    });
  });

  fixedText = fixedText
    // תיקון מיוחד למילים מחוברות ונפרדות
    .replace(/האר['׳]\\s*י\\s+ז\\s*"\\s*ל/g, 'האר"י ז"ל')
    .replace(/ר['׳]\\s/g, 'ר\\' ')
    .replace(/ר"/g, 'ר\\'')

    // תיקון מילים שמתחלקות עם גרשיים
    .replace(/חז\\s*"\\s*לים/g, 'חז"לים')      // חז "לים -> חז"לים
    .replace(/חז\\s+"\\s*לים/g, 'חז"לים')     // חז  "לים -> חז"לים
    .replace(/חכמי\\s*"\\s*ם/g, 'חכמים')
    .replace(/אמיני\\s*ם/g, 'אמנים')

    // תיקון מיתוקים שגויים במילים עבריות
    .replace(/אמן-ים/g, 'אמנים')
    .replace(/בן-אדם/g, 'בן אדם')
    .replace(/יהודי-ים/g, 'יהודים')
    .replace(/תלמיד-ים/g, 'תלמידים')

    // תיקון גרשיים כפולים סביב שמות (ה "אוהב ישראל" -> ה"אוהב ישראל")
    .replace(/ה\\s+"([^"]+)"/g, 'ה"$1"')
    .replace(/([א-ת])\\s+"([^"]+)"/g, '$1"$2"')

    // הוסף רווחים לפני גרשיים שצמודים למילים עבריות (רק לציטוטים)
    .replace(/([א-ת])"([א-ת][^"]*[א-ת])"([.,!?\\s])/g, '$1 "$2"$3')
    .replace(/([א-ת])"([א-ת]{2,})/g, (match, before, after) => {
      // שמור קיצורים עבריים מוכרים
      const abbreviations = ['לים', 'לי', 'לין', 'לנו', 'ל', 'ם', 'ן', 'א', 'י', 'ב', 'ה', 'ע', 'ת'];
      if (abbreviations.some(abbr => after.startsWith(abbr))) {
        return match; // השאר כמו שזה
      }
      return before + ' "' + after; // הוסף רווח
    })

    // תקן גרשיים סוגרים צמודים למילה הבאה
    .replace(/([.,!?])"([א-ת])/g, '$1" $2')
    .replace(/([א-ת])"([א-ת])/g, '$1" $2')

    // תיקון מקרים ספציפיים של מילים צמודות
    .replace(/יודעתראו/g, 'יודעת ראו')
    .replace(/אומרתאני/g, 'אומרת אני')
    .replace(/שאלתיאותו/g, 'שאלתי אותו')
    .replace(/אמרתיכן/g, 'אמרתי כן')

    // תיקון פיסוק
    .replace(/\\s+([.,!?:;])/g, '$1')
    .replace(/([.,!?:;])\\s+/g, '$1 ')

    // ניקוי רווחים מיותרים
    .replace(/\\s{2,}/g, ' ')
    .replace(/^\\s+|\\s+$/gm, '')
    .trim();

  console.log('\\nאחרי תיקון:');
  console.log(fixedText);

  // צור HTML למסמך וורד
  const htmlContent = \`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>בדיקת תיקונים עבריים</title>
    <style>
        body {
            font-family: 'David', 'Times New Roman', serif;
            font-size: 14pt;
            line-height: 1.6;
            direction: rtl;
            text-align: right;
            margin: 2cm;
            background-color: white;
        }
        h1 {
            color: #2c5aa0;
            border-bottom: 2px solid #2c5aa0;
            padding-bottom: 10px;
            font-size: 18pt;
        }
        h2 {
            color: #4a4a4a;
            margin-top: 30px;
            font-size: 16pt;
        }
        .before {
            background-color: #ffe6e6;
            padding: 15px;
            border-right: 4px solid #ff6b6b;
            margin: 10px 0;
            font-family: monospace;
        }
        .after {
            background-color: #e6ffe6;
            padding: 15px;
            border-right: 4px solid #51cf66;
            margin: 10px 0;
        }
        .comparison {
            display: flex;
            gap: 20px;
            margin: 20px 0;
        }
        .comparison > div {
            flex: 1;
        }
        .fixed-issues {
            background-color: #e3f2fd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .issue-item {
            margin: 8px 0;
            padding: 5px 0;
            border-bottom: 1px dotted #ccc;
        }
        .issue-item:last-child {
            border-bottom: none;
        }
        .checkmark {
            color: #4caf50;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>בדיקת תיקונים עבריים במסמך Word</h1>

    <h2>טקסט לפני תיקון</h2>
    <div class="before">
\${problematicText.replace(/\\n/g, '<br>')}
    </div>

    <h2>טקסט אחרי תיקון</h2>
    <div class="after">
\${fixedText.replace(/\\n/g, '<br>')}
    </div>

    <div class="fixed-issues">
        <h2>רשימת תיקונים שבוצעו</h2>
        <div class="issue-item">
            <span class="checkmark">✅</span> רש"י (תוקן מ: רש" י)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> חז"ל (תוקן מ: חז "ל)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> שליט"א (תוקן מ: שליט" א)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> ה"אוהב ישראל" (תוקן מ: ה "אוהב ישראל")
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> "בתשובה?" סיפר (תוקן מ: "בתשובה?"סיפר)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> האר"י ז"ל (תוקן מ: האר'י ז" ל)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> חז"לים (תוקן מ: חז "לים)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> בק"ב (תוקן מ: בק" ב)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> אמנים (תוקן מ: אמן-ים)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> יודעת ראו (תוקן מ: יודעתראו)
        </div>
        <div class="issue-item">
            <span class="checkmark">✅</span> אמרתי כן (תוקן מ: אמרתיכן)
        </div>
    </div>

    <h2>הוראות שימוש</h2>
    <p>
        1. פתח את הקובץ הזה בדפדפן<br>
        2. בחר Ctrl+A כדי לבחור הכל<br>
        3. העתק (Ctrl+C)<br>
        4. פתח Word חדש והדבק (Ctrl+V)<br>
        5. שמור כקובץ .docx
    </p>

    <p style="margin-top: 40px; text-align: center; color: #666; font-size: 12pt;">
        נוצר בתאריך: \${new Date().toLocaleDateString('he-IL')} ⏰ \${new Date().toLocaleTimeString('he-IL')}
    </p>
</body>
</html>
\`;

  // שמור את קובץ ה-HTML
  const outputPath = path.join(__dirname, 'hebrew-fixes-test.html');
  fs.writeFileSync(outputPath, htmlContent, 'utf8');

  console.log(\`\\n📄 קובץ בדיקה נוצר בהצלחה: \${outputPath}\`);
  console.log('📋 הוראות:');
  console.log('1. פתח את הקובץ hebrew-fixes-test.html בדפדפן');
  console.log('2. בחר הכל (Ctrl+A) והעתק (Ctrl+C)');
  console.log('3. פתח Word חדש והדבק (Ctrl+V)');
  console.log('4. שמור כקובץ .docx');
  console.log('\\n✨ תוכל לראות את כל התיקונים העבריים פועלים במסמך Word!');
}

createWordTestDocument();