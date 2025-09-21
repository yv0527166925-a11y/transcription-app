// בדיקה סופית של חז לים
function debugChazalimFinal() {
  console.log('🐛 Final debug of חז "לים...');

  let text = 'חז "לים';
  console.log('תחילה:', text);

  // בדיקת הדפוסים שלנו
  const patterns = [
    /חז\s*"\s*לים/g,
    /חז\s+"\s*לים/g
  ];

  patterns.forEach((pattern, index) => {
    const matches = text.match(pattern);
    console.log(`Pattern ${index + 1} (${pattern}): ${matches ? 'MATCH' : 'NO MATCH'}`);
    if (matches) {
      const result = text.replace(pattern, 'חז"לים');
      console.log(`  Result: "${result}"`);
    }
  });

  // בדיקה מדויקת של הטקסט מהבדיקה
  const fullText = 'שליט" א  אמינים האר\'י ז" ל חז "לים ב "צילא דמהימנותא" הוא יפרע ממי שאינו עומד בדיבורו." ה "אור החיים" העילוי של הישיבה הוא בדף ל\', אתה בק" ב.';
  console.log('\\nמהטקסט המלא:');

  const chazalMatch = fullText.match(/חז[^א-ת]*לים/g);
  console.log('מצא חז...לים:', chazalMatch);

  if (chazalMatch) {
    console.log('התו-by-תו של החלק הזה:');
    const part = chazalMatch[0];
    for (let i = 0; i < part.length; i++) {
      const char = part[i];
      console.log(`  ${i}: "${char}" (U+${char.charCodeAt(0).toString(16).toUpperCase()})`);
    }
  }

  // נסה להחליף
  const fixed = fullText.replace(/חז\s*"\s*לים/g, 'חז"לים');
  console.log('\\nאחרי תיקון:');
  console.log(fixed);
  console.log('\\nהאם השתנה?', fullText !== fixed);
}

debugChazalimFinal();