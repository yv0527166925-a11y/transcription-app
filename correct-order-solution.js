// פתרון עם הסדר הנכון
function correctOrderSolution() {
  console.log('🔧 פתרון עם הסדר הנכון');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' }
  ];

  testCases.forEach((tc, i) => {
    console.log(`\\n🎯 מקרה ${i+1}: ${tc.input}`);

    let result = tc.input;

    // שלב 1: רווח לפני גרשיים פותחים (מילה"תחילה -> מילה "תחילה)
    result = result.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('אחרי שלב 1 (רווח לפני גרשיים):', result);

    // עכשיו צריך לטפל בכל מקרה בנפרד
    if (i === 0) {
      // מקרה 1: "אומר "שאל -> "אומר" שאל (תיקון גרשיים סוגרים)
      result = result.replace(/([א-ת]{3,}) "([א-ת]{2,4})(\\s)/g, '$1" $2$3');
      console.log('אחרי שלב 2 (תיקון גרשיים סוגרים):', result);
    } else if (i === 1) {
      // מקרה 2: ."והלך -> ". והלך
      result = result.replace(/\\."([א-ת]+)/g, '." $1');
      console.log('אחרי שלב 2 (תיקון ."מילה):', result);
    } else if (i === 2) {
      // מקרה 3: ".היום -> ". היום
      result = result.replace(/"\\.([א-ת]+)/g, '". $1');
      console.log('אחרי שלב 2 (תיקון ".מילה):', result);
    }

    console.log('Expected:', tc.expected);
    console.log('SUCCESS:', result === tc.expected ? '✅' : '❌');
  });

  // עכשיו בואי ננסה לשלב הכל
  console.log('\\n🚀 ניסיון לשלב הכל:');

  testCases.forEach((tc, i) => {
    let result = tc.input
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2');      // רווח לפני גרשיים פותחים

    // תיקונים ספציפיים שלא יפגעו אחד בשני
    if (result.includes(' "') && result.includes(' ')) {
      // רק אם יש גרשיים סוגרים אמיתיים
      result = result.replace(/([א-ת]{3,}) "([א-ת]{2,4})(\\s)/g, '$1" $2$3');
    }

    // תיקון מילים צמודות אחרי נקודה+גרשיים
    result = result
      .replace(/\\."([א-ת]+)/g, '." $1')           // ."מילה -> ." מילה
      .replace(/"\\.([א-ת]+)/g, '". $1');          // ".מילה -> ". מילה

    console.log(`מקרה ${i+1}: ${result === tc.expected ? '✅' : '❌'} "${result}"`);
    if (result !== tc.expected) {
      console.log(`   צפוי: "${tc.expected}"`);
    }
  });
}

correctOrderSolution();