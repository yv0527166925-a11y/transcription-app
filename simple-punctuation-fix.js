// פתרון פשוט וישיר לבעיות הפיסוק
function simplePunctuationFix() {
  console.log('🧪 Simple and direct punctuation fix...');

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

    // **גישה פשוטה: תיקון ממוקד לכל בעיה**

    // 1. תיקון: מילה"טקסט -> מילה "טקסט (הוספת רווח לפני גרשיים פותחים)
    text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');

    // 2. תיקון: "טקסט"מילה -> "טקסט" מילה (הוספת רווח אחרי גרשיים סוגרים)
    // אבל רק אם המילה הראשונה אינה רק אות אחת (כדי למנוע בעיות)
    text = text.replace(/([א-ת]{2,})"([א-ת])/g, '$1" $2');

    // 3. תיקון: מילה." -> מילה". (העברת נקודה לפני גרשיים)
    text = text.replace(/([א-ת])\\."/g, '$1".');

    // 4. תיקון: ".מילה -> ". מילה (הוספת רווח אחרי נקודה+גרשיים)
    text = text.replace(/"\\.([א-ת])/g, '". $1');

    console.log('אחרי:', text);
    console.log('ציפיה:', testCase.expected);
    console.log('✅ תקין:', text === testCase.expected ? 'כן' : 'לא');
  });
}

simplePunctuationFix();