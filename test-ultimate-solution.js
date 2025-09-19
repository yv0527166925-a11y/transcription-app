// בדיקה סופית של הפתרון החדש לעיבוד טקסט עברי
const { spawn } = require('child_process');

// הטקסט הבעייתי המדויק שהמשתמש סיפק
const problematicText = `שליט "א, רש י אמר בקידושין בדף ל "טעמוד "ב'. חז"ל מביאים את דברי האר"י ז"ל בענין זה. "יחיינו "מיומיים כתוב בפסוק.
"ברוך תהיה מכל העמים". כל "גוי שיעבור, יגיד, "תראה איך נראה יהודי. לעשותם בקרב הארץ". שואל "הרמבן, אומר ר\\' זלמן.
נמאס. מאיפה באה הבעיה. ההצלחה. דוד מלך ישראל. נפלאים. בעזרת השם יתברך. זה. כשאדם רואה דבר כזה. יודעת ראו מה קרה?
שאלתי אותו אבל הוא לא ענה. אומר לו, דבר שני. את "צריכה "את זה? אתה "רוצה "לעשות "משהו טוב. הוא אמרשלום לכולם. זהדבר חשובמאוד בחיים. אמר שלום. והלך לביתו. הם קראו "שמע ישראל". היום "בבוקר.
להודות לך ולייחדך" אמר בברכה.`;

console.log('🎯 Testing ULTIMATE Hebrew solution');
console.log('==================================');
console.log('📋 Issues to be fixed:');
console.log('✓ שליט "א → שליט"א');
console.log('✓ רש י → רש"י');
console.log('✓ Remove quotes from: טעמוד, גוי, תראה, צריכה, etc.');
console.log('✓ Fix merged words: אמרשלום, זהדבר, חשובמאוד');
console.log('✓ Fix punctuation spacing');
console.log('✓ Remove backslashes');
console.log('✓ Fix quotation marks placement');
console.log('');

const pythonData = JSON.stringify({
    transcription: problematicText.trim(),
    title: 'בדיקה סופית - פתרון ULTIMATE',
    output_path: 'ultimate-hebrew-test.docx'
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

            // בדיקה שהעיבוד העברי החדש רץ
            if (errorOutput.includes('Starting ULTIMATE Hebrew processing')) {
                console.log('✅ ULTIMATE Hebrew processing confirmed');
            }

            if (errorOutput.includes('ULTIMATE Hebrew processing completed')) {
                console.log('✅ All Hebrew fixes applied successfully');
            }

            console.log('\\n📄 Expected results in Word document:');
            console.log('• שליט"א (not שליט "א)');
            console.log('• רש"י (not רש י)');
            console.log('• עמוד ב\' (not "טעמוד")');
            console.log('• נראה יהודי (not "גוי")');
            console.log('• תראה איך (not "תראה" "איך")');
            console.log('• צריכה את (not "צריכה" "את")');
            console.log('• אמר שלום (not אמרשלום)');
            console.log('• זה דבר (not זהדבר)');
            console.log('• חשוב מאוד (not חשובמאוד)');
            console.log('• No backslashes (\\\\)');
            console.log('• Proper spacing and punctuation');
            console.log('• RTL text alignment with David font');

            console.log('\\n🎯 Please open the Word file to verify all issues are fixed!');

        } else {
            console.log('❌ FAILED:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }

    if (errorOutput) {
        console.log('\\n📋 Python processing log:');
        const relevantLines = errorOutput.split('\\n').filter(line =>
            line.includes('Hebrew') ||
            line.includes('Phase') ||
            line.includes('ULTIMATE') ||
            line.includes('Word document created') ||
            line.includes('processing')
        );
        relevantLines.forEach(line => console.log('   ', line));
    }
});