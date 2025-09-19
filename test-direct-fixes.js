// בדיקה עם תיקונים ישירים
const { spawn } = require('child_process');

// בדיקה פשוטה של הבעיות הספציפיות
const testText = `""יחיינו מיומיים כתוב בפסוק. חזל מביאים את דברי האר"י זל בענין זה.`;

console.log('🔧 Direct fix test for specific issues');
console.log('====================================');
console.log('Input text:', testText);
console.log('');
console.log('Expected fixes:');
console.log('• ""יחיינו → "יחיינו');
console.log('• חזל → חז"ל');
console.log('• זל → ז"ל');
console.log('');

const pythonData = JSON.stringify({
    transcription: testText,
    title: 'בדיקת תיקונים ישירים',
    output_path: 'direct-fix-' + Date.now() + '.docx'
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
    console.log('Processing completed with exit code:', code);

    try {
        const result = JSON.parse(output);
        if (result.success) {
            console.log(`\\n✅ Word document created: ${result.file_path}`);
            console.log('\\n🎯 Please check the document for the fixes!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});