// בדיקה שPython עושה את כל העבודה
const { spawn } = require('child_process');

const testText = 'אמר"שלום."והלך. הם קראו"שמע ישראל".היום. רש "י אומר. חז "לים.';

console.log('🧪 Testing Python-only processing');
console.log('Input:', testText);

const pythonData = JSON.stringify({
  transcription: testText,
  title: 'בדיקה',
  output_path: 'test-python-only.docx'
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
  console.log('\n=== PYTHON OUTPUT ===');
  console.log(output);
  console.log('\n=== PYTHON ERRORS ===');
  console.log(errorOutput);
  console.log(`\n=== Exit code: ${code} ===`);
});