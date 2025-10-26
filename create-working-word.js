const fs = require('fs');
const path = require('path');

// פונקציה ליצירת קובץ Word תקין באמצעות הספרייה python-docx
async function createWorkingWordDocument() {
  try {
    console.log('📄 Creating working Word document with proper RTL and punctuation...');

    // טקסט הדוגמה עם סימני פיסוק
    const sampleText = `שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. האם אנחנו באמת מוכנים להתמודד עם זה? אני מאמין שכן, אבל זה דורש מאמץ רב.

בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. "זו הזדמנות זהב", כפי שאמר חברי אתמול. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.

אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה! רגע של בהירות מוחלטת שבו הכל הסתדר במקום. "עכשיו אני מבין", אמרתי לעצמי באותו רגע מכונן.

השאלה החשובה היא: מה אנחנו עושים עם ההבנה הזו? איך אנחנו מתרגמים את זה לפעולה קונקרטית? כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום!`;

    // יצירת סקריפט Python פשוט ללא בעיות קידוד
    const pythonScript = `# -*- coding: utf-8 -*-
import sys
import os
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

def create_word_doc():
    try:
        # Create new document
        doc = Document()

        # Add title
        title_paragraph = doc.add_paragraph()
        title_run = title_paragraph.add_run('דוגמה לטקסט עברי עם פיסוק נכון')
        title_run.font.name = 'David'
        title_run.font.size = Pt(18)
        title_run.bold = True
        title_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # Sample text paragraphs
        paragraphs_text = [
            'שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. האם אנחנו באמת מוכנים להתמודד עם זה? אני מאמין שכן, אבל זה דורש מאמץ רב.',
            'בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. "זו הזדמנות זהב", כפי שאמר חברי אתמול. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.',
            'אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה! רגע של בהירות מוחלטת שבו הכל הסתדר במקום. "עכשיו אני מבין", אמרתי לעצמי באותו רגע מכונן.',
            'השאלה החשובה היא: מה אנחנו עושים עם ההבנה הזו? איך אנחנו מתרגמים את זה לפעולה קונקרטית? כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום!'
        ]

        # Add paragraphs
        for i, para_text in enumerate(paragraphs_text, 1):
            paragraph = doc.add_paragraph()
            run = paragraph.add_run(f'פסקה {i}: {para_text}')
            run.font.name = 'David'
            run.font.size = Pt(12)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # Save document
        doc.save('working-word-output.docx')
        print('SUCCESS: Word document created')
        return True

    except Exception as e:
        print(f'ERROR: {str(e)}')
        return False

if __name__ == '__main__':
    create_word_doc()
`;

    // כתיבת הסקריפט לקובץ
    const pythonFile = path.join(__dirname, 'create_working_word.py');
    fs.writeFileSync(pythonFile, pythonScript, 'utf8');

    // הרצת הסקריפט
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const python = spawn('python', [pythonFile], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        // ניקוי קובץ זמני
        if (fs.existsSync(pythonFile)) {
          fs.unlinkSync(pythonFile);
        }

        if (code === 0 && output.includes('SUCCESS')) {
          console.log('✅ Word document created successfully!');
          console.log('📁 File: working-word-output.docx');
          console.log('🔍 This document should open properly and show:');
          console.log('   - 4 paragraphs preserved as AI created them');
          console.log('   - Right-to-left alignment');
          console.log('   - Proper Hebrew font (David)');
          console.log('   - Punctuation marks: ! ? " :');
          resolve(true);
        } else {
          console.log('❌ Python script failed');
          console.log('Output:', output);
          console.log('Error:', error);
          resolve(false);
        }
      });

      python.on('error', (err) => {
        console.log('❌ Python execution failed:', err.message);
        resolve(false);
      });
    });

  } catch (error) {
    console.error('❌ Error creating working Word document:', error);
    return false;
  }
}

if (require.main === module) {
  createWorkingWordDocument();
}

module.exports = { createWorkingWordDocument };