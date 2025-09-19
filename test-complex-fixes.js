// בדיקת התיקונים המתקדמים
const { spawn } = require('child_process');

const complexText = `האר י ז ל אמר. ". "ברוך "תהיה מכל העמים". כל "גוי שיעבור, יגיד, "תראה "איך נראה יהודי. לעשותם בקרב הארץ\\". שואל "הרמב ן, אומר ר\\' זלמן.`;

console.log('🧪 Testing complex Hebrew formatting fixes');
console.log('Input with issues:', complexText);

const pythonData = JSON.stringify({
    transcription: complexText,
    title: 'בדיקת תיקונים מתקדמים',
    output_path: 'test-complex-fixes.docx'
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
            console.log('1. האר י ז ל → האר"י ז"ל');
            console.log('2. "ברוך "תהיה → "ברוך תהיה');
            console.log('3. "תראה "איך → "תראה איך');
            console.log('4. בקרב הארץ\\" → בקרב הארץ');
            console.log('5. הרמב ן → הרמב"ן');
            console.log('6. ר\\\' → ר\'');
            console.log('7. הסרת גרשיים מיותרים ממילים בודדות');
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});