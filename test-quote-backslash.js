// בדיקה ספציפית של \"שמע ישראל\"
const { spawn } = require('child_process');

const testText = 'הם קראו\"שמע ישראל\".היום בבוקר.';

console.log('🧪 Testing backslash quotes fix');
console.log('Input:', testText);

const pythonData = JSON.stringify({
    transcription: testText,
    title: 'בדיקת גרש לוכסן',
    output_path: 'test-backslash-quotes.docx'
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
    console.log('\nResult:', code === 0 ? '✅ Success' : '❌ Failed');

    if (code === 0) {
        try {
            const result = JSON.parse(output);
            if (result.success) {
                console.log('Word file created:', result.file_path);
                console.log('\nExpected transformation:');
                console.log('קראו\"שמע ישראל\".היום → קראו "שמע ישראל". היום');
            }
        } catch (e) {
            console.log('Parse error:', e.message);
        }
    }
});