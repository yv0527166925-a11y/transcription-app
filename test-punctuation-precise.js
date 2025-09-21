// בדיקת בעיות פיסוק וצמידות גרשיים - גרסה מדויקת
function testPunctuationPrecise() {
  console.log('🧪 Testing punctuation issues with precise patterns...');

  const testCases = [
    'הוא אמר"אני הולך הביתה".',        // צריך: הוא אמר "אני הולך הביתה".
    'הספר"תורה" נמצא על השולחן.',      // צריך: הספר "תורה" נמצא על השולחן.
    '"מה אתה אומר"שאל הרב.',          // צריך: "מה אתה אומר" שאל הרב.
    'אמר"שלום."והלך.',                // צריך: אמר "שלום". והלך.
    'הם קראו"שמע ישראל".היום.',       // צריך: הם קראו "שמע ישראל". היום.
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\\n--- Test ${index + 1} ---`);
    console.log('לפני:', testCase);

    let text = testCase
      // 1. תיקון מקרים כמו: מילה"טקסט -> מילה "טקסט (רק אם זה לא תחילת ציטוט)
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')

      // 2. תיקון מקרים כמו: "טקסט"מילה -> "טקסט" מילה
      .replace(/"([א-ת])/g, '" $1')

      // 3. תיקון נקודה במקום הלא נכון: מילה." -> מילה".
      .replace(/([א-ת])\\."/g, '$1".')

      // 4. רווח אחרי נקודה+גרשיים: ".מילה -> ". מילה
      .replace(/"\\.([א-ת])/g, '". $1')

      // נקה רווחים מיותרים
      .replace(/\\s{2,}/g, ' ');

    console.log('אחרי:', text);
  });
}

testPunctuationPrecise();