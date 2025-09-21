// דיבוג תו אחר תו
function charByCharDebug() {
  console.log('🔍 דיבוג תו אחר תו');

  const case2 = 'אמר "שלום."והלך.';
  const case3 = 'הם קראו "שמע ישראל".היום.';

  console.log('\\n🎯 מקרה 2 - תו אחר תו סביב הבעיה:');
  console.log('טקסט מלא:', case2);

  const dotIndex2 = case2.indexOf('."');
  console.log(`מיקום של .": ${dotIndex2}`);

  for (let i = dotIndex2; i < dotIndex2 + 5 && i < case2.length; i++) {
    const char = case2[i];
    console.log(`  ${i}: "${char}" (Unicode: ${char.charCodeAt(0)})`);
  }

  console.log('\\n🎯 מקרה 3 - תו אחר תו סביב הבעיה:');
  console.log('טקסט מלא:', case3);

  const quoteIndex3 = case3.indexOf('".');
  console.log(`מיקום של ".: ${quoteIndex3}`);

  for (let i = quoteIndex3; i < quoteIndex3 + 5 && i < case3.length; i++) {
    const char = case3[i];
    console.log(`  ${i}: "${char}" (Unicode: ${char.charCodeAt(0)})`);
  }

  // עכשיו בואי ננסה דפוסים פשוטים
  console.log('\\n🧪 בדיקת דפוסים פשוטים:');

  // מקרה 2: בואי ננסה להחליף "והלך" ב-" והלך"
  console.log('מקרה 2:');
  console.log('לפני:', case2);

  let result2 = case2.replace(/והלך/g, ' והלך');
  console.log('אחרי החלפת "והלך" ב-" והלך":', result2);

  // מקרה 3: בואי ננסה להחליף "היום" ב-" היום"
  console.log('\\nמקרה 3:');
  console.log('לפני:', case3);

  let result3 = case3.replace(/היום/g, ' היום');
  console.log('אחרי החלפת "היום" ב-" היום":', result3);

  // דפוס כללי יותר
  console.log('\\n🎯 דפוס כללי לחיפוש מילים צמודות אחרי ." או ".:');

  const pattern2 = /\\."([א-ת]+)/g;
  const pattern3 = /"\\.([א-ת]+)/g;

  console.log('דפוס 2 (."מילה):', pattern2);
  console.log('מקרה 2 תואם:', case2.match(pattern2));

  console.log('דפוס 3 (".מילה):', pattern3);
  console.log('מקרה 3 תואם:', case3.match(pattern3));

  // אולי הבעיה היא ש-escape characters לא עובדים כמו שצריך
  console.log('\\n🔧 ניסיון עם דפוסים ללא escape:');

  const simplePattern2 = /\\."[א-ת]+/g;
  const simplePattern3 = /"\\.⁯[א-ת]+/g;

  console.log('דפוס פשוט 2:', case2.match(simplePattern2));
  console.log('דפוס פשוט 3:', case3.match(simplePattern3));
}

charByCharDebug();