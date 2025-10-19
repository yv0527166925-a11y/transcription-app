/**
 * 🚨 מערכת זיהוי חזרות אינסופיות
 * מזהה רק חזרות אינסופיות רצxxxxxxx AI (7+ חזרות) - לא חזרות טבעיות של דובר
 */

/**
 * מזהה חזרות מעגליות של AI ומתקן אותן
 * @param {string} text - הטקסט לבדיקה
 * @param {number} chunkIndex - מספר הקטע (לצורך לוגים)
 * @returns {string} - טקסט מתוקן ללא חזרות אינסופיות
 */
function detectAndFixRepetitions(text, chunkIndex = 0) {
  console.log(`🔍 Checking chunk ${chunkIndex + 1} for infinite AI repetitions...`);

  if (!text || text.length < 200) {
    return text; // טקסט קצר מדי לבדיקה
  }

  const originalLength = text.length;

  // זיהוי חזרות רצופות של ביטויים (7+ פעמים)
  const fixedText = removeConsecutiveInfiniteRepeats(text);

  const newLength = fixedText.length;
  const reductionPercent = ((originalLength - newLength) / originalLength * 100).toFixed(1);

  if (newLength < originalLength) {
    console.log(`✂️ Fixed AI infinite loops in chunk ${chunkIndex + 1}: ${originalLength} → ${newLength} chars (${reductionPercent}% reduction)`);
  } else {
    console.log(`✅ No infinite AI loops found in chunk ${chunkIndex + 1}`);
  }

  return fixedText;
}

/**
 * מסיר חזרות רצופות של ביטויים (7+ פעמים רצxxxxxxxxxxx
function removeConsecutiveInfiniteRepeats(text) {
  const MIN_CONSECUTIVE_REPEATS = 7; // מינימום 7 חזרות רצxxxxxxxxxxxxxxxxxx_PHRASE_WORDS = 4; // מינימום 4 מילים בביטוי
  const MAX_PHRASE_WORDS = 30; // מקסימום 30 מילים בביטוי

  const words = text.split(/\s+/);

  if (words.length < MIN_CONSECUTIVE_REPEATS * MIN_PHRASE_WORDS) {
    return text;
  }

  // בדיקה לכל אורך ביטוי אפשרי
  for (let phraseLength = MIN_PHRASE_WORDS; phraseLength <= MAX_PHRASE_WORDS; phraseLength++) {
    const result = detectAndRemoveRepeatsOfLength(words, phraseLength, MIN_CONSECUTIVE_REPEATS);

    if (result.length < words.length) {
      console.log(`🔧 Removed ${phraseLength}-word phrases repeated ${MIN_CONSECUTIVE_REPEATS}+ times consecutively`);
      return result.join(' ');
    }
  }

  return text;
}

/**
 * מזהה ומסיר חזרות רצופות של ביטוי באורך מסוים
 */
function detectAndRemoveRepeatsOfLength(words, phraseLength, minRepeats) {
  const result = [];
  let i = 0;

  while (i < words.length) {
    if (i + phraseLength > words.length) {
      // לא מספיק מילים לביטוי מלא - העתק את השאר
      result.push(...words.slice(i));
      break;
    }

    const currentPhrase = words.slice(i, i + phraseLength);
    const consecutiveCount = countConsecutiveRepeats(words, i, phraseLength);

    if (consecutiveCount >= minRepeats) {
      // נמצאה חזרה אינסופית! שמור רק עותק אחד
      result.push(...currentPhrase);

      const phraseText = currentPhrase.join(' ');
      console.log(`🗑️ Removed ${consecutiveCount - 1} consecutive repeats of: "${phraseText.substring(0, 60)}..."`);

      // דלג על כל החזרות
      i += consecutiveCount * phraseLength;
    } else {
      // לא חזרה אינסופית - העתק את המילה
      result.push(words[i]);
      i++;
    }
  }

  return result;
}

/**
 * סופר כמה פעמים ביטוי חוזר רצוף החל ממיקום מסוים
 */
function countConsecutiveRepeats(words, startIndex, phraseLength) {
  const originalPhrase = words.slice(startIndex, startIndex + phraseLength);
  const originalText = originalPhrase.join(' ').toLowerCase().trim();

  let count = 1; // הספירה מתחילה מ-1 (המופע הראשון)
  let currentIndex = startIndex + phraseLength;

  while (currentIndex + phraseLength <= words.length) {
    const currentPhrase = words.slice(currentIndex, currentIndex + phraseLength);
    const currentText = currentPhrase.join(' ').toLowerCase().trim();

    if (currentText === originalText) {
      count++;
      currentIndex += phraseLength;
    } else {
      break; // החזרה הרצופה הסתיימה
    }
  }

  return count;
}

module.exports = {
  detectAndFixRepetitions
};