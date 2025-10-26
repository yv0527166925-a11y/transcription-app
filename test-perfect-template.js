const fs = require('fs');
const path = require('path');

// פונקציה ליצירת Word מהtemplate המושלם
async function testPerfectTemplate() {
  try {
    console.log('🧪 Testing perfect template with proper punctuation...');

    const JSZip = require('jszip');
    const templatePath = path.join(__dirname, 'perfect-template.docx');

    if (!fs.existsSync(templatePath)) {
      console.log('❌ Perfect template not found');
      return;
    }

    // טעינת התבנית המושלמת
    const templateData = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    let docXml = await zip.file('word/document.xml').async('text');

    // טקסט דוגמה עם פיסוק צמוד נכון
    const sampleParagraphs = [
      'שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. האם אנחנו באמת מוכנים להתמודד עם זה? אני מאמין שכן, אבל זה דורש מאמץ רב.',
      'בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. "זו הזדמנות זהב", כפי שאמר חברי אתמול. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.',
      'אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה! רגע של בהירות מוחלטת שבו הכל הסתדר במקום. "עכשיו אני מבין", אמרתי לעצמי באותו רגע מכונן.',
      'השאלה החשובה היא: מה אנחנו עושים עם ההבנה הזו? איך אנחנו מתרגמים את זה לפעולה קונקרטית? כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום!'
    ];

    // יצירת XML עבור הפסקאות החדשות
    let allParagraphsXml = '';

    sampleParagraphs.forEach(paragraphText => {
      // נטרל תווים מיוחדים לXML
      const escapedText = paragraphText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      // יצירת פסקה בפורמט הקובץ הטוב
      const paragraphXml = `<w:p w14:paraId="3A0B1A64" w14:textId="77777777" w:rsidR="00BD31C1" w:rsidRDefault="001C20B4"><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t>${escapedText}</w:t></w:r></w:p>`;

      allParagraphsXml += paragraphXml;
    });

    // החלפת כל ה-REPLACECONTENT בפסקאות החדשות
    docXml = docXml.replace(/<w:t>REPLACECONTENT<\/w:t>/g, () => {
      // מחזיר פסקה ראשונה ומסיר אותה מהרשימה
      if (sampleParagraphs.length > 0) {
        const text = sampleParagraphs.shift();
        return `<w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // יצירת קובץ חדש
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

    fs.writeFileSync('PERFECT-template-test.docx', buffer);

    console.log('✅ Perfect template test created successfully!');
    console.log('📁 File: PERFECT-template-test.docx');
    console.log('🔍 This should have:');
    console.log('   ✅ Perfect RTL alignment like the original');
    console.log('   ✅ Proper punctuation attached to words');
    console.log('   ✅ 4 paragraphs preserved');
    console.log('   ✅ Same styling as the good example document');

  } catch (error) {
    console.error('❌ Error testing perfect template:', error);
  }
}

if (require.main === module) {
  testPerfectTemplate();
}

module.exports = { testPerfectTemplate };