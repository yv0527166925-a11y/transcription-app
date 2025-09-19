// פתרון סופי לבעיית הגרשיים
function fixQuotationsRobust(text) {
  console.log('🔧 Applying robust quotation fixes...');

  // שלב 1: נקה סוגי גרשיים שונים לאחיד
  text = text.replace(/["\u0022\u201C\u201D]/g, '"');

  // שלב 2: הוסף רווחים לפני גרשיים שצמודים למילים עבריות
  // זה מטפל בבעיות כמו: כותבת"המצוות
  text = text.replace(/([א-ת])"([א-ת])/g, '$1 "$2');

  // שלב 3: תקן גרשיים שיש להם רווח מיותר לפני הם
  text = text.replace(/([א-ת])\s{2,}"([א-ת])/g, '$1 "$2');

  // שלב 4: תקן גרשיים עם פיסוק
  text = text.replace(/([א-ת])"([.,!?])/g, '$1"$2');

  // שלב 5: תקן תחילת ציטוטים
  text = text.replace(/\s"([א-ת])/g, ' "$1');
  text = text.replace(/^"([א-ת])/gm, '"$1');

  console.log('✅ Quotation fixes completed');
  return text;
}

// בדיקה על הדוגמאות
const testText = `למה התורה כותבת"המצוות שאדם דש"?  אתה שואל אותו"מה?", אתה שואל אותם"מה?" ישראל"מאפטא`;

console.log('Before:');
console.log(testText);

const fixed = fixQuotationsRobust(testText);

console.log('\nAfter:');
console.log(fixed);

console.log('\n=== Expected Result ===');
console.log('למה התורה כותבת "המצוות שאדם דש"? אתה שואל אותו "מה?", אתה שואל אותם "מה?" ישראל "מאפטא');