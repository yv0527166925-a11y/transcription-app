// דיבוג הבדיקה המדויקת כמו בקובץ הבדיקה
function debugExactTest() {
  console.log('🐛 Debugging exact test case...');

  const problemText = `שליט" א  אמינים האר'י ז" ל חז "לים ב "צילא דמהימנותא" הוא יפרע ממי שאינו עומד בדיבורו." ה "אור החיים" העילוי של הישיבה הוא בדף ל', אתה בק" ב.`;

  console.log('לפני תיקון:');
  console.log(problemText);

  // רק הבדיקה של חז לים
  let text = problemText;
  console.log('\\nמוקד על חז לים:');
  console.log('לפני:', text.match(/חז[^א-ת]*לים/g));

  // הפעל רק את התיקונים הרלוונטיים
  text = text
    .replace(/["\u0022\u201C\u201D]/g, '"')
    .replace(/חז\s+"לים/g, 'חז"לים')
    .replace(/חז\s+"\s*לים/g, 'חז"לים');

  console.log('אחרי:', text.match(/חז[^א-ת]*לים/g));
  console.log('הטקסט המלא:');
  console.log(text);
}

debugExactTest();