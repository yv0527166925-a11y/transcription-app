// בדיקה של קווים נטויים
const { spawn } = require('child_process');

// טקסט עם קווים נטויים
const backslashText = `שליט "א, רש י אמר בקידושין. הוא אמר\\שלום לכולם. זה\\דבר חשוב\\מאוד בחיים. אמר ר\\' זלמן. בקרב הארץ\\".`;

console.log('🔧 Testing backslash removal');
console.log('============================');
console.log('Input text with backslashes:');
console.log(backslashText);
console.log('');
console.log('Expected: All backslashes (\\\\) should be removed');
console.log('');

const pythonData = JSON.stringify({
    transcription: backslashText,
    title: 'בדיקת קווים נטויים',
    output_path: 'backslash-test-' + Date.now() + '.docx'
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
            console.log('\\n📋 Check in document:');
            console.log('• אמר שלום לכולם (no backslash)');
            console.log('• זה דבר חשוב מאוד (no backslashes)');
            console.log('• אמר ר\' זלמן (should keep ר\' as is)');
            console.log('• בקרב הארץ" (no backslash before quote)');
            console.log('\\n🎯 Verify NO unwanted backslashes remain!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});