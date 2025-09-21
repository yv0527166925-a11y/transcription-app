const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testPythonDocx() {
  try {
    console.log('🧪 בודק פתרון Python לקובץ Word...');

    const outputPath = path.join(__dirname, 'בדיקת_פייתון.docx');

    const testText = `זה טקסט לבדיקה של פיסוק, כמו זה. האם הוא עובד כהלכה? כן אני חושב: זה נראה טוב; לא יודע.

הנה פסקה נוספת עם טקסט ארוך יותר. זה מבחן לראות איך הפייתון מתמודד עם פסקאות מרובות.

פסקה שלישית עם סימני פיסוק שונים! האם זה עובד? בדיקת נקודותיים: כן זה עובד.`;

    const pythonData = JSON.stringify({
      transcription: testText,
      title: 'בדיקת פייתון',
      output_path: outputPath
    });

    console.log('🐍 קורא לסקריפט Python...');

    const pythonProcess = spawn('python', ['generate_word_doc.py', pythonData], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ הסקריפט הושלם בהצלחה');
        console.log('📤 Output:', output);

        if (fs.existsSync(outputPath)) {
          console.log('✅ קובץ Word נוצר בהצלחה:', outputPath);
          console.log('📊 גודל קובץ:', fs.statSync(outputPath).size, 'bytes');
        } else {
          console.log('❌ קובץ Word לא נוצר');
        }
      } else {
        console.log(`❌ הסקריפט נכשל עם קוד ${code}`);
        console.log('📥 Error output:', errorOutput);
        console.log('📤 Standard output:', output);
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('❌ שגיאה בהפעלת Python:', error);
    });

  } catch (error) {
    console.error('❌ שגיאה כללית:', error);
  }
}

testPythonDocx();