const fs = require('fs');
const path = require('path');

// פונקציה לניתוח הקובץ הטוב כדי להבין את המבנה הנכון
async function analyzeGoodExample() {
  try {
    console.log('🔍 Analyzing good Word document example...');

    const JSZip = require('jszip');
    const goodDocPath = path.join(__dirname, 'good-example.docx');

    if (!fs.existsSync(goodDocPath)) {
      console.log('❌ Good example document not found');
      return;
    }

    // טעינת הקובץ הטוב
    const docData = fs.readFileSync(goodDocPath);
    const zip = await JSZip.loadAsync(docData);
    const docXml = await zip.file('word/document.xml').async('text');

    console.log('📄 Document loaded successfully');

    // חיפוש אחר תבניות פסקאות
    const paragraphMatches = docXml.match(/<w:p[^>]*>.*?<\/w:p>/gs);
    if (paragraphMatches) {
      console.log(`📝 Found ${paragraphMatches.length} paragraphs`);

      // הצגת כמה פסקאות ראשונות כדוגמה
      console.log('\n🔍 First few paragraphs structure:');
      for (let i = 0; i < Math.min(3, paragraphMatches.length); i++) {
        console.log(`\n--- Paragraph ${i + 1} ---`);
        console.log(paragraphMatches[i].substring(0, 400) + '...');
      }
    }

    // חיפוש אחר טקסט עם סימני פיסוק
    const textMatches = docXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches) {
      console.log('\n🔤 Text elements with potential punctuation:');
      const punctuationTexts = textMatches.filter(match => /[!?":,.]/.test(match));
      punctuationTexts.slice(0, 10).forEach((match, i) => {
        console.log(`${i + 1}: ${match}`);
      });
    }

    // חיפוש אחר הגדרות RTL
    const rtlMatches = docXml.match(/<w:bidi[^>]*\/?>|<w:rtl[^>]*\/?>|w:val="right"/g);
    if (rtlMatches) {
      console.log(`\n📐 Found ${rtlMatches.length} RTL-related settings`);
      console.log('RTL examples:', rtlMatches.slice(0, 5));
    }

    // חיפוש אחר הגדרות פונט
    const fontMatches = docXml.match(/<w:rFonts[^>]*>/g);
    if (fontMatches) {
      console.log(`\n🔤 Found ${fontMatches.length} font settings`);
      console.log('Font examples:', fontMatches.slice(0, 3));
    }

    // שמירת ה-XML המלא לבדיקה
    fs.writeFileSync('good-example-structure.xml', docXml, 'utf8');
    console.log('\n📁 Full XML structure saved to: good-example-structure.xml');

    // יצירת template מבוסס על הקובץ הטוב
    console.log('\n🛠️ Creating template based on good structure...');

    // החלפת התוכן בטקסט placeholder
    let templateXml = docXml;

    // החלפת כל הטקסט בפסקאות ב-placeholders
    templateXml = templateXml.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, '<w:t>REPLACECONTENT</w:t>');

    // יצירת template חדש
    const newZip = new JSZip();
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, templateXml);
      } else if (!file.dir) {
        const content = await file.async('nodebuffer');
        newZip.file(relativePath, content);
      }
    }

    const templateBuffer = await newZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    fs.writeFileSync('perfect-template.docx', templateBuffer);
    console.log('✅ Perfect template created: perfect-template.docx');

    console.log('\n📋 Analysis Summary:');
    console.log('- Good document structure analyzed');
    console.log('- Template created based on working example');
    console.log('- Use this template for proper Hebrew RTL formatting');

  } catch (error) {
    console.error('❌ Error analyzing good example:', error);
  }
}

if (require.main === module) {
  analyzeGoodExample();
}

module.exports = { analyzeGoodExample };