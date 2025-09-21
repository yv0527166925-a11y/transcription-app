// בדיקה של הסרת גרשיים מיותרים
const { spawn } = require('child_process');

// טקסט עם הרבה גרשיים מיותרים
const quotesText = `שליט "א, רש י אמר בקידושין. את "צריכה "את זה? אתה "רוצה "לעשות "משהו טוב. כל "גוי שיעבור, יגיד, "תראה "איך נראה יהודי. אומר "לו, "דבר "שני. הם קראו "שמע "ישראל". היום "בבוקר.`;

console.log('🔧 Testing unwanted quotes removal');
console.log('==================================');
console.log('Input text with many unwanted quotes:');
console.log(quotesText);
console.log('');
console.log('Expected: Remove quotes from single words that are NOT real quotes');
console.log('');

const pythonData = JSON.stringify({
    transcription: quotesText,
    title: 'בדיקת גרשיים מיותרים',
    output_path: 'quotes-cleanup-' + Date.now() + '.docx'
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
            console.log('\\n📋 Should be cleaned in document:');
            console.log('• שליט"א (fixed abbreviation)');
            console.log('• את צריכה את זה (no quotes around single words)');
            console.log('• אתה רוצה לעשות משהו (no quotes around single words)');
            console.log('• כל גוי שיעבור (no quotes around גוי)');
            console.log('• תראה איך נראה (no quotes around single words)');
            console.log('• אומר לו, דבר שני (no quotes around single words)');
            console.log('• "שמע ישראל" (keep real verse quotes)');
            console.log('• היום בבוקר (no quotes around בבוקר)');
            console.log('\\n🎯 Verify all unwanted quotes are removed!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});