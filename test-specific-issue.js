// בדיקת התיקון הספציפי
function testSpecificIssue() {
  console.log('🧪 Testing specific quotation issue...');

  let problemText = `"מה החזיר אותך בתשובה?"סיפר את הסיפור הזה`;

  console.log('לפני תיקון:');
  console.log(problemText);

  let text = problemText
    // נקה סוגי גרשיים שונים לאחיד
    .replace(/["\u0022\u201C\u201D]/g, '"')

    // תקן גרשיים סוגרים צמודים למילה הבאה
    .replace(/([.,!?])"([א-ת])/g, '$1" $2')        // "בתשובה?"סיפר -> "בתשובה?" סיפר
    .replace(/([א-ת])"([א-ת])/g, '$1" $2')         // גרשיים סוגרים בין מילים עבריות
    .replace(/(\s)"([א-ת])/g, '$1"$2')             // שמור גרשיים פותחים אחרי רווח
    .replace(/^"([א-ת])/gm, '"$1')                 // שמור גרשיים פותחים בתחילת שורה

    // ניקוי רווחים מיותרים
    .replace(/\s{2,}/g, ' ')
    .trim();

  console.log('\nאחרי תיקון:');
  console.log(text);

  console.log('\nתוצאה צפויה:');
  console.log('"מה החזיר אותך בתשובה?" סיפר את הסיפור הזה');
}

testSpecificIssue();