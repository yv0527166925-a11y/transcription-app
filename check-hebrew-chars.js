// בדיקת תווים עבריים
function checkHebrewChars() {
  console.log('🔍 בדיקת תווים עבריים');

  const chars = ['ו', 'ה', 'א', 'ת'];
  const hebrewPattern = /[א-ת]/;

  chars.forEach(char => {
    console.log(`תו "${char}": Unicode ${char.charCodeAt(0)} - תואם לדפוס עברי: ${hebrewPattern.test(char)}`);
  });

  // בדיקת הטקסטים הספציפיים
  console.log('\\n🎯 בדיקת הטקסטים הספציפיים:');

  const case2 = 'אמר "שלום."והלך.';
  const case3 = 'הם קראו "שמע ישראל".היום.';

  console.log('מקרה 2:');
  console.log('טקסט:', case2);
  console.log('תו ו (אחרי ."):', case2.charAt(case2.indexOf('."') + 2));
  console.log('Unicode של ו:', case2.charAt(case2.indexOf('."') + 2).charCodeAt(0));

  console.log('\\nמקרה 3:');
  console.log('טקסט:', case3);
  console.log('תו ה (אחרי ".):', case3.charAt(case3.indexOf('".') + 2));
  console.log('Unicode של ה:', case3.charAt(case3.indexOf('".') + 2).charCodeAt(0));

  // בדיקת הדפוסים החדשים
  console.log('\\n🧪 בדיקת דפוסים מדויקים:');

  // מקרה 2: ."ו
  const pattern2 = /\\."ו/g;
  const match2 = case2.match(pattern2);
  console.log(`דפוס ."ו:`, match2);

  if (match2) {
    const fixed2 = case2.replace(pattern2, '." ו');
    console.log('תוצאה:', fixed2);
  }

  // מקרה 3: ".ה
  const pattern3 = /"\\.ה/g;
  const match3 = case3.match(pattern3);
  console.log(`דפוס ".ה:`, match3);

  if (match3) {
    const fixed3 = case3.replace(pattern3, '". ה');
    console.log('תוצאה:', fixed3);
  }

  // דפוס כללי לכל התווים העבריים
  console.log('\\n🎯 דפוס כללי:');
  const generalPattern2 = /\\."([א-ת])/g;
  const generalPattern3 = /"\\.([א-ת])/g;

  console.log('מקרה 2 עם דפוס כללי:', case2.replace(generalPattern2, '." $1'));
  console.log('מקרה 3 עם דפוס כללי:', case3.replace(generalPattern3, '". $1'));
}

checkHebrewChars();