// בדיקת הלוגיקה האגרסיבית על חז לים
function debugAggressiveChazal() {
  console.log('🐛 Testing aggressive logic on חז "לים...');

  let text = 'חז "לים';
  console.log('תחילה:', text);

  // קודם כל - נקה את כל הגרשיים לסוג אחיד
  text = text.replace(/["\u0022\u201C\u201D]/g, '"');
  console.log('אחרי ניקוי גרשיים:', text);

  // **שלב א: תיקון קיצורים נפוצים - ללא פשרות**
  const hebrewAbbreviations = [
    ['רש', 'י'], ['חז', 'ל'], ['שליט', 'א'], ['החיד', 'א'],
    ['הגר', 'א'], ['רמב', 'ם'], ['רמב', 'ן'], ['משנ', 'ב'],
    ['שו', 'ע'], ['שו', 'ת'], ['מהר', 'ל'], ['בק', 'ב'],
    ['ב', 'ה'], ['ד', 'ה']
  ];

  console.log('\\nבדיקת דפוסים עבור חז-ל:');
  const [first, second] = ['חז', 'ל'];
  const patterns = [
    `${first}\\s*"\\s*${second}`,    // רש " י
    `${first}\\s+"\\s*${second}`,    // רש  " י
    `${first}"\\s*${second}`,        // רש" י
    `${first}\\s*"${second}`,        // רש "י
    `${first}"${second}`             // רש"י (כבר נכון)
  ];

  patterns.forEach((pattern, index) => {
    const regex = new RegExp(pattern, 'g');
    const matches = text.match(regex);
    console.log(`Pattern ${index + 1}: ${pattern}`);
    console.log(`  Matches: ${matches ? matches.join(', ') : 'none'}`);
    if (matches) {
      const result = text.replace(regex, `${first}"${second}`);
      console.log(`  Result: ${result}`);
      text = result; // Apply the change for next pattern
    }
  });

  console.log('\\nסופי:', text);

  // נסה עכשיו את אותו דבר עבור "לים"
  console.log('\\n--- בדיקת "לים" נפרד ---');
  const testChazalim = 'חז "לים';
  console.log('בדיקה:', testChazalim);

  // דפוס פשוט
  const simplePattern = /חז\s+"לים/g;
  const match = testChazalim.match(simplePattern);
  console.log('דפוס /חז\\s+"לים/g:', match ? 'MATCH' : 'NO MATCH');

  if (match) {
    const fixed = testChazalim.replace(simplePattern, 'חז"לים');
    console.log('תוצאה:', fixed);
  }
}

debugAggressiveChazal();