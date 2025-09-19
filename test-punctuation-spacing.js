// בדיקה של בעיות פיסוק ורווחים
const { spawn } = require('child_process');

// הטקסט הבעייתי שהמשתמש דיווח עליו
const problematicText = `גן עדן".מה יושר".והיה אמרתי לו את זה.`;

console.log('🔧 Testing punctuation and spacing issues');
console.log('==========================================');
console.log('Input text with issues:');
console.log(problematicText);
console.log('');
console.log('Expected fixes:');
console.log('• גן עדן".מה → גן עדן". מה (add space after period)');
console.log('• יושר".והיה → יושר". והיה (add space after period)');
console.log('');

const pythonData = JSON.stringify({
    transcription: problematicText,
    title: 'בדיקת פיסוק ורווחים',
    output_path: 'punctuation-spacing-' + Date.now() + '.docx'
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
            console.log('• גן עדן". מה (proper spacing)');
            console.log('• יושר". והיה (proper spacing)');
            console.log('\\n🎯 Check if punctuation spacing is fixed!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});