// פתרון מדויק לבעיות הנותרות
function preciseSolution() {
  console.log('🎯 Creating precise solution for remaining issues...');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\\n🎯 Precise fix for Case ${index + 1}`);
    console.log('Input:', testCase.input);

    let text = testCase.input;

    // **פתרון מדויק חדש**

    // תיקון 1: גרשיים פותחים צמודים (מילה"תחילת-ציטוט)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('Step 1 (opening):', text);

    // תיקון 2: גרשיים סוגרים צמודים למילה הבאה
    // אבל רק אם זה באמת סוף ציטוט - חיפוש אחר מילה ארוכה לפני הגרשיים
    text = text.replace(/([א-ת]{3,})"([א-ת])/g, '$1" $2');
    console.log('Step 2 (closing long words):', text);

    // תיקון 3: המקרה הספציפי של ".מילה" (נקודה+גרשיים+מילה)
    // זה המקרה שחסר לנו!
    text = text.replace(/\\.([א-ת])/g, '. $1');
    console.log('Step 3 (dot+word):', text);

    // ניקוי רווחים מיותרים
    text = text.replace(/\\s{2,}/g, ' ');
    console.log('Step 4 (cleanup):', text);

    console.log('Expected:', testCase.expected);
    console.log('✅ SUCCESS:', text === testCase.expected ? 'YES! 🎉' : 'NO 😞');

    if (text !== testCase.expected) {
      console.log('🔍 Difference analysis:');
      console.log('Got:     "' + text + '"');
      console.log('Expected:"' + testCase.expected + '"');
    }
  });
}

preciseSolution();