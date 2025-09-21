// תיקון המקרים הנותרים
function fixRemainingCases() {
  console.log('🔧 Fixing the remaining cases with targeted solutions...');

  const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\\n🔧 Fixing Case ${index + 1}`);
    console.log('Input:', testCase.input);

    let text = testCase.input;

    // **פתרון מדורג ומדויק**

    // שלב 1: תיקון נקודה במקום הלא נכון (מילה." -> מילה".)
    text = text.replace(/([א-ת])\\."/g, '$1".');
    console.log('After dot fix:', text);

    // שלב 2: תיקון גרשיים פותחים צמודים (מילה"טקסט -> מילה "טקסט)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
    console.log('After opening quotes:', text);

    // שלב 3: תיקון נקודה+גרשיים צמודים למילה (".מילה -> ". מילה)
    text = text.replace(/"\\.([א-ת])/g, '". $1');
    console.log('After dot+quotes:', text);

    // שלב 4: **הפתרון החדש**: תיקון גרשיים סוגרים צמודים למילה
    // אבל רק אם לא הוספנו רווח כבר
    // זיהוי: מילה ארוכה + גרשיים + מילה (ללא נקודה ביניהם)
    text = text.replace(/([א-ת]{2,})"([א-ת])/g, '$1" $2');
    console.log('After closing quotes:', text);

    // שלב 5: **תיקון סופי**: הסרת רווחים כפולים
    text = text.replace(/\\s{2,}/g, ' ');
    console.log('After cleanup:', text);

    console.log('Expected:', testCase.expected);
    console.log('✅ SUCCESS:', text === testCase.expected ? 'YES! 🎉' : 'NO 😞');
  });

  console.log('\\n📋 אם עדיין יש בעיות, אנסה גישה אחרת...');
}

fixRemainingCases();