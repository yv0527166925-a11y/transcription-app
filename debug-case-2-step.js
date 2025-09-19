// דיבוג מקרה 2 צעד אחר צעד
function debugCase2Step() {
  console.log('🔍 דיבוג מקרה 2 צעד אחר צעד');

  const case2 = 'אמר"שלום."והלך.';
  console.log('Input:', case2);
  console.log('Expected: אמר "שלום". והלך.');

  // מה אני צריך לעשות:
  // 1. אמר"שלום."והלך -> אמר "שלום."והלך (רווח לפני גרשיים)
  // 2. אמר "שלום."והלך -> אמר "שלום". והלך (נקודה אחרי גרשיים + רווח לפני והלך)

  console.log('\\n🎯 מה אני בעצם צריך לעשות:');
  console.log('1. לעבור מ-."והלך ל-". והלך');
  console.log('2. כלומר להעביר את הנקודה לאחרי הגרשיים ולהוסיף רווח');

  let result = case2;

  // שלב 1: רווח לפני גרשיים
  result = result.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
  console.log('\\nאחרי שלב 1:', result);

  // עכשיו יש לי: אמר "שלום."והלך
  // אני צריך: אמר "שלום". והלך

  // בואי אבדוק אם יש לי ."והלך
  console.log('האם יש ."והלך:', result.includes('."והלך'));

  // בואי אחפש דפוסים אחרים
  console.log('האם יש ום."והלך:', result.includes('ום."והלך'));
  console.log('האם יש לום."ו:', result.includes('לום."ו'));

  // דפוס מדויק למה שיש במקרה שלי
  const specificPattern = /לום\\."ו/g;
  const match = result.match(specificPattern);
  console.log('דפוס ספציפי (לום."ו):', match);

  if (match) {
    result = result.replace(specificPattern, 'לום". ו');
    console.log('אחרי תיקון ספציפי:', result);
  }

  // דפוס כללי יותר: מילה."מילה -> מילה". מילה
  const generalPattern = /([א-ת]+)\\."([א-ת]+)/g;
  console.log('\\n🧪 בדיקת דפוס כללי:', generalPattern);

  result = case2.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
  console.log('אחרי שלב 1:', result);

  const matches = result.match(generalPattern);
  console.log('התאמות לדפוס כללי:', matches);

  if (matches) {
    result = result.replace(generalPattern, '$1". $2');
    console.log('אחרי דפוס כללי:', result);
  }

  console.log('\\nSUCCESS:', result === 'אמר "שלום". והלך.' ? '✅' : '❌');
}

debugCase2Step();