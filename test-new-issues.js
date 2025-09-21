// בדיקה של הבעיות החדשות שהמשתמש דיווח עליהן
const { spawn } = require('child_process');

// טקסט עם כל הבעיות החדשות
const newIssuesText = `ה"אוהב ישראל מאפטא. כל גוי שיעבור, יגיד, תראה איך נראה יהודי, תראה איך את הדברים האלה". "ראה לימדתי אתכם חוקים ומשפטים צדיקים "לעשותם "בקרב הארץ". מה הגמרא אומרת במסכת עבודה? "יש לי מצווה קלה, אני אנסה בה את אומות העולם לעתיד לבוא.
וסוכה שמה." שאינו עומד בדיבורו." מזלטוב לכם! למען תחיון", אומר למען תחיון".`;

console.log('🔧 Testing NEW Hebrew text issues');
console.log('=================================');
console.log('Input with new issues:');
console.log(newIssuesText);
console.log('');
console.log('Expected fixes:');
console.log('✓ ה"אוהב ישראל" (add closing quote)');
console.log('✓ "תראה איך נראה יהודי..." (add opening quote)');
console.log('✓ "לעשותם בקרב הארץ" (remove extra quotes)');
console.log('✓ שאינו עומד בדיבורו". (period after quote)');
console.log('✓ מזל טוב (separate merged words)');
console.log('✓ "למען תחיון" (add opening quotes)');
console.log('✓ Fix broken paragraphs');
console.log('');

const pythonData = JSON.stringify({
    transcription: newIssuesText,
    title: 'בדיקת בעיות חדשות',
    output_path: 'new-issues-fix-' + Date.now() + '.docx'
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
            console.log('\\n📋 Verify in document:');
            console.log('• ה"אוהב ישראל" (with closing quote)');
            console.log('• "תראה איך נראה יהודי, תראה איך את הדברים האלה"');
            console.log('• "לעשותם בקרב הארץ" (clean quotes)');
            console.log('• שאינו עומד בדיבורו". (period after quote)');
            console.log('• מזל טוב (separated words)');
            console.log('• "למען תחיון", אומר "למען תחיון"');
            console.log('• Continuous paragraphs (no mid-sentence breaks)');
            console.log('\\n🎯 Check if ALL new issues are fixed!');
        } else {
            console.log('❌ Error:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw output:', output);
    }
});