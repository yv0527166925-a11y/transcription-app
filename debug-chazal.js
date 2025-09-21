// דיבוג בעיית חז"ל
function debugChazal() {
  console.log('🐛 Debugging חז"ל issue...');

  let text = 'חז "לים';
  console.log('לפני:', text);

  // בדיקת התקנות שונות
  text = text.replace(/חז\s+"לים/g, 'חז"לים');
  console.log('אחרי replace 1:', text);

  text = 'חז "לים';
  text = text.replace(/חז\s+"\s*לים/g, 'חז"לים');
  console.log('אחרי replace 2:', text);

  text = 'חז "לים';
  text = text.replace(/חז\s*"\s*לים/g, 'חז"לים');
  console.log('אחרי replace 3:', text);

  // הפעל את הרגקס שיש לנו
  text = 'חז "לים';
  text = text
    .replace(/["\u0022\u201C\u201D]/g, '"')
    .replace(/חז\s+"לים/g, 'חז"לים')
    .replace(/חז\s+"\s*לים/g, 'חז"לים');
  console.log('אחרי הכל:', text);
}

debugChazal();