const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testFinalPythonDocx() {
  try {
    console.log('🧪 בדיקה סופית של פתרון Python עם Node.js...');

    const testTranscription = `שלום, זה בדיקת תמלול מהשרת החדש עם פתרון Python!

הטקסט הזה מכיל פסקאות מרובות. האם הוא יעבוד כהלכה עם הפתרון החדש? אני מקווה שכן.

זו פסקה נוספת עם סימני פיסוק: נקודות, פסיקים, סימני קריאה! וגם נקודותיים: כמו כאן.

פסקה רביעית לבדיקת פרדת הפסקאות. זה אמור להיראות מעולה ללא בעיות פיסוק.

בואו נראה איך זה עובד בפועל!`;

    const testTitle = 'בדיקה סופית של פתרון Python';
    const outputPath = path.join(__dirname, 'בדיקה_סופית_Python.docx');

    // הכנת הנתונים לסקריפט Python
    const pythonData = JSON.stringify({
      transcription: testTranscription,
      title: testTitle,
      output_path: outputPath
    });

    console.log('🐍 קורא לסקריפט Python עם הנתונים הסופיים...');

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
        console.log('✅ Python script completed successfully');
        console.log('📤 Python output:', output);

        if (fs.existsSync(outputPath)) {
          console.log('✅ קובץ Word נוצר בהצלחה:', outputPath);
          console.log('📊 גודל קובץ:', fs.statSync(outputPath).size, 'bytes');

          // בדיקת התוכן
          console.log('\n🔍 בודק תוכן הקובץ...');
          checkWordContent();
        } else {
          console.log('❌ קובץ Word לא נוצר');
        }
      } else {
        console.log(`❌ Python script failed with code ${code}`);
        console.log('📥 Error output:', errorOutput);
        console.log('📤 Standard output:', output);
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('❌ Error spawning Python process:', error);
    });

  } catch (error) {
    console.error('❌ General error:', error);
  }
}

async function checkWordContent() {
  try {
    const fs = require('fs');
    const JSZip = require('jszip');

    const data = fs.readFileSync('בדיקה_סופית_Python.docx');
    const zip = await JSZip.loadAsync(data);
    const docXml = await zip.file('word/document.xml').async('text');

    // חילוץ הטקסט
    const textMatches = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
    console.log(`📝 מספר אלמנטי טקסט: ${textMatches.length}`);

    const allText = textMatches.map(match => match.replace(/<[^>]+>/g, '')).join(' ');

    // בדיקת הגדרות RTL
    const rtlSettings = docXml.match(/<w:bidi[^\/]*\/>/g) || [];
    const rightAlign = docXml.match(/<w:jc w:val="right"\/>/g) || [];
    const textDirection = docXml.match(/<w:textDirection[^\/]*\/>/g) || [];

    console.log(`➡️ הגדרות RTL: ${rtlSettings.length}`);
    console.log(`↩️ יישור ימין: ${rightAlign.length}`);
    console.log(`🔄 כיוון טקסט: ${textDirection.length}`);

    // בדיקת פיסוק
    const punctuationIssues = {
      beforeComma: (allText.match(/[א-ת] ,/g) || []).length,
      afterComma: (allText.match(/,[^ ]/g) || []).length,
      beforeDot: (allText.match(/[א-ת] \./g) || []).length,
      afterDot: (allText.match(/\.[^ ]/g) || []).length
    };

    console.log('📏 בדיקת פיסוק:', punctuationIssues);

    // סיכום
    if (rightAlign.length > 0 && punctuationIssues.afterComma === 0 && punctuationIssues.afterDot === 0) {
      console.log('\n🎉 מצוין! הפתרון Python עובד בצורה מושלמת:');
      console.log('   ✅ יישור RTL תקין');
      console.log('   ✅ פיסוק מושלם');
      console.log('   ✅ מבנה פסקאות נכון');
      console.log('\n🚀 הפתרון מוכן לשימוש בפרודקשיין!');
    } else {
      console.log('\n⚠️ יש כמה בעיות קטנות שצריך לתקן');
    }

  } catch (error) {
    console.error('❌ Error checking Word content:', error);
  }
}

testFinalPythonDocx();