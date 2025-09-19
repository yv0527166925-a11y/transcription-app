// בדיקת התיקונים החדשים
const { spawn } = require('child_process');

const problematicText = `ר' ברוך רוזנבלום שליט\"א, לבוא לדבר. נפלאים.בעזרת השם. אומרים חז\"ל, מה זה. מביא רש\"י: "אלו המצוות". זה.כשאדם דש, מה זה מלאכת דש.`;

console.log('🧪 Testing Word document issue fixes');
console.log('Input with issues:', problematicText);

const pythonData = JSON.stringify({
    transcription: problematicText,
    title: 'בדיקת תיקונים',
    output_path: 'test-word-fixes.docx'
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
            console.log('1. שליט\"א → שליט"א');
            console.log('2. נפלאים.בעזרת → נפלאים. בעזרת');
            console.log('3. חז\"ל → חז"ל');
            console.log('4. רש\"י → רש"י');
            console.log('5. זה.כשאדם → זה. כשאדם');
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
    }
});