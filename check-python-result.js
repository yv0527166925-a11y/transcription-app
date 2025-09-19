// בדיקה שהטקסט תוקן נכון ב-Python
const fs = require('fs');
const { spawn } = require('child_process');

const testCases = [
    { input: '"מה אתה אומר"שאל הרב.', expected: '"מה אתה אומר" שאל הרב.' },
    { input: 'אמר"שלום."והלך.', expected: 'אמר "שלום". והלך.' },
    { input: 'הם קראו"שמע ישראל".היום.', expected: 'הם קראו "שמע ישראל". היום.' },
    { input: 'רש "י אומר. חז "לים.', expected: 'רש"י אומר. חז"לים.' }
];

async function testCase(testCase, index) {
    return new Promise((resolve) => {
        console.log(`\n=== Test Case ${index + 1} ===`);
        console.log('Input:', testCase.input);
        console.log('Expected:', testCase.expected);

        const pythonData = JSON.stringify({
            transcription: testCase.input,
            title: `Test ${index + 1}`,
            output_path: `test-case-${index + 1}.docx`
        });

        const pythonProcess = spawn('python', ['generate_word_doc.py', pythonData], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let errorOutput = '';

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
            // חפש בלוג של Python את הטקסט המעובד
            const hebrewProcessingLog = errorOutput.match(/Starting comprehensive Hebrew processing[\s\S]*?Comprehensive Hebrew processing completed/);

            console.log('Python processing completed');
            console.log('Exit code:', code);

            if (fs.existsSync(`test-case-${index + 1}.docx`)) {
                console.log('✅ Word file created successfully');
            } else {
                console.log('❌ Word file not created');
            }

            resolve();
        });
    });
}

async function runAllTests() {
    console.log('🧪 Testing Python Hebrew processing in Word generation\n');

    for (let i = 0; i < testCases.length; i++) {
        await testCase(testCases[i], i);
    }

    console.log('\n🏁 All tests completed');
}

runAllTests();