const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function createSimpleTemplate() {
  try {
    // נעתיק את הקובץ הטוב ונחליף את התוכן
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    // ניצור XML פשוט עם פסקה אחת שמכילה CONTENT
    const simpleXml = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
    <w:p w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:t>CONTENT</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    // נחליף את document.xml
    zip.file('word/document.xml', simpleXml);

    // נשמור כתבנית חדשה
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync('template-simple.docx', outBuffer);
    console.log('✅ יצרתי תבנית פשוטה: template-simple.docx');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createSimpleTemplate();