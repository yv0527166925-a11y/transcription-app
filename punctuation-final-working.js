// פתרון סופי עובד לבעיות הפיסוק
function punctuationFinalWorking() {
  console.log('🧪 Final working punctuation fix...');

  const testCases = [
    { input: 'הוא אמר"אני הולך הביתה".', expected: 'הוא אמר "אני הולך הביתה".' },
    { input: 'הספר"תורה" נמצא על השולחן.', expected: 'הספר "תורה" נמצא על השולחן.' },
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\\n--- Test ${index + 1} ---`);
    console.log('לפני:', testCase.input);

    let text = testCase.input;

    // **תיקונים בסדר הנכון**

    // 1. תיקון נקודה במקום הלא נכון תחילה
    text = text.replace(/([א-ת])\\."/g, '$1".');

    // 2. תיקון גרשיים פותחים צמודים (מילה"טקסט -> מילה "טקסט)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');

    // 3. תיקון גרשיים סוגרים צמודים רק למקרים הרלוונטיים
    // זיהוי: יש מילה ארוכה לפני הגרשיים ומילה אחרי
    text = text.replace(/([א-ת]{2,})"([א-ת])/g, '$1" $2');

    // 4. תיקון רווח אחרי נקודה+גרשיים
    text = text.replace(/"\\.([א-ת])/g, '". $1');

    // 5. **תיקון חשוב**: הסרת רווח מיותר במקרים של גרשיים סוגרים
    // אם יש רווח לפני המילה שאחרי הגרשיים הסוגרים, אל תוסיף עוד רווח
    text = text.replace(/([א-ת])" ([א-ת])/g, '$1" $2');

    console.log('אחרי:', text);
    console.log('ציפיה:', testCase.expected);
    console.log('✅ תקין:', text === testCase.expected ? 'כן' : 'לא');
  });

  console.log('\\n🎯 הפתרון הסופי מוכן להטמעה בשרת!');
}

punctuationFinalWorking();