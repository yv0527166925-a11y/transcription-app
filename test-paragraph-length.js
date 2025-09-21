// בדיקת אורך פסקאות
const { spawn } = require('child_process');

const longText = `אם תעשה את המצוות, גם אם אתה לא מרוצה, אבל תשמח, עשיתי מצווה, התרוממתי. על השמחה, על והיה, אתה מקבל שכר בעולם הזה. אפילו ששכר מצווה בהאי עלמא ליכא. את השכר על המצווה, על השמחה של המצווה מקבל בעולם הזה. ידוע שכתוב בספרי חסידות, שכשאדם יש הרבה אנשים. אתה שואל אותו מה? אין לו מצב רוח. מישהו פעם חשב, בדורות הקודמים היה להם בקושי פרנסה. לא הייתה מכונת כביסה בבית, לא היה מיקרוגל לחמם אוכל מהיר, לא היה אוכל מוכן.`;

console.log('🧪 Testing paragraph length with 20-word limit');
console.log(`Input length: ${longText.split(' ').length} words`);

const pythonData = JSON.stringify({
    transcription: longText,
    title: 'בדיקת אורך פסקאות',
    output_path: 'test-paragraph-length.docx'
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
            console.log('📄 Paragraph breaking should create shorter paragraphs (≤20 words each)');
        } else {
            console.log('❌ Failed:', result.error);
        }
    } catch (e) {
        console.log('❌ Parse error:', e.message);
    }
});