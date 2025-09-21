// בדיקה עם הטקסט המדויק שהמשתמש דיווח עליו
const { spawn } = require('child_process');

// הטקסט המדויק שהמשתמש קיבל בקובץ הוורד
const exactText = `""יחיינו מיומיים" כתוב בפסוק. חזל מביאים את דברי האר"י זל בענין זה.`;

console.log('🎯 Testing EXACT text from user report');
console.log('=====================================');
console.log('Input (what user reported):');
console.log(exactText);
console.log('');
console.log('Expected output:');
console.log('"יחיינו מיומיים" כתוב בפסוק. חז"ל מביאים את דברי האר"י ז"ל בענין זה.');
console.log('');

const pythonData = JSON.stringify({
    transcription: exactText,
    title: 'בדיקת טקסט מדויק',
    output_path: 'exact-fix-' + Date.now() + '.docx'
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
            console.log('\\n📋 MUST be fixed in document:');
            console.log('• ""יחיינו → "יחיינו (remove extra quote)');
            console.log('• חזל → חז"ל (add quotes to abbreviation)');
            console.log('• זל → ז"ל (add quotes to abbreviation)');
            console.log('\\n🎯 Check if ALL THREE issues are now fixed!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }

    if (errorOutput.includes('ULTIMATE Hebrew processing completed')) {
        console.log('\\n✅ Processing completed - check document now!');
    }
});