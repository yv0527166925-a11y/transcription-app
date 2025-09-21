// דיבוג בעיות פיסוק
function debugPunctuation() {
  console.log('🐛 Debugging punctuation issues step by step...');

  let text1 = 'הוא אמר"אני הולך הביתה".';
  console.log('1. לפני:', text1);
  text1 = text1.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
  console.log('   אחרי הוספת רווח לפני גרשיים:', text1);
  text1 = text1.replace(/"([א-ת])/g, '" $1');
  console.log('   אחרי הוספת רווח אחרי גרשיים:', text1);

  let text2 = 'אמר"שלום."והלך.';
  console.log('\\n2. לפני:', text2);
  // תיקון הנקודה שצריכה להיות לפני הגרשיים
  text2 = text2.replace(/([א-ת])\\."/g, '$1".');
  console.log('   אחרי העברת נקודה לפני גרשיים:', text2);
  // הוספת רווחים
  text2 = text2.replace(/([א-ת])"([א-ת])/g, '$1 "$2');
  console.log('   אחרי הוספת רווח לפני גרשיים:', text2);
  text2 = text2.replace(/"\\.([א-ת])/g, '". $1');
  console.log('   אחרי הוספת רווח אחרי נקודה:', text2);

  let text3 = '"מה אתה אומר"שאל הרב.';
  console.log('\\n3. לפני:', text3);
  text3 = text3.replace(/"([א-ת])/g, '" $1');
  console.log('   אחרי הוספת רווח אחרי גרשיים סוגרים:', text3);
}

debugPunctuation();