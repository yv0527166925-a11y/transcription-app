// בדיקת סוג התווים בחז "לים
function debugChazalChar() {
  console.log('🐛 Debugging character types in חז "לים...');

  const text = 'חז "לים';
  console.log('Original text:', text);

  // בדיקת כל תו
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    console.log(`Position ${i}: "${char}" - Unicode: U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  }

  // בדיקת התאמות
  const patterns = [
    /חז\s+"לים/g,
    /חז\s*"\s*לים/g,
    /חז\s+"\s*לים/g,
    /חז[\s]*"[\s]*לים/g
  ];

  patterns.forEach((pattern, index) => {
    const match = text.match(pattern);
    console.log(`Pattern ${index + 1} (${pattern}): ${match ? 'MATCH' : 'NO MATCH'}`);
  });

  // בדיקת גרשיים שונים
  console.log('\nChecking different quote types:');
  const quotes = ['"', '\u0022', '\u201C', '\u201D'];
  quotes.forEach((quote, index) => {
    const testText = `חז ${quote}לים`;
    console.log(`Quote type ${index + 1} (${quote} - U+${quote.charCodeAt(0).toString(16).toUpperCase()}): "${testText}"`);
    const pattern = new RegExp(`חז\\s+${quote}לים`, 'g');
    const match = testText.match(pattern);
    console.log(`  Pattern match: ${match ? 'YES' : 'NO'}`);
  });
}

debugChazalChar();