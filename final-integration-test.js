// בדיקה סופית של כל המערכת Node.js + Python
const express = require('express');
const path = require('path');
const fs = require('fs');

// מחקה את התהליך של יצירת קובץ Word דרך האפליקציה
function testWordGeneration() {
    console.log('🧪 Final integration test: Node.js → Python → Word');

    // טקסט בעייתי שהיה בעבר
    const problematicText = `
    אמר"שלום."והלך לביתו.
    הם קראו"שמע ישראל".היום בבוקר.
    רש "י מביא את דברי חז "ל על הפסוק הזה.
    ה"אוהב ישראל" כתב בספרו.
    יודעתראו מה קרה? שאלתיאותו אבל הוא לא ענה.
    `.trim();

    console.log('Input text length:', problematicText.length);
    console.log('Sample:', problematicText.substring(0, 100) + '...');

    // מדמה את הקריאה מ-server.js
    const { spawn } = require('child_process');

    const pythonData = JSON.stringify({
        transcription: problematicText,
        title: 'בדיקה סופית - מערכת משולבת',
        output_path: 'final-integration-test.docx'
    });

    console.log('\n📤 Sending to Python...');

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
        console.log('\n📥 Python response received');
        console.log('Exit code:', code);

        try {
            const result = JSON.parse(output);
            console.log('Success:', result.success);

            if (result.success) {
                console.log('✅ Word file created:', result.file_path);

                // בדיקה שהקובץ קיים
                if (fs.existsSync(result.file_path)) {
                    const stats = fs.statSync(result.file_path);
                    console.log(`📄 File size: ${stats.size} bytes`);
                    console.log(`📅 Created: ${stats.birthtime}`);

                    // בדיקה אם Python עיבד את הטקסט
                    if (errorOutput.includes('Starting comprehensive Hebrew processing')) {
                        console.log('✅ Hebrew text processing confirmed');
                    } else {
                        console.log('⚠️ Hebrew processing not detected in logs');
                    }

                    console.log('\n🎉 Integration test PASSED!');
                    console.log('Node.js → Python → Word pipeline working correctly');

                } else {
                    console.log('❌ File was not created');
                }
            } else {
                console.log('❌ Python reported failure:', result.error);
            }
        } catch (e) {
            console.log('❌ Could not parse Python output:', e.message);
            console.log('Raw output:', output);
        }

        if (errorOutput) {
            console.log('\n📋 Python processing details:');
            // הצג רק את חלקי העיבוד העבריים
            const hebrewLines = errorOutput.split('\n').filter(line =>
                line.includes('Hebrew') || line.includes('comprehensive') || line.includes('processing')
            );
            hebrewLines.forEach(line => console.log('   ', line));
        }
    });
}

testWordGeneration();