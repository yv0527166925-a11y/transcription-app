#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def create_hebrew_word_document(transcription, title, output_path):
    """
    יוצר מסמך Word בשיטה של החלפת תבנית עובדת
    """
    try:
        import os
        import shutil
        from zipfile import ZipFile

        # בדיקה אם קיימת תבנית עובדת
        template_path = 'חזר מהשרת תקין 2.docx'
        if not os.path.exists(template_path):
            print(f"Template not found: {template_path}")
            # נסה תבנית אחרת
            template_path = 'template.docx'
            if not os.path.exists(template_path):
                print("No working template found, falling back to basic creation")
                return create_basic_hebrew_document(transcription, title, output_path)

        # העתקת התבנית
        shutil.copy2(template_path, output_path)

        # ניקוי והכנת הטקסט
        clean_text = transcription.replace('\r\n', '\n').replace('\n\n\n', '\n\n').strip()
        sections = [section.strip() for section in clean_text.split('\n\n') if section.strip()]

        # פתיחת הקובץ כ-ZIP ועדכון התוכן
        with ZipFile(output_path, 'r') as zip_ref:
            # קריאת document.xml הקיים
            with zip_ref.open('word/document.xml') as doc_file:
                doc_content = doc_file.read().decode('utf-8')

        # יצירת תוכן חדש במבנה הקיים
        new_paragraphs = []

        # כותרת
        title_paragraph = f'''
<w:p w14:paraId="6A1F55DC" w14:textId="77777777">
  <w:pPr>
    <w:jc w:val="right"/>
    <w:spacing w:after="400"/>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
      <w:sz w:val="32"/>
      <w:b/>
    </w:rPr>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
      <w:sz w:val="32"/>
      <w:b/>
    </w:rPr>
    <w:t>{escape_xml(title)}</w:t>
  </w:r>
</w:p>'''
        new_paragraphs.append(title_paragraph)

        # שורה ריקה
        new_paragraphs.append('<w:p></w:p>')

        # פסקאות תוכן
        for section in sections:
            lines = [line.strip() for line in section.split('\n') if line.strip()]
            combined_text = ' '.join(lines).strip()

            if combined_text and not combined_text[-1] in '.!?:':
                combined_text += '.'

            content_paragraph = f'''
<w:p w14:paraId="13B47B51" w14:textId="77777777">
  <w:pPr>
    <w:jc w:val="right"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
    </w:rPr>
    <w:t>{escape_xml(combined_text)}</w:t>
  </w:r>
</w:p>'''
            new_paragraphs.append(content_paragraph)

        # החלפת התוכן
        import re
        # מוצא את ה-body ומחליף את התוכן
        body_content = ''.join(new_paragraphs)
        new_doc_content = re.sub(
            r'<w:body[^>]*>.*?</w:body>',
            f'<w:body>{body_content}</w:body>',
            doc_content,
            flags=re.DOTALL
        )

        # שמירת הקובץ המעודכן
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_file:
            temp_path = temp_file.name

        # עדכון הקובץ
        with ZipFile(template_path, 'r') as original_zip:
            with ZipFile(temp_path, 'w') as new_zip:
                for item in original_zip.infolist():
                    if item.filename == 'word/document.xml':
                        new_zip.writestr(item, new_doc_content.encode('utf-8'))
                    else:
                        data = original_zip.read(item.filename)
                        new_zip.writestr(item, data)

        # החלפת הקובץ הסופי
        shutil.move(temp_path, output_path)

        print(f"Word document created successfully: {output_path}")
        return True

    except Exception as e:
        print(f"Error creating Word document: {str(e)}")
        return False

def create_basic_hebrew_document(transcription, title, output_path):
    """
    יצירת מסמך בסיסי אם אין תבנית
    """
    doc = Document()

    # כותרת פשוטה
    title_paragraph = doc.add_paragraph()
    title_run = title_paragraph.add_run(title)
    title_run.font.name = 'David'
    title_run.font.size = Pt(16)
    title_run.bold = True
    title_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

    # שורה ריקה
    doc.add_paragraph()

    # תוכן
    clean_text = transcription.replace('\r\n', '\n').replace('\n\n\n', '\n\n').strip()
    sections = [section.strip() for section in clean_text.split('\n\n') if section.strip()]

    for section in sections:
        lines = [line.strip() for line in section.split('\n') if line.strip()]
        combined_text = ' '.join(lines).strip()

        if combined_text and not combined_text[-1] in '.!?:':
            combined_text += '.'

        paragraph = doc.add_paragraph()
        run = paragraph.add_run(combined_text)
        run.font.name = 'David'
        run.font.size = Pt(12)
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

    doc.save(output_path)
    return True

def escape_xml(text):
    """
    מחליף תווים מיוחדים ב-XML
    """
    return (text.replace('&', '&amp;')
               .replace('<', '&lt;')
               .replace('>', '&gt;')
               .replace('"', '&quot;')
               .replace("'", '&#39;'))

def fix_hebrew_punctuation(text):
    """
    מתקן רווחים סביב סימני פיסוק בעברית
    """
    import re

    # הוספת רווח אחרי סימני פיסוק אם אין
    text = re.sub(r'([.!?:;,])([א-ת])', r'\1 \2', text)

    # הוספת רווח אחרי גרשיים אם אין
    text = re.sub(r'(")([א-ת])', r'\1 \2', text)

    # ניקוי רווחים כפולים
    text = re.sub(r'\s{2,}', ' ', text)

    # ניקוי רווחים בתחילת ובסוף
    text = text.strip()

    return text

def set_rtl_paragraph(paragraph):
    """
    מגדיר פסקה כ-RTL (ימין לשמאל)
    """
    try:
        # הוספת הגדרת RTL ל-XML של הפסקה
        p = paragraph._element
        pPr = p.get_or_add_pPr()

        # הוספת bidi element
        bidi = OxmlElement('w:bidi')
        bidi.set(qn('w:val'), '1')
        pPr.append(bidi)

        # הוספת textDirection element
        textDirection = OxmlElement('w:textDirection')
        textDirection.set(qn('w:val'), 'rl')
        pPr.append(textDirection)

    except Exception as e:
        print(f"Warning: Cannot set RTL: {str(e)}")

def main():
    """
    פונקציה ראשית המקבלת פרמטרים מ-Node.js
    """
    try:
        if len(sys.argv) != 2:
            print("Usage: python generate_word_doc.py '<json_data>'")
            sys.exit(1)

        # קבלת הנתונים מ-Node.js
        json_data = sys.argv[1]
        data = json.loads(json_data)

        transcription = data.get('transcription', '')
        title = data.get('title', 'תמלול')
        output_path = data.get('output_path', 'output.docx')

        # יצירת המסמך
        success = create_hebrew_word_document(transcription, title, output_path)

        if success:
            print(json.dumps({"success": True, "file_path": output_path}))
        else:
            print(json.dumps({"success": False, "error": "Failed to create document"}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()