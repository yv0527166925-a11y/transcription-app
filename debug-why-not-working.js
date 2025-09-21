// דיבוג מדוע הדפוסים לא עובדים
function debugWhyNotWorking() {
  console.log('🔍 דיבוג מדוע הדפוסים לא עובדים');

  // מקרה 1: בעיית הרווח בגרשיים סוגרים
  console.log('\\n🎯 מקרה 1: "אומר "שאל -> "אומר" שאל');
  const case1 = '"מה אתה אומר "שאל הרב.';
  console.log('טקסט:', case1);

  // בואי נבדוק איך הדפוס שלי אמור לעבוד
  const pattern1 = /([א-ת]{3,}) "([א-ת]{2,4})(\\s|\\.|$)/g;
  console.log('דפוס:', pattern1);

  // בדיקה יזנואלית
  const matches1 = case1.match(pattern1);
  console.log('התאמות:', matches1);

  // הבעיה: "אומר "שאל הרב." - יש רווח אחרי "שאל" אז הדפוס אמור לתפוס
  // אבל אולי הבעיה היא שאני מחפש סוף מילה וזה לא סוף

  console.log('\\n🔍 בדיקה מפורטת של מקרה 1:');
  console.log('האם "אומר" יש 3+ תווים?', 'אומר'.length >= 3);
  console.log('האם "שאל" יש 2-4 תווים?', 'שאל'.length >= 2 && 'שאל'.length <= 4);
  console.log('האם יש רווח אחרי "שאל"?', case1.includes('שאל '));

  // מקרים 2&3: בעיית נקודה+גרשיים
  console.log('\\n🎯 מקרים 2&3: ."מילה -> ". מילה');

  const case2 = 'אמר "שלום."והלך.';
  const case3 = 'הם קראו "שמע ישראל".היום.';

  console.log('מקרה 2:', case2);
  console.log('מקרה 3:', case3);

  // הדפוסים שלי:
  const pattern2a = /\\."([א-ת])/g;
  const pattern2b = /"\\\\.([א-ת])/g;

  console.log('\\nדפוס 2a:', pattern2a, '-> מחפש נקודה ואז גרשיים ואז מילה');
  console.log('דפוס 2b:', pattern2b, '-> מחפש גרשיים ואז נקודה ואז מילה');

  // בואי נבדוק מה בעצם יש במקרים שלי:
  console.log('\\n🔍 מה יש בעצם במקרים 2&3:');
  console.log('מקרה 2 מכיל ."ו:', case2.includes('."ו'));
  console.log('מקרה 3 מכיל ."ה:', case3.includes('."ה'));

  // אהה! הבעיה שלי היא שיש ." ולא ". - הנקודה לפני הגרשיים!
  console.log('\\n💡 גילוי: הנקודה לפני הגרשיים, לא אחרי!');
  console.log('מקרה 2: "שלום." + "והלך" - צריך: "שלום". + " והלך"');
  console.log('מקרה 3: "ישראל." + "היום" - צריך: "ישראל". + " היום"');

  console.log('\\n🎯 הדפוס הנכון צריך להיות: ."מילה -> ". מילה');
  const correctPattern = /\\."([א-ת])/g;
  console.log('דפוס נכון:', correctPattern);

  console.log('\\nבדיקה:');
  console.log('מקרה 2 עם דפוס נכון:', case2.replace(correctPattern, '." $1'));
  console.log('מקרה 3 עם דפוס נכון:', case3.replace(correctPattern, '." $1'));
}

debugWhyNotWorking();