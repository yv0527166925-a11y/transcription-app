// תיקון מקרה 2 ספציפית
function fixCase2() {
  console.log('🎯 תיקון מקרה 2 ספציפית');

  const case2 = 'אמר"שלום."והלך.';
  console.log('Input:', case2);

  let result = case2;

  // שלב 1: תיקון בסיסי
  result = result.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
  console.log('אחרי שלב 1:', result);
  // תוצאה: אמר "שלום."והלך.

  // שלב 2: תיקון ."והלך -> ." והלך
  result = result.replace(/\\."והלך/g, '." והלך');
  console.log('אחרי שלב 2:', result);

  console.log('Expected: אמר "שלום". והלך.');
  console.log('SUCCESS:', result === 'אמר "שלום". והלך.' ? '✅' : '❌');

  // הבעיה: אני קיבלתי "שלום." והלך אבל צריך "שלום". והלך
  // אני צריך להזיז את הנקודה לאחרי הגרשיים!

  console.log('\\n🔧 תיקון המיקום של הנקודה:');
  result = case2;
  result = result.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
  console.log('אחרי שלב 1:', result);

  // תיקון המיקום של הנקודה: ."מילה -> ". מילה
  // אבל בעצם אני צריך: מ."מילה -> מ". מילה
  result = result.replace(/ם\\."([א-ת]+)/g, 'ם". $1');
  console.log('אחרי תיקון מיקום נקודה:', result);

  // תיקון כללי יותר
  console.log('\\n🎯 תיקון כללי:');
  result = case2;
  result = result.replace(/([א-ת])"([א-ת])/g, '$1 "$2');

  // מעבר הנקודה מלפני הגרשיים לאחרי הגרשיים
  result = result.replace(/([א-ת])\\."([א-ת]+)/g, '$1". $2');
  console.log('תוצאה כללית:', result);

  console.log('SUCCESS:', result === 'אמר "שלום". והלך.' ? '✅' : '❌');
}

fixCase2();