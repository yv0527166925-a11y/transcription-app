// דיבוג המקרים החסרים
function debugMissingCases() {
  console.log('🔍 Debugging the missing cases...');

  const missingCases = [
    {
      input: '"מה אתה אומר"שאל הרב.',
      expected: '"מה אתה אומר" שאל הרב.',
      issue: 'רווח מיותר אחרי גרשיים סוגרים'
    },
    {
      input: 'אמר"שלום."והלך.',
      expected: 'אמר "שלום". והלך.',
      issue: 'לא מוסיף רווח אחרי נקודה+גרשיים'
    },
    {
      input: 'הם קראו"שמע ישראל".היום.',
      expected: 'הם קראו "שמע ישראל". היום.',
      issue: 'לא מוסיף רווח אחרי נקודה+גרשיים'
    }
  ];

  missingCases.forEach((testCase, index) => {
    console.log(`\\n🐛 Case ${index + 1}: ${testCase.issue}`);
    console.log('Input:', testCase.input);
    console.log('Expected:', testCase.expected);

    // ננתח כל מקרה בנפרד
    let text = testCase.input;

    // תיקון נוכחי
    text = text
      .replace(/([א-ת])\\."/g, '$1".')              // נקודה לפני גרשיים
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')      // רווח לפני גרשיים פותחים
      .replace(/([א-ת]{2,})"([א-ת])/g, '$1" $2')  // רווח אחרי גרשיים סוגרים
      .replace(/"\\\\.([א-ת])/g, '". $1');            // רווח אחרי נקודה+גרשיים

    console.log('Current result:', text);
    console.log('✅ Fixed:', text === testCase.expected ? 'YES' : 'NO');

    // ניתוח מדוע זה לא עובד
    if (text !== testCase.expected) {
      console.log('🔍 Analysis:');
      if (testCase.issue.includes('רווח מיותר')) {
        console.log('   - הדפוס מוסיף רווח כפול או במקום הלא נכון');
      }
      if (testCase.issue.includes('לא מוסיף רווח')) {
        console.log('   - הדפוס לא תופס את המקרה הזה');
        console.log('   - צריך דפוס חזק יותר לזיהוי ".מילה"');
      }
    }
  });
}

debugMissingCases();