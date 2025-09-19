// דיבוג הרצף המלא
function debugFullChain() {
  console.log('🐛 Debugging full chain...');

  let text = 'חז "לים';
  console.log('תחילה:', text);

  // שלב 1: נקה סוגי גרשיים שונים לאחיד
  text = text.replace(/["\u0022\u201C\u201D]/g, '"');
  console.log('אחרי ניקוי גרשיים:', text);

  // שלב 7: תקן גרשיים סוגרים צמודים למילה הבאה
  let before = text;
  text = text.replace(/([א-ת])"([א-ת])/g, '$1" $2');
  console.log('אחרי שלב 7 (מפריד מילים עבריות):', text);
  console.log('האם השתנה?', before !== text);

  // תיקון סופי של חז"ל עם רווח
  text = text.replace(/חז\s+"לים/g, 'חז"לים');
  console.log('אחרי תיקון סופי:', text);
}

debugFullChain();