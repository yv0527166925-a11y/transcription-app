// פתרון סופי ומוחלט - עכשיו!
function finalFixNow() {
  console.log('🔥 פתרון סופי - ללא פשרות!');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
    { input: 'הוא אמר"אני הולך הביתה".', expected: 'הוא אמר "אני הולך הביתה".' },
    { input: 'הספר"תורה" נמצא על השולחן.', expected: 'הספר "תורה" נמצא על השולחן.' },
  ];

  console.log('\\n📋 המקרים שצריך לתקן:');
  testCases.forEach((tc, i) => console.log(`${i+1}. ${tc.input} -> ${tc.expected}`));

  // בואי נפתור כל מקרה בנפרד!
  testCases.forEach((testCase, index) => {
    console.log(`\\n🎯 מקרה ${index + 1}:`);
    console.log('Input: ' + testCase.input);

    let text = testCase.input;

    // תיקון 1: מילה"מילה -> מילה "מילה
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('אחרי תיקון 1: ' + text);

    // תיקון 2: הבעיה הגדולה - ."מילה -> ". מילה
    // זה הדפוס שלא עבד! צריך לחפש ."מילה ולא .מילה
    text = text.replace(/\\."([א-ת])/g, '." $1');
    console.log('אחרי תיקון 2: ' + text);

    // תיקון 3: רווח מיותר בגרשיים סוגרים - מילה "מילה -> מילה" מילה
    // רק למקרים שזה באמת סוף ציטוט
    text = text.replace(/([א-ת]{3,}) "([א-ת]{1,5})(\\s|\\.|$)/g, '$1" $2$3');
    console.log('אחרי תיקון 3: ' + text);

    console.log('Expected: ' + testCase.expected);
    console.log('SUCCESS: ' + (text === testCase.expected ? '✅ כן!' : '❌ לא'));

    if (text !== testCase.expected) {
      console.log('DIFF:');
      console.log('  Got:      "' + text + '"');
      console.log('  Expected: "' + testCase.expected + '"');
    }
  });

  // בדיקה סופית
  let working = [];
  let notWorking = [];

  testCases.forEach((testCase, index) => {
    let result = testCase.input
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')
      .replace(/\\."([א-ת])/g, '." $1')
      .replace(/([א-ת]{3,}) "([א-ת]{1,5})(\\s|\\.|$)/g, '$1" $2$3');

    if (result === testCase.expected) {
      working.push(index + 1);
    } else {
      notWorking.push(index + 1);
    }
  });

  console.log('\\n🏆 סיכום:');
  console.log('✅ עובד: מקרים ' + working.join(', '));
  console.log('❌ לא עובד: מקרים ' + notWorking.join(', '));
  console.log(`📊 הצלחה: ${working.length}/${testCases.length}`);

  if (working.length === testCases.length) {
    console.log('\\n🎉🎉🎉 כולם עובדים! עכשיו אוסיף לשרת! 🎉🎉🎉');
  } else {
    console.log('\\n🔧 צריך לתקן את מקרים: ' + notWorking.join(', '));
  }
}

finalFixNow();