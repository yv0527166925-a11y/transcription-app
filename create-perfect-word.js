const fs = require('fs');
const path = require('path');

// פונקציה ליצירת קובץ Word מושלם עם פיסוק צמוד
async function createPerfectWordDocument() {
  try {
    console.log('📄 Creating perfect Word document with proper punctuation spacing...');

    // יצירת סקריפט Python מתוקן
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
        title_run = title_paragraph.add_run('דוגמה לטקסט עברי עם פיסוק מושלם')
        title_run.font.name = 'David'
        title_run.font.size = Pt(18)
        title_run.bold = True
        title_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # Sample text paragraphs - WITHOUT "פסקה X:" prefix
        paragraphs_text = [
            'שלום וברכה! היום אני רוצה לדבר על נושא חשוב מאוד שמעסיק אותי כבר זמן רב. אני חושב שזה משהו שכולנו צריכים לחשוב עליו ולהתייחס אליו ברצינות. זה לא משהו שאפשר פשוט להתעלם ממנו או לדחות לזמן אחר. האם אנחנו באמת מוכנים להתמודד עם זה? אני מאמין שכן, אבל זה דורש מאמץ רב.',
            'בעצם, כשאני מסתכל על המצב הנוכחי, אני רואה שיש כאן הזדמנות אמיתית לעשות שינוי משמעותי. "זו הזדמנות זהב", כפי שאמר חברי אתמול. לא מדובר בדבר קטן או שולי, אלא באמת במשהו שיכול להשפיע על כולנו בטווח הארוך. יש כאן פוטנציאל עצום לעשות דברים שונים, לחשוב מחוץ לקופסה, ולמצוא פתרונות יצירתיים לבעיות שנראות בלתי פתירות.',
            'אני זוכר שפעם, לפני כמה שנים, היתה לי חוויה מאוד מעניינת שמלמדת בדיוק על הנושא הזה. הייתי במקום מסוים, פגשתי אנשים מסוימים, ופתאום הבנתי משהו שלא הבנתי קודם. זה היה כמו הארה! רגע של בהירות מוחלטת שבו הכל הסתדר במקום. "עכשיו אני מבין", אמרתי לעצמי באותו רגע מכונן.',
            'השאלה החשובה היא: מה אנחנו עושים עם ההבנה הזו? איך אנחנו מתרגמים את זה לפעולה קונקרטית? כי בסוף, הרעיונות הכי יפים לא שווים כלום אם אנחנו לא מביאים אותם לביצוע. צריך להיות תוכנית, צריך להיות מסגרת, וצריך להיות מישהו שאחראי על ההוצאה לפועל. בלי זה, הכל נשאר ברמה התיאורטית, ובסוף לא קורה כלום!'
        ]

        # Add paragraphs - clean text without "פסקה X:" prefix
        for para_text in paragraphs_text:
            paragraph = doc.add_paragraph()
            run = paragraph.add_run(para_text)
            run.font.name = 'David'
            run.font.size = Pt(12)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # Save document
        doc.save('perfect-word-output.docx')
        print('SUCCESS: Perfect Word document created')
        return True

    except Exception as e:
        print(f'ERROR: {str(e)}')
        return False

if __name__ == '__main__':
    create_word_doc()
`;

    // כתיבת הסקריפט לקובץ
    const pythonFile = path.join(__dirname, 'create_perfect_word.py');
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
          console.log('✅ Perfect Word document created successfully!');
          console.log('📁 File: perfect-word-output.docx');
          console.log('🔍 This document should show:');
          console.log('   ✅ 4 paragraphs as AI created them (NO "פסקה X:" prefix)');
          console.log('   ✅ Right-to-left alignment');
          console.log('   ✅ Proper Hebrew font (David)');
          console.log('   ✅ Punctuation marks properly attached to words');
          console.log('   ✅ Quotes: "זו הזדמנות זהב" and "עכשיו אני מבין"');
          console.log('   ✅ Question marks: האם אנחנו באמת מוכנים? and מה אנחנו עושים?');
          console.log('   ✅ Exclamation marks: שלום וברכה! and זה היה כמו הארה!');
          console.log('   ✅ Colons: השאלה החשובה היא:');
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
    console.error('❌ Error creating perfect Word document:', error);
    return false;
  }
}

if (require.main === module) {
  createPerfectWordDocument();
}

module.exports = { createPerfectWordDocument };