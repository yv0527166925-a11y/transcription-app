const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testUpload() {
  try {
    console.log('🧪 מבצע בדיקת העלאה לשרת...');

    // יצירת קובץ טקסט לבדיקה
    const testText = `שלום, זה בדיקת תמלול מהשרת החדש.

    הטקסט הזה מכיל פסקאות מרובות. האם הוא יעבוד כהלכה עם הפתרון Python? אני מקווה שכן!

    זו פסקה נוספת עם סימני פיסוק: נקודות, פסיקים, סימני קריאה! וגם נקודותיים: כמו כאן.

    בואו נראה איך זה עובד.`;

    fs.writeFileSync('test-audio-file.txt', testText);

    // יצירת form data
    const form = new FormData();
    form.append('audio', fs.createReadStream('test-audio-file.txt'), {
      filename: 'בדיקת_תמלול_פייתון.txt',
      contentType: 'text/plain'
    });
    form.append('transcription', testText);

    console.log('📤 שולח קובץ לשרת...');

    const response = await axios.post('http://localhost:3000/transcribe', form, {
      headers: {
        ...form.getHeaders(),
      },
      responseType: 'stream'
    });

    // שמירת הקובץ שחזר
    const outputPath = 'בדיקת_פלט_מהשרת.docx';
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    writer.on('finish', () => {
      console.log('✅ קובץ התקבל מהשרת:', outputPath);
      console.log('📊 גודל קובץ:', fs.statSync(outputPath).size, 'bytes');

      // ניקוי
      fs.unlinkSync('test-audio-file.txt');

      console.log('🎉 הבדיקה הושלמה בהצלחה!');
    });

    writer.on('error', (error) => {
      console.error('❌ שגיאה בכתיבת הקובץ:', error);
    });

  } catch (error) {
    console.error('❌ שגיאה בבדיקה:', error.message);
    if (error.response) {
      console.error('📥 תגובת השרת:', error.response.status, error.response.statusText);
    }
  }
}

testUpload();