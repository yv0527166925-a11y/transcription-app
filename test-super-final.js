// בדיקה סופית עם שם קובץ חדש
const { spawn } = require('child_process');

// טקסט עם כל הבעיות שהמשתמש דיווח עליהן
const finalTestText = `שליט "א, רש י אמר בקידושין בדף לטעמוד ב'. חזל מביאים את דברי האר"י זל בענין זה. ""יחיינו מיומיים כתוב בפסוק.
ברוך תהיה מכל העמים". כל "גוי שיעבור, יגיד, "תראה איך נראה יהודי. לעשותם בקרב הארץ". שואל "הרמבן, אומר ר\\' זלמן.
הוא אמר שלום. והלך לביתו. הם קראו "שמע ישראל".`;

console.log('🎯 SUPER FINAL TEST - All issues fixed');
console.log('=====================================');

const pythonData = JSON.stringify({
    transcription: finalTestText.trim(),
    title: 'בדיקה סופית מושלמת',
    output_path: 'super-final-test-' + Date.now() + '.docx'  // שם ייחודי
});

console.log('📤 Creating Word document with unique name...');

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
    console.log('\\n📥 Processing completed');
    console.log('Exit code:', code);

    try {
        const result = JSON.parse(output);
        if (result.success) {
            console.log(`\\n✅ SUCCESS! Word document created: ${result.file_path}`);

            console.log('\\n📄 Check in Word document for:');
            console.log('• "יחיינו מיומיים" (single quotes only)');
            console.log('• חז"ל (fixed from חזל)');
            console.log('• ז"ל (fixed from זל)');
            console.log('• "ברוך תהיה מכל העמים" (quotes at both ends)');
            console.log('• ל"ט עמוד (fixed from לטעמוד)');

        } else {
            console.log('❌ FAILED:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }

    if (errorOutput.includes('ULTIMATE Hebrew processing completed')) {
        console.log('\\n✅ Hebrew processing completed successfully');
    }
});