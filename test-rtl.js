const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

const transcribedText = "זהו משפט ניסיון בעברית כדי לבדוק את היישור לימין ואת כיווניות הטקסט. אם שורה זו מופיעה בצד ימין של המסמך, הפתרון עובד.";

// יצירת מחרוזת HTML פשוטה. החלק הקריטי הוא הגדרות ה-style בתוך תג ה-body
const htmlString = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>תמלול</title>
    </head>
    <body style="direction: rtl; text-align: right; font-family: Arial;" lang="he">
      <h1>תמלול אוטומטי</h1>
      <p>${transcribedText}</p>
    </body>
  </html>
`;

// המרה ושמירה לקובץ
(async () => {
  const fileBuffer = await HTMLtoDOCX(htmlString, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  });

  fs.writeFile('My-RTL-Hebrew-Language.docx', fileBuffer, (error) => {
    if (error) {
      console.log('Docx creation failed');
      return;
    }
    console.log('Docx created successfully!');
  });
})();
