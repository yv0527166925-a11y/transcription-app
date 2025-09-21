// בדיקת התיקונים החדשים ביותר
const { spawn } = require('child_process');

const problematicText = `שליט \"א, רש \"י בקידושין בדף ל \"ט "עמוד ב'. "יחיינו "מיומיים". אומר "לו, "דבר "שני. אתה "רוצה "לעשות משהו טוב. "את "צריכה את זה?`;

console.log('🧪 Testing latest Word formatting fixes');
console.log('Input with issues:', problematicText);

const pythonData = JSON.stringify({
    transcription: problematicText,
    title: 'בדיקת תיקונים אחרונים',
    output_path: 'test-latest-fixes.docx'
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
            console.log('1. שליט \"א → שליט"א');
            console.log('2. רש \"י → רש"י');
            console.log('3. ל \"ט → ל"ט');
            console.log('4. "עמוד ב\' → עמוד ב\'');
            console.log('5. "יחיינו "מיומיים" → "יחיינו מיומיים"');
            console.log('6. אומר "לו, "דבר "שני → אומר לו, דבר שני');
            console.log('7. הסרת גרשיים מיותרים ממילים קצרות');
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});