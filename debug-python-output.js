// Debug של Python output
const { spawn } = require('child_process');

const testText = 'נמאס.מאיפה באה הבעיה. ההצלחה.דוד מלך ישראל.';

const pythonData = JSON.stringify({
    transcription: testText,
    title: 'debug',
    output_path: 'debug.docx'
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
    console.log('=== STDOUT ===');
    console.log(output);
    console.log('\n=== STDERR ===');
    console.log(errorOutput);
    console.log('\n=== EXIT CODE ===');
    console.log(code);
});