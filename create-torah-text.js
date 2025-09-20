const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fixHebrewPunctuation(text) {
  text = text.replace(/\."/g, '".');
  text = text.replace(/,"/g, '",');
  text = text.replace(/;"/g, '";');
  return text;
}

async function createTorahText() {
  try {
    const templatePath = path.join(__dirname, 'חזר מהשרת תקין 2.docx');
    const outPath = path.join(__dirname, 'torah-text-ki-tavo-fixed.docx');

    // הטקסט המלא של המשתמש על פרשת כי תבוא
    let torahText = `כל הלשון, כל התורה בכל מקום. אני רוצה ברשותכם ללמוד טייטש היום. אני חושב שהטייטש הזה הוא אמיתי. חז"ל כתוב שקוראים פרשת כי תבוא תמיד שבת לא סמוך לראש השנה, אלא בשבת לפני ראש השנה כשיש עוד שבת, פרשת ניצבים שמפריד ביניהם. ולמה קוראים את פרשת כי תבוא? "תכלה שנה וקללותיה". תכלה שנה וקללותיה.

זאת אומרת, כולנו יש לנו תקווה שהקדוש ברוך הוא בראש השנה הבא, ראש השנה תשפ"ו, הקדוש ברוך הוא יכתוב אותנו ויחתום אותנו כולנו רק לדברים טובים ונפלאים. אז צריכים סימנא מילתא, "תכלה שנה וקללותיה". זכינו גם לראות בדף היומי היום, בראש השנה יש עניין להביא, כרתי, סלקא, רוביא. סימנא מילתא.

יש לי איזושהי תחושה שיש פה קצת יותר מאשר סימנא מילתא בקריאת פרשת כי תבוא. פרשת כי תבוא מתחילה עם הבאת ביכורים שמביאים את זה בשמחה גדולה מאוד. ויושב, מגיע הבן אדם ומביא את הביכורים, אז הוא מתחיל לספר היסטוריה.

וענית ואמרת, "ארמי אובד אבי וירד מצרימה", וירעו אותנו המצרים, ונצעק אל השם אלוקינו, ויוציאנו, והביא אותנו למקום הזה, ארץ זבת חלב ודבש. ובסוף, "ושמחת בכל הטוב אשר נתן לך השם אלוקיך". אז הסיכום הוא "ושמחת בכל הטוב". מה זה "בכל הטוב"? ושמחת בטוב. תכף נראה.

בקללות, יש פה איזה ייחוד מיוחד בקללות, שיש פה רשימה שלמה, רחמנא ליצלן, של קללות שהתורה אומרת, תשמע, יהיה לך בלי סוף, אבל זה יגיע עד אליך. אתה כמעט לא תהנה מזה. "זרע רב תוציא השדה ומעט תאסוף, כי יחסלנו הארבה. כרמים תיטע ועבדת, ויין לא תשתה, כי תאכלנו התולעת. זיתים יהיה לך בכל גבולך, ושמן לא תסוך. בנים ובנות תוליד ולא יהיו לך, כי ילכו בשבי". בקיצור, יהיה לך בלי סוף, אבל זה לא יגיע אליך. זה לא שלא יהיה, לא יהיה רעב, לא יהיה בעיה בילודה, יהיה, תוליד בנים, יהיה בלי סוף, אבל זה לא יגיע אליך. זה חלק ארי מדברי הקללות שהתורה פה אומרת. אז מה מונח כאן?

והתורה מסכמת שכל זה "תחת אשר לא עבדת את השם אלוקיך בשמחה ובטוב לבב מרוב כל". רבותיי, יש פה ממש נבואת התורה על התקופה שלנו. אני לא יודע אם אם חוץ מבזמן שבית מקדש ראשון, אם היה בעולם כזה מין שפע שאי אפשר בכלל לתאר. הכל יש. הכל יש.

אבל תצא לרחובה של עיר, גם בעיר שלנו, גם בשכונות שלנו, גם בבתים שלנו, ותשאל בני אדם מה נשמע, ומי שאומר לך "על הפנים" זה תגובה אופטימית. ותשמע ממנו רק מה שאין לו. ויש בלי סוף, ואתה פותח את העיתונים וכל הזמן רק משדרים לך עד כמה אתה מפגר, וכמה אין לך. והתורה מדברת על זה. בדיוק זה נבואת התורה.

על המצב הזה שיהיה לך בלי סוף, יהיה לך ילדים ברוך השם, והם ישבו בחדרים, וילכו לישיבות, ובנות הולכות לסמינרים, ואתה רק תראה מה הבעיות של הילדים שלך. על זה, זה הקללה שמדברת התורה. הרב דסלר לימד שהקללות של התורה, הקדוש ברוך הוא לא ערבי. ערבים מקללים. הקדוש ברוך הוא לא מקלל.

הקללה זה המציאות של העין שלנו, איך אנחנו מסתכלים על העולם. אומר הקדוש ברוך הוא, תדע לך, שאם אתה לא תעמול לחיות בשמחה, לא רק בשמחה, בטוב לבב, מרוב כל, אומר רש"י, מתוך תחושה שיש לך הכל, אם לא תהיה שם, המציאות בעולם תהיה שיש לך בלי סוף, אבל הכל יהיה, הכל יהיה מצב של מחסור. תדע למה?`;

    // מתקנים את סדר הפיסוק
    torahText = fixHebrewPunctuation(torahText);

    const paragraphs = torahText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n\s*\n/)
      .filter(p => p.length > 0);

    const zip = new JSZip();
    const buffer = fs.readFileSync(templatePath);
    await zip.loadAsync(buffer);

    console.log('📖 יוצר מסמך עם טקסט התורה על פרשת כי תבוא...');

    // מתקנים הגדרות שפה בכל הקבצים
    if (zip.files['word/styles.xml']) {
      let stylesXml = await zip.file('word/styles.xml').async('string');
      stylesXml = stylesXml.replace(/w:val="ar-SA"/g, 'w:val="he-IL"');
      stylesXml = stylesXml.replace(/w:eastAsia="ar-SA"/g, 'w:eastAsia="he-IL"');
      stylesXml = stylesXml.replace(/w:bidi="ar-SA"/g, 'w:bidi="he-IL"');
      zip.file('word/styles.xml', stylesXml);
    }

    let documentXml = await zip.file('word/document.xml').async('string');

    const bodyStart = documentXml.indexOf('<w:body>') + '<w:body>'.length;
    const bodyEnd = documentXml.indexOf('</w:body>');

    let newBodyContent = '';
    paragraphs.forEach(paragraph => {
      newBodyContent += `
    <w:p w14:paraId="13B47B51" w14:textId="77777777" w:rsidR="007754CD" w:rsidRDefault="00E60846">
      <w:pPr>
        <w:jc w:val="right"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>
        </w:rPr>
        <w:t>${escapeXml(paragraph)}</w:t>
      </w:r>
    </w:p>`;
    });

    const newDocumentXml = documentXml.substring(0, bodyStart) +
                          newBodyContent +
                          documentXml.substring(bodyEnd);

    zip.file('word/document.xml', newDocumentXml);

    const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outPath, outBuffer);

    console.log('✅ יצרתי מסמך עם טקסט התורה:', outPath);
    console.log('📊 מספר פסקאות:', paragraphs.length);
    console.log('📖 הנושא: פרשת כי תבוא - שמחה ובטוב לבב');
    console.log('🔧 הגדרות: עברית תקינה + יישור לימין + פיסוק מתוקן');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  }
}

createTorahText();