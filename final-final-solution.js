// הפתרון הסופי האמיתי
function finalFinalSolution() {
  console.log('🔥 הפתרון הסופי והאמיתי!');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
    { input: 'הוא אמר"אני הולך הביתה".', expected: 'הוא אמר "אני הולך הביתה".' },
    { input: 'הספר"תורה" נמצא על השולחן.', expected: 'הספר "תורה" נמצא על השולחן.' },
  ];

  console.log('\\n🎯 הפתרון החכם:');

  testCases.forEach((tc, i) => {
    console.log(`\\n--- מקרה ${i+1} ---`);
    console.log('Input: ' + tc.input);

    let text = tc.input;

    // שלב 1: רווח לפני גרשיים פותחים (מילה"תחילה -> מילה "תחילה)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('שלב 1: ' + text);

    // שלב 2: תיקון ספציפי לגרשיים סוגרים צמודים למילה הבאה
    // אבל רק אם זה נראה כמו סוף ציטוט ולא התחלה
    // זיהוי: מילה ארוכה + רווח + גרשיים + מילה קצרה (כמו "שאל", "אמר")
    text = text.replace(/([א-ת]{3,}) "([א-ת]{1,4})\\s/g, '$1" $2 ');
    console.log('שלב 2: ' + text);

    // שלב 3: תיקון ."מילה -> ". מילה
    text = text.replace(/\\."([א-ת])/g, '." $1');
    console.log('שלב 3: ' + text);

    console.log('Expected: ' + tc.expected);
    console.log('SUCCESS: ' + (text === tc.expected ? '✅ YES!' : '❌ NO'));
  });

  // בדיקה כוללת
  let successCount = 0;
  testCases.forEach((tc) => {
    let result = tc.input
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')
      .replace(/([א-ת]{3,}) "([א-ת]{1,4})\\s/g, '$1" $2 ')
      .replace(/\\."([א-ת])/g, '." $1');

    if (result === tc.expected) successCount++;
  });

  console.log(`\\n📊 תוצאה סופית: ${successCount}/${testCases.length}`);

  if (successCount === testCases.length) {
    console.log('\\n🏆🏆🏆 כל המקרים עובדים!!! נוסיף לשרת עכשיו! 🏆🏆🏆');

    return true;
  } else {
    console.log('\\n🔄 עוד לא מושלם...');
    return false;
  }
}

finalFinalSolution();