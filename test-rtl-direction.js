// בדיקה שכיוון RTL עובד נכון עם Python
const { spawn } = require('child_process');

const hebrewText = 'זהו טקסט עברי שצריך להיות מיושר ימינה. הוא כולל כמה משפטים כדי לבדוק שהכיוון נכון.';

console.log('🧪 Testing RTL direction with Python processing');

const pythonData = JSON.stringify({
    transcription: hebrewText,
    title: 'בדיקת כיוון RTL',
    output_path: 'rtl-direction-test.docx'
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
    console.log('Exit code:', code);

    try {
        const result = JSON.parse(output);
        if (result.success) {
            console.log('✅ RTL Word file created:', result.file_path);

            // בדיקה שהפונקציות RTL רצו
            if (errorOutput.includes('RTL settings applied')) {
                console.log('✅ RTL settings confirmed in logs');
            } else {
                console.log('⚠️ RTL settings not explicitly confirmed');
            }
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
    }

    console.log('\n📋 Relevant Python logs:');
    const rtlLines = errorOutput.split('\n').filter(line =>
        line.includes('RTL') || line.includes('bidi') || line.includes('right')
    );
    if (rtlLines.length > 0) {
        rtlLines.forEach(line => console.log('   ', line));
    } else {
        console.log('   No RTL-specific logs found');
    }
});