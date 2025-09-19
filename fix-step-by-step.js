// תיקון צעד אחר צעד
function fixStepByStep() {
  console.log('🔧 תיקון צעד אחר צעד');

  // בדיקת מקרה 1 - מדוע הדפוס לא תופס
  console.log('\\n🎯 מקרה 1: בדיקה מדוע הדפוס לא תופס');
  const case1 = '"מה אתה אומר "שאל הרב.';
  console.log('טקסט מקורי:', case1);

  // בואי נבדוק תו אחר תו מה יש אחרי "שאל"
  const afterShal = case1.substring(case1.indexOf('שאל') + 3);
  console.log('מה יש אחרי "שאל":', JSON.stringify(afterShal));

  // בדיקת הדפוס הספציפי
  const pattern1 = /([א-ת]{3,}) "([א-ת]{2,4})(\\s|\\.|$)/g;
  console.log('דפוס מקורי:', pattern1);

  // בואי ננסה דפוס פשוט יותר
  const simplePattern1 = /([א-ת]+) "([א-ת]+)/g;
  const match1 = case1.match(simplePattern1);
  console.log('דפוס פשוט יותר:', simplePattern1);
  console.log('התאמות:', match1);

  if (match1) {
    const fixed1 = case1.replace(simplePattern1, '$1" $2');
    console.log('תוצאה עם דפוס פשוט:', fixed1);
  }

  // מקרה 2: בדיקה מדוקדקת
  console.log('\\n🎯 מקרה 2: בדיקה מדוקדקת');
  const case2 = 'אמר "שלום."והלך.';
  console.log('טקסט מקורי:', case2);

  // בואי נבדוק מה בדיוק יש במקום שאני מחפש
  const indexOfDotQuote = case2.indexOf('."');
  console.log('מיקום של .":', indexOfDotQuote);
  console.log('התווים סביב .":', JSON.stringify(case2.substring(indexOfDotQuote, indexOfDotQuote + 4)));

  // דפוס חדש ומדויק
  const pattern2 = /\\."([א-ת]+)/g;
  console.log('דפוס חדש:', pattern2);
  const match2 = case2.match(pattern2);
  console.log('התאמות:', match2);

  if (match2) {
    const fixed2 = case2.replace(pattern2, '." $1');
    console.log('תוצאה:', fixed2);
  }

  // מקרה 3: אותו דבר
  console.log('\\n🎯 מקרה 3: בדיקה מדוקדקת');
  const case3 = 'הם קראו "שמע ישראל".היום.';
  console.log('טקסט מקורי:', case3);

  const indexOfQuoteDot = case3.indexOf('".');
  console.log('מיקום של ".:', indexOfQuoteDot);
  console.log('התווים סביב ".:', JSON.stringify(case3.substring(indexOfQuoteDot, indexOfQuoteDot + 4)));

  // הבעיה כאן שונה - יש ". ולא ."
  const pattern3 = /"\\.([א-ת]+)/g;
  console.log('דפוס למקרה 3:', pattern3);
  const match3 = case3.match(pattern3);
  console.log('התאמות:', match3);

  if (match3) {
    const fixed3 = case3.replace(pattern3, '". $1');
    console.log('תוצאה:', fixed3);
  }

  // בדיקה משולבת של כל התיקונים
  console.log('\\n🧪 בדיקה משולבת:');
  const testCases = [
    { input: case1, expected: '"מה אתה אומר" שאל הרב.' },
    { input: case2, expected: 'אמר "שלום". והלך.' },
    { input: case3, expected: 'הם קראו "שמע ישראל". היום.' }
  ];

  testCases.forEach((tc, i) => {
    let result = tc.input
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')      // רווח לפני גרשיים פותחים
      .replace(/([א-ת]+) "([א-ת]+)/g, '$1" $2')   // תיקון גרשיים סוגרים
      .replace(/\\."([א-ת]+)/g, '." $1')           // תיקון ."מילה
      .replace(/"\\.([א-ת]+)/g, '". $1');          // תיקון ".מילה

    console.log(`מקרה ${i+1}: ${result === tc.expected ? '✅' : '❌'} "${result}"`);
    if (result !== tc.expected) {
      console.log(`   צפוי: "${tc.expected}"`);
    }
  });
}

fixStepByStep();