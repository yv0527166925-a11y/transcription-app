// בדיקה של פונקציית הסרת חזרות קיצוניות

// פונקציה להסרת חזרות של ביטויים/משפטים שחוזרים 5+ פעמים
function removeExtremeRepetitions(text) {
  if (!text) return text;

  // הסר חזרות של ביטויים (2-15 מילים) שחוזרים 5+ פעמים
  let cleaned = text;

  for (let wordCount = 2; wordCount <= 15; wordCount++) {
    const pattern = new RegExp(`((?:\\S+\\s+){${wordCount-1}}\\S+)(?:\\s+\\1){4,}`, 'gi');
    cleaned = cleaned.replace(pattern, '$1');
  }

  return cleaned;
}

// טקסט בדיקה עם הדוגמה שלך
const testText = `זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד`;

console.log('📝 BEFORE:');
console.log(`Length: ${testText.length} characters`);
console.log(testText.substring(0, 200) + '...');

console.log('\n🧹 AFTER:');
const cleaned = removeExtremeRepetitions(testText);
console.log(`Length: ${cleaned.length} characters`);
console.log(cleaned);

console.log('\n📊 RESULTS:');
console.log(`Reduction: ${testText.length - cleaned.length} characters`);
console.log(`Reduction percentage: ${((testText.length - cleaned.length) / testText.length * 100).toFixed(1)}%`);