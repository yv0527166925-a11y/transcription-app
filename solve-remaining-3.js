// פתרון 3 המקרים הנותרים
function solveRemaining3() {
  console.log('🎯 פותר את 3 המקרים הנותרים!');

  const remainingCases = [
    {
      input: '"מה אתה אומר"שאל הרב.',
      expected: '"מה אתה אומר" שאל הרב.',
      issue: 'גרשיים סוגרים צמודים למילה הבאה'
    },
    {
      input: 'אמר"שלום."והלך.',
      expected: 'אמר "שלום". והלך.',
      issue: 'נקודה+גרשיים צמודים למילה'
    },
    {
      input: 'הם קראו"שמע ישראל".היום.',
      expected: 'הם קראו "שמע ישראל". היום.',
      issue: 'נקודה+גרשיים צמודים למילה'
    }
  ];

  console.log('\\n🔍 ניתוח מדויק של כל מקרה:');

  remainingCases.forEach((testCase, index) => {
    console.log(`\\n--- מקרה ${index + 1}: ${testCase.issue} ---`);
    console.log('Input:    ' + testCase.input);
    console.log('Expected: ' + testCase.expected);

    let text = testCase.input;

    // תיקון בסיסי שכבר עובד
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('Step 1:   ' + text);

    // עכשיו בואי נתמקד בבעיה הספציפית
    if (index === 0) {
      // מקרה 1: "אומר "שאל -> "אומר" שאל
      console.log('🎯 מתקן: מילה רווח גרשיים מילה -> מילה גרשיים רווח מילה');
      text = text.replace(/([א-ת]{3,}) "([א-ת]{2,4})(\\s|\\.|$)/g, '$1" $2$3');
      console.log('Step 2:   ' + text);
    } else {
      // מקרים 2&3: ."מילה -> ". מילה
      console.log('🎯 מתקן: נקודה+גרשיים צמודים למילה');

      // דפוס חדש: חפש את הדפוס הספציפי ."מילה
      text = text.replace(/\\."([א-ת])/g, '." $1');
      console.log('Step 2a:  ' + text);

      // אם זה לא עזר, בואי ננסה דפוס אחר
      if (text === testCase.input.replace(/([א-ת])"([א-ת])/g, '$1 "$2')) {
        console.log('🔄 דפוס ראשון לא עבד, מנסה דפוס אחר...');
        text = text.replace(/"\\.([א-ת])/g, '". $1');
        console.log('Step 2b:  ' + text);
      }
    }

    console.log('Result:   ' + text);
    console.log('SUCCESS:  ' + (text === testCase.expected ? '✅ YES!' : '❌ NO'));

    if (text !== testCase.expected) {
      console.log('🔍 DIFF:');
      console.log('  Got:      "' + text + '"');
      console.log('  Expected: "' + testCase.expected + '"');
    }
  });

  // בדיקה מהירה של כל הפתרונות ביחד
  console.log('\\n🧪 בדיקה מהירה של הפתרון המשולב:');

  remainingCases.forEach((tc, i) => {
    let result = tc.input
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')                    // רווח לפני גרשיים
      .replace(/([א-ת]{3,}) "([א-ת]{2,4})(\\s|\\.|$)/g, '$1" $2$3')  // תיקון גרשיים סוגרים
      .replace(/\\."([א-ת])/g, '." $1');                        // תיקון ."מילה

    console.log(`מקרה ${i+1}: ${result === tc.expected ? '✅' : '❌'} "${result}"`);
    if (result !== tc.expected) {
      console.log(`   צפוי: "${tc.expected}"`);
    }
  });
}

solveRemaining3();