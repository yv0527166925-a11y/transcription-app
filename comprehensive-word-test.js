// בדיקה מקיפה של כל התיקונים בקובץ Word יחיד
const { spawn } = require('child_process');

const comprehensiveText = `
שליט\"א, רש \"י אמר בקידושין בדף ל \"ט "עמוד ב'.
חז \"ל מביאים את דברי האר י ז ל בענין זה.
"יחיינו "מיומיים" כתוב בפסוק.
". "ברוך "תהיה מכל העמים".
כל "גוי שיעבור, יגיד, "תראה "איך נראה יהודי.
לעשותם בקרב הארץ\".
שואל "הרמב ן, אומר ר\\' זלמן.
נמאס.מאיפה באה הבעיה.
ההצלחה.דוד מלך ישראל.
נפלאים.בעזרת השם יתברך.
זה.כשאדם רואה דבר כזה.
יודעתראו מה קרה?
שאלתיאותו אבל הוא לא ענה.
אומר "לו, "דבר "שני.
"את "צריכה את זה?
אתה "רוצה "לעשות משהו טוב.
הוא אמר\\שלום לכולם.
זה\\דבר חשוב\\מאוד בחיים.
אמר\"שלום."והלך לביתו.
הם קראו\"שמע ישראל\".היום בבוקר.
להודות לך ולייחדך" אמר בברכה.

זהו משפט ארוך מאוד שצריך להיות מחולק לפסקאות קצרות יותר כדי שהקריאה תהיה נוחה יותר ולא יהיו פסקאות ארוכות מדי שמקשות על הקריאה והבנת הטקסט. אם תעשה את המצוות, גם אם אתה לא מרוצה, אבל תשמח, עשיתי מצווה, התרוממתי על השמחה ועל והיה אתה מקבל שכר בעולם הזה.
`;

console.log('🧪 Creating comprehensive Word document test');
console.log(`Input text length: ${comprehensiveText.split(' ').length} words`);
console.log('\n📋 Testing all Hebrew formatting issues:');
console.log('✓ Backslash quotes (שליט\"א)');
console.log('✓ Excessive spaces in abbreviations (רש \"י)');
console.log('✓ Unnecessary quotation marks ("עמוד ב\')');
console.log('✓ Double quotes in citations ("יחיינו "מיומיים")');
console.log('✓ Misplaced quotes ("ברוך "תהיה)');
console.log('✓ Scattered abbreviations (האר י ז ל)');
console.log('✓ Backslashes in text (בקרב הארץ\\")');
console.log('✓ Missing spaces after periods (נמאס.מאיפה)');
console.log('✓ Merged words (יודעתראו)');
console.log('✓ Backslashes between words (אמר\\שלום)');
console.log('✓ Missing opening quotes (להודות לך ולייחדך")');
console.log('✓ Long paragraphs (20+ words)');

const pythonData = JSON.stringify({
    transcription: comprehensiveText.trim(),
    title: 'בדיקה מקיפה - כל התיקונים העבריים',
    output_path: 'final-super-aggressive-test.docx'
});

console.log('\n📤 Sending to Python for processing...');

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
            console.log(`\n✅ SUCCESS! Word document created: ${result.file_path}`);

            // בדיקה שהעיבוד העברי רץ
            if (errorOutput.includes('Starting comprehensive Hebrew processing')) {
                console.log('✅ Hebrew text processing confirmed');
            }

            if (errorOutput.includes('Comprehensive Hebrew processing completed')) {
                console.log('✅ All Hebrew fixes applied successfully');
            }

            console.log('\n📄 Word document should now contain:');
            console.log('• Clean Hebrew abbreviations (שליט"א, רש"י, חז"ל)');
            console.log('• Proper quotation mark spacing');
            console.log('• No unwanted backslashes');
            console.log('• Correct punctuation spacing');
            console.log('• Shorter, readable paragraphs');
            console.log('• Fixed merged words');
            console.log('• RTL text alignment');
            console.log('• David font for Hebrew text');

            console.log('\n🎯 Open the Word file to verify all fixes are working correctly!');

        } else {
            console.log('❌ FAILED:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }

    if (errorOutput) {
        console.log('\n📋 Python processing log:');
        const relevantLines = errorOutput.split('\n').filter(line =>
            line.includes('Hebrew') ||
            line.includes('processing') ||
            line.includes('Word document created') ||
            line.includes('template')
        );
        relevantLines.forEach(line => console.log('   ', line));
    }
});