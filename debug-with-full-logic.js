// העתק מדויק של הלוגיקה מהשרת
function debugWithFullLogic() {
  console.log('🐛 Testing with full server logic...');

  const problemText = `שליט" א  אמינים האר'י ז" ל חז "לים ב "צילא דמהימנותא" הוא יפרע ממי שאינו עומד בדיבורו." ה "אור החיים" העילוי של הישיבה הוא בדף ל', אתה בק" ב.`;

  console.log('לפני תיקון:');
  console.log(problemText);

  // העתק הקוד המתוקן מהשרת
  let text = problemText
    // תיקון קיצורים עבריים נפוצים עם רווחים תקינים
    .replace(/רש\s*["\u0022\u201C\u201D]\s*י/g, 'רש"י')
    .replace(/חז\s*["\u0022\u201C\u201D]\s*ל/g, 'חז"ל')
    .replace(/החיד\s*["\u0022\u201C\u201D]\s*א/g, 'החיד"א')
    .replace(/הגר\s*["\u0022\u201C\u201D]\s*א/g, 'הגר"א')
    .replace(/רמב\s*["\u0022\u201C\u201D]\s*ם/g, 'רמב"ם')
    .replace(/רמב\s*["\u0022\u201C\u201D]\s*ן/g, 'רמב"ן')
    .replace(/משנ\s*["\u0022\u201C\u201D]\s*ב/g, 'משנ"ב')
    .replace(/שו\s*["\u0022\u201C\u201D]\s*ע/g, 'שו"ע')
    .replace(/שו\s*["\u0022\u201C\u201D]\s*ת/g, 'שו"ת')
    .replace(/מהר\s*["\u0022\u201C\u201D]\s*ל/g, 'מהר"ל');

  console.log('\\nמוקד על חז לים אחרי תיקון ראשוני:');
  console.log('חז לים:', text.match(/חז[^א-ת]*לים/g));

  text = text
    // תיקון קיצורים שנפרדו כבר בתמלול - גרסה מורחבת
    .replace(/חז\s+"\s*ל/g, 'חז"ל')
    .replace(/רש\s+"\s*י/g, 'רש"י')
    .replace(/שליט\s*"\s*א/g, 'שליט"א')
    .replace(/האר['׳]\s*י\s+ז\s*"\s*ל/g, 'האר"י ז"ל')
    .replace(/ר['׳]\s/g, 'ר\' ')
    .replace(/ר"/g, 'ר\'');

  console.log('חז לים אחרי תיקון שני:');
  console.log('חז לים:', text.match(/חז[^א-ת]*לים/g));

  console.log('\\nהטקסט המלא אחרי הכל:');
  console.log(text);
}

debugWithFullLogic();