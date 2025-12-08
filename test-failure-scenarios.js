// בדיקת תרחישי כשל בתמלול - לא צריך להיות חיוב!

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing failure scenarios - NO BILLING should occur');

// 1. צור קובץ אודיו מקולקל/לא תקין
function createInvalidAudioFile() {
  const invalidAudioPath = path.join(__dirname, 'test_invalid_audio.mp3');

  // צור קובץ עם נתונים לא תקינים
  const invalidData = 'This is not audio data, just text pretending to be MP3!';
  fs.writeFileSync(invalidAudioPath, invalidData);

  console.log(`✅ Created invalid audio file: ${invalidAudioPath}`);
  return invalidAudioPath;
}

// 2. צור קובץ אודיו ריק
function createEmptyAudioFile() {
  const emptyAudioPath = path.join(__dirname, 'test_empty_audio.wav');

  // צור קובץ ריק
  fs.writeFileSync(emptyAudioPath, '');

  console.log(`✅ Created empty audio file: ${emptyAudioPath}`);
  return emptyAudioPath;
}

// 3. צור קובץ עם סיומת אודיו אבל תוכן טקסט
function createFakeAudioFile() {
  const fakeAudioPath = path.join(__dirname, 'test_fake_audio.mp3');

  // צור קובץ טקסט עם סיומת אודיו
  const fakeData = `
אני קובץ טקסט שמתחזה לקובץ אודיו!
זה אמור לגרום לכשל בתמלול.
המערכת לא צריכה לחייב על זה!
  `.trim();

  fs.writeFileSync(fakeAudioPath, fakeData);

  console.log(`✅ Created fake audio file: ${fakeAudioPath}`);
  return fakeAudioPath;
}

// 4. צור קובץ גדול מדי (אם יש הגבלת גודל)
function createOversizedFile() {
  const oversizedPath = path.join(__dirname, 'test_oversized.mp3');

  // צור קובץ של 100MB (גדול מדי)
  const largeData = Buffer.alloc(100 * 1024 * 1024, 0); // 100MB של zeros
  fs.writeFileSync(oversizedPath, largeData);

  console.log(`✅ Created oversized file (100MB): ${oversizedPath}`);
  return oversizedPath;
}

// פונקציה לניקוי קבצי בדיקה
function cleanupTestFiles(filePaths) {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up: ${filePath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not delete: ${filePath}`, error.message);
    }
  });
}

// הפעלת הבדיקות
function runFailureTests() {
  console.log('\n🚀 Creating test files for failure scenarios...\n');

  const testFiles = [
    createInvalidAudioFile(),
    createEmptyAudioFile(),
    createFakeAudioFile(),
    // createOversizedFile() // הערה: זה יוצר קובץ גדול - הסר הערה בזהירות
  ];

  console.log('\n📋 Test files created:');
  testFiles.forEach((file, index) => {
    const stats = fs.statSync(file);
    console.log(`${index + 1}. ${path.basename(file)} (${stats.size} bytes)`);
  });

  console.log('\n🧪 HOW TO TEST:');
  console.log('1. העלה את הקבצים האלה דרך הממשק');
  console.log('2. בדוק שהתמלול נכשל');
  console.log('3. בדוק שלא היה חיוב (balance לא השתנה)');
  console.log('4. בדוק שיש הודעת שגיאה מתאימה');

  console.log('\n📊 Expected behavior:');
  console.log('✅ Error message: "התמלול נכשל - לא בוצע חיוב"');
  console.log('✅ Balance unchanged');
  console.log('✅ Progress shows 100% with error message');

  // ניקוי אוטומטי אחרי 5 דקות
  setTimeout(() => {
    console.log('\n🧹 Auto-cleanup after 5 minutes...');
    cleanupTestFiles(testFiles);
  }, 5 * 60 * 1000);

  return testFiles;
}

// הפעל את הבדיקות
if (require.main === module) {
  runFailureTests();
}

module.exports = {
  runFailureTests,
  createInvalidAudioFile,
  createEmptyAudioFile,
  createFakeAudioFile,
  cleanupTestFiles
};