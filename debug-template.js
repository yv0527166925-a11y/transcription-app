const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function debugTemplate() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    let documentXml = await zip.file('word/document.xml').async('string');

    console.log('🔍 מה יש בתבנית:');
    console.log('האם יש TITLE?', documentXml.includes('TITLE'));
    console.log('האם יש CONTENT?', documentXml.includes('CONTENT'));

    // נבדוק אם יש את הטקסט המקורי
    console.log('האם יש טקסט של פרשת בחוקותי?', documentXml.includes('בחוקותי'));
    console.log('האם יש טקסט של עקב?', documentXml.includes('עקב'));

    // נבדוק כמה פסקאות יש
    const paragraphCount = (documentXml.match(/<w:p>/g) || []).length;
    console.log('מספר פסקאות בתבנית:', paragraphCount);

    // נחפש placeholders אחרים
    const possiblePlaceholders = ['PLACEHOLDER', 'TEXT', 'BODY', 'CONTENT_HERE'];
    possiblePlaceholders.forEach(placeholder => {
      if (documentXml.includes(placeholder)) {
        console.log(`מצאתי placeholder: ${placeholder}`);
      }
    });

  } catch (error) {
    console.error('❌ שגיאה בבדיקת התבנית:', error);
  }
}

debugTemplate();