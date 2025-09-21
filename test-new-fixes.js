// בדיקת התיקונים החדשים
const { spawn } = require('child_process');

const problematicText = `להודות לך ולייחדך" אמר הרב.
נמאס.מאיפה באה הבעיה הזאת.
ההצלחה.דוד מלך ישראל חי וקיים.
זה משפט ארוך מאוד שצריך להיות מחולק לפסקאות קצרות יותר כדי שהקריאה תהיה נוחה יותר ולא יהיו פסקאות ארוכות מדי שמקשות על הקריאה והבנת הטקסט.`;

console.log('🧪 Testing new fixes for Word issues');
console.log('Input with issues:', problematicText);

const pythonData = JSON.stringify({
    transcription: problematicText,
    title: 'בדיקת תיקונים חדשים',
    output_path: 'test-new-fixes.docx'
});

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
    console.log('\n📥 Processing completed');
    console.log('Exit code:', code);

    try {
        const result = JSON.parse(output);
        if (result.success) {
            console.log('✅ Word file created:', result.file_path);
            console.log('\n🔍 Expected fixes:');
            console.log('1. להודות לך ולייחדך" → "להודות לך ולייחדך"');
            console.log('2. נמאס.מאיפה → נמאס. מאיפה');
            console.log('3. ההצלחה.דוד → ההצלחה. דוד');
            console.log('4. פסקאות קצרות יותר (25 מילים במקום 40)');
            console.log('5. ירידות שורה באמצע משפט תוקנו');
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
    }
});