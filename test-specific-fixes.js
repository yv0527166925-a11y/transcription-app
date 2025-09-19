// בדיקה ספציפית לבעיות שהמשתמש דיווח עליהן
const { spawn } = require('child_process');

// הטקסט הספציפי עם הבעיות
const specificText = `"ראה לימדתי אתכם חוקים ומשפטים צדיקים לעשותם ""בקרב הארץ". שאינו עומד בדיבורו".`;

console.log('🎯 Testing SPECIFIC reported issues');
console.log('===================================');
console.log('Input text:');
console.log(specificText);
console.log('');
console.log('Issues to fix:');
console.log('• ""בקרב → "בקרב (remove double quotes)');
console.log('• שאינו עומד בדיבורו" → "שאינו עומד בדיבורו" (add opening quote)');
console.log('');

const pythonData = JSON.stringify({
    transcription: specificText,
    title: 'בדיקת תיקונים ספציפיים',
    output_path: 'specific-quote-fix-' + Date.now() + '.docx'
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
    console.log('Processing completed');

    try {
        const result = JSON.parse(output);
        if (result.success) {
            console.log(`\\n✅ Word document created: ${result.file_path}`);
            console.log('\\n📋 Expected in document:');
            console.log('• "ראה לימדתי אתכם חוקים ומשפטים צדיקים לעשותם בקרב הארץ"');
            console.log('• "שאינו עומד בדיבורו".');
            console.log('\\n🎯 Check if both quote issues are fixed!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});