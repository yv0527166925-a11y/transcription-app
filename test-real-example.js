// בדיקה על הדוגמה האמיתית מהתמלול

// פונקציה להסרת חזרות של ביטויים/משפטים שחוזרים 5+ פעמים
function removeExtremeRepetitions(text) {
  if (!text) return text;

  console.log('🔍 Checking for extreme repetitions...');

  // הסר חזרות של ביטויים (2-15 מילים) שחוזרים 5+ פעמים
  let cleaned = text;

  for (let wordCount = 2; wordCount <= 15; wordCount++) {
    const pattern = new RegExp(`((?:\\S+\\s+){${wordCount-1}}\\S+)(?:\\s+\\1){4,}`, 'gi');

    cleaned = cleaned.replace(pattern, (match, capturedPhrase) => {
      const repetitionCount = (match.match(new RegExp(escapeRegex(capturedPhrase), 'gi')) || []).length;
      console.log(`⚠️ Found extreme repetition: "${capturedPhrase}" repeated ${repetitionCount} times - keeping only 1`);
      return capturedPhrase;
    });
  }

  return cleaned;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// הטקסט האמיתי מהתמלול (החלק הבעייתי)
const problemText = `זה כל הזמן להגיע עד הסוף. זה היה מגיע עד הסוף, עד הסוף, עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד הסוף. זה היה מגיע עד`;

console.log('📝 BEFORE cleaning:');
console.log(`Length: ${problemText.length} characters`);
console.log(`First 200 chars: ${problemText.substring(0, 200)}...`);
console.log(`Last 200 chars: ...${problemText.substring(problemText.length - 200)}`);

console.log('\n🧹 APPLYING removeExtremeRepetitions...\n');

const cleaned = removeExtremeRepetitions(problemText);

console.log('\n📝 AFTER cleaning:');
console.log(`Length: ${cleaned.length} characters`);
console.log(`Result: ${cleaned}`);

console.log('\n📊 SUMMARY:');
console.log(`Original length: ${problemText.length} characters`);
console.log(`Cleaned length: ${cleaned.length} characters`);
console.log(`Reduction: ${problemText.length - cleaned.length} characters (${((problemText.length - cleaned.length) / problemText.length * 100).toFixed(1)}%)`);

// בדוק אם הטקסט הטוב נשמר
const hasGoodContent = cleaned.includes('זה כל הזמן להגיע עד הסוף');
const hasProblematicRepetition = (cleaned.match(/זה היה מגיע עד הסוף/g) || []).length > 5;

console.log('\n✅ SAFETY CHECK:');
console.log(`Good content preserved: ${hasGoodContent ? 'YES' : 'NO'}`);
console.log(`Still has problematic repetitions: ${hasProblematicRepetition ? 'YES' : 'NO'}`);