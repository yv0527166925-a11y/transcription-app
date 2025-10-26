const fs = require('fs');
const path = require('path');

// פונקציה ליצירת template נקי ללא כותרת אוטומטית
async function createCleanTemplate() {
  try {
    console.log('🧪 Creating clean template without automatic title...');

    const JSZip = require('jszip');
    const perfectTemplatePath = path.join(__dirname, 'perfect-template.docx');

    if (!fs.existsSync(perfectTemplatePath)) {
      console.log('❌ Perfect template not found');
      return;
    }

    // טעינת התבנית המושלמת
    const templateData = fs.readFileSync(perfectTemplatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    console.log('🔍 Looking for automatic title...');

    // חיפוש ומחיקת כותרות אוטומטיות
    const beforeLength = docXml.length;

    // מחיקת פסקאות שמכילות "תומלל על די אלף בוט" או דברים דומים
    docXml = docXml.replace(/<w:p[^>]*>.*?תומלל על די אלף בוט.*?<\/w:p>/gs, '');
    docXml = docXml.replace(/<w:p[^>]*>.*?transcribed.*?<\/w:p>/gs, '');
    docXml = docXml.replace(/<w:p[^>]*>.*?Generated.*?<\/w:p>/gs, '');

    // מחיקת כותרות ריקות או עם רווחים בלבד
    docXml = docXml.replace(/<w:p[^>]*>\s*<w:pPr>.*?<\/w:pPr>\s*<w:r[^>]*>\s*<w:rPr>.*?<\/w:rPr>\s*<w:t>\s*<\/w:t>\s*<\/w:r>\s*<\/w:p>/gs, '');

    // מחיקת פסקאות ריקות
    docXml = docXml.replace(/<w:p[^>]*>\s*<w:pPr[^>]*\/>\s*<\/w:p>/gs, '');
    docXml = docXml.replace(/<w:p[^>]*>\s*<\/w:p>/gs, '');

    const afterLength = docXml.length;

    if (beforeLength !== afterLength) {
      console.log(`✅ Removed ${beforeLength - afterLength} characters of automatic titles`);
    } else {
      console.log('ℹ️ No automatic titles found to remove');
    }

    // יצירת template נקי
    const newZip = new JSZip();
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, docXml);
      } else if (!file.dir) {
        const content = await file.async('nodebuffer');
        newZip.file(relativePath, content);
      }
    }

    const buffer = await newZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    fs.writeFileSync('clean-template.docx', buffer);
    console.log('✅ Clean template created: clean-template.docx');

    // עכשיו נבדוק עם הטקסט החדש
    await testCleanTemplate();

  } catch (error) {
    console.error('❌ Error creating clean template:', error);
  }
}

// פונקציה לבדיקת התבנית הנקייה
async function testCleanTemplate() {
  try {
    console.log('\n🧪 Testing clean template...');

    const JSZip = require('jszip');
    const cleanTemplatePath = path.join(__dirname, 'clean-template.docx');

    const templateData = fs.readFileSync(cleanTemplatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // טקסט דוגמה ללא כותרת
    const sampleParagraphs = [
      'שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. האם אנחנו באמת מוכנים להתמודד עם זה? אני מאמין שכן, אבל זה דורש מאמץ רב.',
      'בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. "זו הזדמנות זהב", כפי שאמר חברי אתמול. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.',
      'אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה! רגע של בהירות מוחלטת שבו הכל הסתדר במקום. "עכשיו אני מבין", אמרתי לעצמי באותו רגע מכונן.',
      'השאלה החשובה היא: מה אנחנו עושים עם ההבנה הזו? איך אנחנו מתרגמים את זה לפעולה קונקרטית? כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום!'
    ];

    // החלפת התוכן
    docXml = docXml.replace(/<w:t>REPLACECONTENT<\/w:t>/g, () => {
      if (sampleParagraphs.length > 0) {
        const text = sampleParagraphs.shift();
        return `<w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // יצירת קובץ הבדיקה הסופי
    const newZip = new JSZip();
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath === 'word/document.xml') {
        newZip.file(relativePath, docXml);
      } else if (!file.dir) {
        const content = await file.async('nodebuffer');
        newZip.file(relativePath, content);
      }
    }

    const buffer = await newZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    fs.writeFileSync('FINAL-clean-test.docx', buffer);

    console.log('✅ Final clean test created successfully!');
    console.log('📁 File: FINAL-clean-test.docx');
    console.log('🔍 This should have:');
    console.log('   ✅ NO automatic title');
    console.log('   ✅ Perfect RTL alignment');
    console.log('   ✅ Proper punctuation attached to words');
    console.log('   ✅ 4 paragraphs only (content)');

  } catch (error) {
    console.error('❌ Error testing clean template:', error);
  }
}

if (require.main === module) {
  createCleanTemplate();
}

module.exports = { createCleanTemplate };