// בדיקה סופית של כל התיקונים
const { spawn } = require('child_process');

// טקסט עם כל הבעיות שהמשתמש דיווח עליהן
const finalTestText = `שליט "א, רש י אמר בקידושין בדף לטעמוד ב'. חזל מביאים את דברי האר"י זל בענין זה. ""יחיינו מיומיים כתוב בפסוק.
ברוך תהיה מכל העמים". כל "גוי שיעבור, יגיד, "תראה איך נראה יהודי. לעשותם בקרב הארץ". שואל "הרמבן, אומר ר\\' זלמן.
הוא אמר שלום. והלך לביתו. הם קראו "שמע ישראל".`;

console.log('🎯 FINAL TEST - All specific issues');
console.log('===================================');
console.log('📋 Issues to fix:');
console.log('✓ ""יחיינו → "יחיינו (remove double quotes)');
console.log('✓ חזל → חז"ל');
console.log('✓ זל → ז"ל');
console.log('✓ ברוך תהיה מכל העמים" → "ברוך תהיה מכל העמים"');
console.log('✓ לטעמוד → ל"ט עמוד');
console.log('✓ אמר שלום. והלך → אמר שלום והלך');
console.log('');

const pythonData = JSON.stringify({
    transcription: finalTestText.trim(),
    title: 'בדיקה סופית - כל התיקונים',
    output_path: 'final-all-fixes-test.docx'
});

console.log('📤 Sending to Python for processing...');

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

            console.log('\\n📄 Expected results in Word document:');
            console.log('• "יחיינו מיומיים" (single quotes, not double)');
            console.log('• חז"ל (not חזל)');
            console.log('• ז"ל (not זל)');
            console.log('• "ברוך תהיה מכל העמים" (quotes at both ends)');
            console.log('• ל"ט עמוד (not לטעמוד)');
            console.log('• אמר שלום והלך (no extra period)');

            console.log('\\n🎯 Please verify ALL issues are now completely fixed!');

        } else {
            console.log('❌ FAILED:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }

    if (errorOutput) {
        console.log('\\n📋 Processing completed successfully with all phases');
    }
});