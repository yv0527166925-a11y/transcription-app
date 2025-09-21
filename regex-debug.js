// דיבוג הדפוסים
function regexDebug() {
  console.log('🔧 דיבוג הדפוסים');

  const text = 'אמר "שלום."והלך.';
  console.log('טקסט:', text);

  // בואי אבדוק כל דפוס בנפרד
  const patterns = [
    /\\."ו/g,
    /\\."[א-ת]/g,
    /\\."([א-ת])/g,
    /[א-ת]\\."[א-ת]/g,
    /([א-ת])\\."([א-ת])/g,
    /([א-ת]+)\\."([א-ת]+)/g
  ];

  patterns.forEach((pattern, i) => {
    const match = text.match(pattern);
    console.log(`דפוס ${i+1} (${pattern}):`, match);
  });

  // הבעיה יכולה להיות ש-escape characters לא עובדים
  console.log('\\n🔍 בדיקה ללא escape:');
  const simplePatterns = [
    /\\."ו/g,
    /שלום\\."ו/g,
    /ום\\."ו/g
  ];

  simplePatterns.forEach((pattern, i) => {
    const match = text.match(pattern);
    console.log(`דפוס פשוט ${i+1} (${pattern}):`, match);
  });

  // בואי אנסה להבין מה יש בעצם בטקסט
  console.log('\\n🔍 מה יש בעצם בטקסט:');
  const dotIndex = text.indexOf('.');
  const quoteIndex = text.indexOf('"', dotIndex);

  console.log('מיקום נקודה:', dotIndex);
  console.log('מיקום גרשיים אחרי נקודה:', quoteIndex);

  if (dotIndex >= 0 && quoteIndex >= 0) {
    console.log('רצף סביב נקודה+גרשיים:', text.substring(dotIndex-1, quoteIndex+3));
  }

  // התרגיל הפשוט - החלפה ישירה
  console.log('\\n✂️ תיקון ישיר:');
  let result = text.replace('ום."ו', 'ום". ו');
  console.log('תוצאה:', result);
  console.log('SUCCESS:', result === 'אמר "שלום". והלך.' ? '✅' : '❌');
}

regexDebug();