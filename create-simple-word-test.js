const fs = require('fs');
const path = require('path');

// פונקציה פשוטה ליצירת Word באמצעות Python (השיטה שעובדת)
async function createSimpleWordTest() {
  try {
    console.log('🧪 Creating simple Word document using Python method...');

    // טקסט דוגמה עם סימני פיסוק
    const sampleText = `שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד.

האם זה באמת כל כך חשוב? כן, אני חושב שזה "קריטי" לעתידנו.

אני זוכר שפעם אמר לי מישהו: "תמיד תזכור את הלקח הזה!"

השאלה היא מה אנחנו עושים עם זה עכשיו?`;

    // כתיבת הטקסט לקובץ זמני
    const tempTextFile = path.join(__dirname, 'temp_text.txt');
    fs.writeFileSync(tempTextFile, sampleText, 'utf8');

    // יצירת קובץ Python זמני
    const pythonScript = `
import sys
import os
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

def create_word_doc():
    try:
        # קריאת הטקסט
        with open('temp_text.txt', 'r', encoding='utf-8') as f:
            text = f.read()

        # יצירת מסמך חדש
        doc = Document()

        # הגדרת כיוון RTL למסמך
        sections = doc.sections
        for section in sections:
            section.page_width = Inches(8.5)
            section.page_height = Inches(11)
            section.left_margin = Inches(1)
            section.right_margin = Inches(1)

        # הוספת כותרת
        title_paragraph = doc.add_paragraph()
        title_run = title_paragraph.add_run('דוגמה לטקסט עברי עם פיסוק')
        title_run.font.name = 'David'
        title_run.font.size = Pt(16)
        title_run.bold = True
        title_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # פיצול לפסקאות
        paragraphs = text.split('\\n\\n')

        for para_text in paragraphs:
            if para_text.strip():
                paragraph = doc.add_paragraph()
                run = paragraph.add_run(para_text.strip())
                run.font.name = 'David'
                run.font.size = Pt(12)
                paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

                # הגדרת RTL
                paragraph._element.get_or_add_pPr().append(
                    paragraph._element._new_bidi()
                )

        # שמירת המסמך
        doc.save('simple-test-output.docx')
        print('✅ Python Word document created successfully!')
        return True

    except Exception as e:
        print(f'❌ Error: {e}')
        return False

if __name__ == '__main__':
    create_word_doc()
`;

    const pythonFile = path.join(__dirname, 'temp_word_creator.py');
    fs.writeFileSync(pythonFile, pythonScript, 'utf8');

    // הרצת הסקריפט
    const { spawn } = require('child_process');
    const python = spawn('python', [pythonFile], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    python.on('close', (code) => {
      // ניקוי קבצים זמניים
      if (fs.existsSync(tempTextFile)) fs.unlinkSync(tempTextFile);
      if (fs.existsSync(pythonFile)) fs.unlinkSync(pythonFile);

      if (code === 0) {
        console.log('📁 Simple Word document created: simple-test-output.docx');
        console.log('🔍 This document should be easier to open and view');
        console.log('📝 It contains 4 paragraphs with Hebrew text, punctuation, and RTL alignment');
      } else {
        console.log('❌ Python script failed');
      }
    });

  } catch (error) {
    console.error('❌ Error creating simple Word test:', error);
  }
}

// בדיקה אם Python זמין
function checkPython() {
  const { spawn } = require('child_process');
  const python = spawn('python', ['--version']);

  python.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Python is available, creating test document...');
      createSimpleWordTest();
    } else {
      console.log('❌ Python not available, cannot create test document');
      console.log('💡 Try opening the existing files:');
      console.log('   - current-method-output.docx');
      console.log('   - FIXED-method-output.docx');
    }
  });

  python.on('error', () => {
    console.log('❌ Python not found, cannot create test document');
    console.log('💡 Try opening the existing files:');
    console.log('   - current-method-output.docx');
    console.log('   - FIXED-method-output.docx');
  });
}

if (require.main === module) {
  checkPython();
}

module.exports = { createSimpleWordTest };