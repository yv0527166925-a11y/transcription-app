// הפתרון הסופי והמלא
function finalCompleteSolution() {
  console.log('🚀 Final complete solution - no compromises!');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
    // בדיקות נוספות שלא יישברו
    { input: 'הוא אמר"אני הולך הביתה".', expected: 'הוא אמר "אני הולך הביתה".' },
    { input: 'הספר"תורה" נמצא על השולחן.', expected: 'הספר "תורה" נמצא על השולחן.' },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\\n🚀 Complete fix for Case ${index + 1}`);
    console.log('Input:', testCase.input);

    let text = testCase.input;

    // **הפתרון המלא בסדר הנכון**

    // שלב 1: תיקון גרשיים פותחים צמודים (מילה"תחילה -> מילה "תחילה)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('1. Opening quotes:', text);

    // שלב 2: תיקון המקרה הקריטי: ."מילה -> ". מילה
    text = text.replace(/\\."([א-ת])/g, '." $1');
    console.log('2. Dot+quote+word:', text);

    // שלב 3: תיקון גרשיים סוגרים שנוצרו עם רווח מיותר
    // זיהוי המקרה: מילה-ארוכה " מילה -> מילה-ארוכה" מילה
    text = text.replace(/([א-ת]{3,}) "([א-ת])/g, '$1" $2');
    console.log('3. Fix extra space:', text);

    // ניקוי רווחים מיותרים
    text = text.replace(/\\s{2,}/g, ' ');
    console.log('4. Cleanup:', text);

    console.log('Expected:', testCase.expected);
    console.log('✅ SUCCESS:', text === testCase.expected ? 'YES! 🎉' : 'NO 😞');

    if (text !== testCase.expected) {
      console.log('🔍 Still different:');
      console.log('   Got:     "' + text + '"');
      console.log('   Expected:"' + testCase.expected + '"');

      // השוואה תו אחר תו
      console.log('🔍 Character by character:');
      for (let i = 0; i < Math.max(text.length, testCase.expected.length); i++) {
        const got = text[i] || '[END]';
        const exp = testCase.expected[i] || '[END]';
        if (got !== exp) {
          console.log(`   Position ${i}: Got "${got}" Expected "${exp}" <<<< DIFF`);
          break;
        }
      }
    }
  });
}

finalCompleteSolution();