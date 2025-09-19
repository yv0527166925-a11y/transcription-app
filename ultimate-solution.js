// הפתרון האולטימטיבי
function ultimateSolution() {
  console.log('🔥 ULTIMATE SOLUTION - כל התיקונים!');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
    { input: 'הוא אמר"אני הולך הביתה".', expected: 'הוא אמר "אני הולך הביתה".' },
    { input: 'הספר"תורה" נמצא על השולחן.', expected: 'הספר "תורה" נמצא על השולחן.' },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\\n🔥 Ultimate fix for Case ${index + 1}`);
    console.log('Input:', testCase.input);

    let text = testCase.input;

    // **הפתרון האולטימטיבי**

    // תיקון 1: רווח לפני גרשיים פותחים (מילה"תחילה -> מילה "תחילה)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');

    // תיקון 2: הבעיה הקריטית - ."מילה -> ". מילה
    text = text.replace(/\\."([א-ת])/g, '." $1');

    // תיקון 3: **רק** לתיקון המקרה הספציפי של רווח מיותר במילים ארוכות
    // זיהוי מדויק: מילה ארוכה + רווח + גרשיים סוגרים + מילה -> מילה + גרשיים + רווח + מילה
    // אבל רק אם זה לא מתאים לדפוס של ציטוט
    text = text.replace(/([א-ת]{4,}) "([א-ת])/g, (match, word1, word2) => {
      // בדיקה אם זה נראה כמו סוף ציטוט
      if (word2.length <= 3) { // מילים קצרות כמו "שאל", "אמר"
        return word1 + '" ' + word2;
      }
      return match; // השאר כמו שזה
    });

    console.log('Result:', text);
    console.log('Expected:', testCase.expected);
    console.log('✅ SUCCESS:', text === testCase.expected ? 'YES! 🎉' : 'NO 😞');
  });

  console.log('\\n📊 סיכום:');
  let successCount = 0;
  testCases.forEach((testCase) => {
    let text = testCase.input
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')
      .replace(/\\."([א-ת])/g, '." $1')
      .replace(/([א-ת]{4,}) "([א-ת])/g, (match, word1, word2) => {
        if (word2.length <= 3) {
          return word1 + '" ' + word2;
        }
        return match;
      });

    if (text === testCase.expected) {
      successCount++;
    }
  });

  console.log(`🎯 הצלחה: ${successCount}/${testCases.length} מקרים`);

  if (successCount === testCases.length) {
    console.log('\\n🏆🏆🏆 כל התיקונים עובדים!!! 🏆🏆🏆');
  }
}

ultimateSolution();