// בדיקת תיקון קווים נטויים
const { spawn } = require('child_process');

const textWithBackslashes = `הוא אמר\\שלום לכולם. זה\\דבר חשוב\\מאוד. רש\\\"י כותב\\בפירושו. חז\\\"ל אומרים\\כך.`;

console.log('🧪 Testing backslash removal');
console.log('Input with backslashes:', textWithBackslashes);

const pythonData = JSON.stringify({
    transcription: textWithBackslashes,
    title: 'בדיקת קווים נטויים',
    output_path: 'test-backslash-fix.docx'
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
            console.log('1. הוא אמר\\שלום → הוא אמר שלום');
            console.log('2. זה\\דבר חשוב\\מאוד → זה דבר חשוב מאוד');
            console.log('3. רש\\\"י → רש"י');
            console.log('4. חז\\\"ל → חז"ל');
            console.log('5. כותב\\בפירושו → כותב בפירושו');
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});