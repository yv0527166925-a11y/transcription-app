// בדיקת תיקוני הפיסוק דרך הקוד מהשרת
function testServerPunctuation() {
  console.log('🧪 Testing punctuation fixes with server code...');

  const problemTexts = [
    'הוא אמר"אני הולך הביתה".',
    'הספר"תורה" נמצא על השולחן.',
    '"מה אתה אומר"שאל הרב.',
    'אמר"שלום."והלך.',
    'הם קראו"שמע ישראל".היום.',
  ];

  problemTexts.forEach((problemText, index) => {
    console.log(`\\n--- Test ${index + 1} ---`);
    console.log('לפני תיקון:');
    console.log(problemText);

    // העתק הקוד מהשרת (חלק מהתיקונים הרלוונטיים)
    let text = problemText
      // תיקון קיצורים בסיסיים
      .replace(/[\"\\u0022\\u201C\\u201D]/g, '\"')

      // תיקון בעיות צמידות גרשיים ופיסוק
      .replace(/([א-ת])\\."/g, '$1".')              // נקודה לפני גרשיים
      .replace(/([א-ת])"([א-ת])/g, '$1 "$2')      // רווח לפני גרשיים פותחים
      .replace(/([א-ת]{2,})"([א-ת])/g, '$1" $2')  // רווח אחרי גרשיים סוגרים
      .replace(/"\\\\.([א-ת])/g, '". $1')            // רווח אחרי נקודה+גרשיים

      // ניקוי רווחים
      .replace(/\\s{2,}/g, ' ')
      .trim();

    console.log('\\nאחרי תיקון:');
    console.log(text);
  });

  console.log('\\n=== ציפיות ===');
  console.log('✅ הוא אמר "אני הולך הביתה".');
  console.log('✅ הספר "תורה" נמצא על השולחן.');
  console.log('✅ "מה אתה אומר" שאל הרב.');
  console.log('✅ אמר "שלום". והלך.');
  console.log('✅ הם קראו "שמע ישראל". היום.');
}

testServerPunctuation();