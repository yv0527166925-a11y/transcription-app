// בדיקה פשוטה של הטקסט שדיווחת עליו
const { spawn } = require('child_process');

const problemText = `שליט "א, רש י אמר. "עמוד ב'. "יחיינו "מיומיים "כתוב. אמרשלום. זהדבר חשובמאוד.`;

console.log('🧪 Simple test of current Hebrew processing');
console.log('Input:', problemText);

const pythonData = JSON.stringify({
    transcription: problemText,
    title: 'בדיקה פשוטה',
    output_path: 'simple-test-current.docx'
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
    console.log('\n📥 Result:', code === 0 ? '✅ Success' : '❌ Failed');

    if (code === 0) {
        try {
            const result = JSON.parse(output);
            if (result.success) {
                console.log('Word file created:', result.file_path);
                console.log('\nExpected fixes:');
                console.log('• שליט "א → שליט"א');
                console.log('• רש י → רש"י');
                console.log('• Remove quotes from "עמוד"');
                console.log('• Remove quotes from "יחיינו" "מיומיים" "כתוב"');
                console.log('• Fix merged words: אמרשלום → אמר שלום');
                console.log('• Fix merged words: זהדבר חשובמאוד → זה דבר חשוב מאוד');
            }
        } catch (e) {
            console.log('Parse error:', e.message);
        }
    } else {
        console.log('Failed with exit code:', code);
    }

    console.log('\n📋 Processing log:');
    const relevantLines = errorOutput.split('\n').filter(line =>
        line.includes('Hebrew') || line.includes('processing') || line.includes('Phase')
    );
    relevantLines.forEach(line => console.log('  ', line));
});