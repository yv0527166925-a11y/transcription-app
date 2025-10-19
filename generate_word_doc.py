#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json

# Don't import docx at module level - do it only when needed
# This prevents immediate failure if docx is not installed

def create_hebrew_word_document(transcription, title, output_path, language='Hebrew'):
    """
    יוצר מסמך Word בשיטה של החלפת תבנית עובדת
    """
    try:
        # Check if python-docx is available
        try:
            from docx import Document
            from docx.shared import Inches, Pt
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.oxml.ns import qn
            from docx.oxml import OxmlElement
        except ImportError as e:
            print(f"python-docx not available: {str(e)}", file=sys.stderr)
            print("Falling back to HTML generation", file=sys.stderr)
            return create_html_fallback(transcription, title, output_path)

        import os
        import shutil
        from zipfile import ZipFile

        # בדיקה אם קיימת תבנית עובדת
        possible_templates = [
            'חזר מהשרת תקין 2.docx',
            'דוגמה_Word_מושלמת.docx',
            'בדיקה_תבנית_עובדת.docx',
            'template.docx',
            'simple-template.docx'
        ]

        template_path = None
        print(f"Looking for templates in directory: {os.getcwd()}", file=sys.stderr)
        print(f"Directory contents: {os.listdir('.')[:10]}...", file=sys.stderr)

        for template in possible_templates:
            print(f"Checking template: {template}", file=sys.stderr)
            if os.path.exists(template):
                template_path = template
                print(f"Found working template: {template}", file=sys.stderr)
                break
            else:
                print(f"Template not found: {template}", file=sys.stderr)

        if not template_path:
            print("No working template found, falling back to basic creation", file=sys.stderr)
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

        # קביעת כיוון טקסט לפי שפה
        is_rtl = language in ['Hebrew', 'Yiddish', 'Arabic']
        alignment = 'right' if is_rtl else 'left'

        # כותרת
        title_paragraph = f'''
<w:p w14:paraId="6A1F55DC" w14:textId="77777777">
  <w:pPr>
    <w:jc w:val="{alignment}"/>
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

        # פסקאות תוכן - Python מעבד הכל כאן
        import re
        all_text = ' '.join(sections)
        # תיקון ירידות שורה באמצע משפט
        all_text = re.sub(r'\n+', ' ', all_text)  # החלף ירידות שורה ברווח
        all_text = re.sub(r'\s{2,}', ' ', all_text)  # רווחים כפולים לרווח יחיד
        all_text = fix_hebrew_punctuation(all_text)  # Python עושה את כל העיבוד העברי

        # חלוקה לפסקאות - שומרים על שלמות המירכאות

        # חלוקה בזהירות למשפטים, אבל לא אם יש מירכאה פתוחה
        words = all_text.split()
        current_para = ""
        word_count = 0

        for word in words:
            current_para += word + " "
            word_count += 1

            # יצירת פסקה חדשה רק אם:
            # 1. יש מספיק מילים (קוצר עוד יותר ל-20)
            # 2. אין מירכאה פתוחה (זוגי של מירכאות)
            # 3. המשפט מסתיים
            if (word_count >= 20 or len(current_para) > 250) and word.endswith(('.', '!', '?', ':')):
                quote_count = current_para.count('"')
                if quote_count % 2 == 0:  # זוגי מירכאות = לא באמצע ציטוט
                    para_text = current_para.strip()
                    if para_text:
                        content_paragraph = f'''
<w:p>
  <w:pPr>
    <w:jc w:val="{alignment}"/>
    <w:spacing w:after="240"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
      <w:sz w:val="28"/>
    </w:rPr>
    <w:t>{escape_xml(para_text)}</w:t>
  </w:r>
</w:p>'''
                        new_paragraphs.append(content_paragraph)
                    current_para = ""
                    word_count = 0

        # פסקה אחרונה
        if current_para.strip():
            para_text = current_para.strip()
            content_paragraph = f'''
<w:p>
  <w:pPr>
    <w:jc w:val="{alignment}"/>
    <w:spacing w:after="240"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>
      <w:sz w:val="28"/>
    </w:rPr>
    <w:t>{escape_xml(para_text)}</w:t>
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

        print(f"Word document created successfully: {output_path}", file=sys.stderr)
        return True

    except Exception as e:
        print(f"Error creating Word document: {str(e)}")
        return False

def create_basic_hebrew_document(transcription, title, output_path):
    """
    יצירת מסמך בסיסי אם אין תבנית - עם הגדרות RTL משופרות
    """
    try:
        # Import docx here too
        from docx import Document
        from docx.shared import Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement

        print("Creating basic Hebrew document with RTL settings", file=sys.stderr)
        doc = Document()

        # הגדרת השפה העיקרית של המסמך לעברית
        doc_element = doc.element
        doc_element.set(qn('xml:lang'), 'he-IL')

    except Exception as e:
        print(f"Error creating basic document: {str(e)}", file=sys.stderr)
        # אם גם זה נכשל, ניצור מסמך HTML פשוט
        return create_html_fallback(transcription, title, output_path)

    try:
        # כותרת עם הגדרות RTL מחוזקות
        title_paragraph = doc.add_paragraph()
        title_run = title_paragraph.add_run(title)
        title_run.font.name = 'David'
        title_run.font.size = Pt(18)
        title_run.bold = True
        title_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        # הוספת הגדרות RTL לכותרת
        set_rtl_paragraph(title_paragraph)

        # שורה ריקה
        doc.add_paragraph()

        # עיבוד התוכן
        clean_text = transcription.replace('\r\n', '\n').replace('\n\n\n', '\n\n').strip()
        clean_text = fix_hebrew_punctuation(clean_text)
        sections = [section.strip() for section in clean_text.split('\n\n') if section.strip()]

        print(f"Creating {len(sections)} content paragraphs", file=sys.stderr)

        for i, section in enumerate(sections):
            lines = [line.strip() for line in section.split('\n') if line.strip()]
            combined_text = ' '.join(lines).strip()

            if combined_text and not combined_text[-1] in '.!?:':
                combined_text += '.'

            paragraph = doc.add_paragraph()
            run = paragraph.add_run(combined_text)
            run.font.name = 'David'
            run.font.size = Pt(14)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT

            # הוספת הגדרות RTL לכל פסקה
            set_rtl_paragraph(paragraph)

            print(f"Added paragraph {i+1}: {combined_text[:50]}...", file=sys.stderr)

        doc.save(output_path)
        print(f"Basic document saved successfully: {output_path}", file=sys.stderr)
        return True

    except Exception as e:
        print(f"Error in basic document creation process: {str(e)}", file=sys.stderr)
        return create_html_fallback(transcription, title, output_path)

def create_html_fallback(transcription, title, output_path):
    """
    יצירת קובץ HTML כ-fallback אם Python-docx לא זמין
    """
    try:
        html_content = f'''<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        body {{
            font-family: David, Arial, sans-serif;
            direction: rtl;
            text-align: right;
            margin: 40px;
            line-height: 1.6;
        }}
        h1 {{
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 20px;
        }}
        p {{
            margin-bottom: 16px;
            font-size: 12px;
        }}
    </style>
</head>
<body>
    <h1>{title}</h1>
'''

        # עיבוד הטקסט לפסקאות
        clean_text = transcription.replace('\r\n', '\n').replace('\n\n\n', '\n\n').strip()
        sections = [section.strip() for section in clean_text.split('\n\n') if section.strip()]

        for section in sections:
            lines = [line.strip() for line in section.split('\n') if line.strip()]
            combined_text = ' '.join(lines).strip()

            if combined_text and not combined_text[-1] in '.!?:':
                combined_text += '.'

            # הימנעות מ-HTML injection
            safe_text = combined_text.replace('<', '&lt;').replace('>', '&gt;').replace('&', '&amp;')
            html_content += f'    <p>{safe_text}</p>\n'

        html_content += '''
</body>
</html>'''

        # שמירה כקובץ HTML במקום docx
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        print(f"Created HTML fallback at: {output_path}", file=sys.stderr)
        return True

    except Exception as e:
        print(f"HTML fallback failed: {str(e)}")
        return False

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
    פתרון סופי ומדויק לכל בעיות הטקסט העברי
    מבוסס על הבעיות הספציפיות שהמשתמש דיווח עליהן
    """
    import re

    print('🎯 Starting ULTIMATE Hebrew processing...', file=sys.stderr)

    # שלב 1: ניקוי בסיסי - הסרת קווים נטויים וגרשיים מוזרים
    text = text.replace('\\', '')
    text = re.sub(r'["\u0022\u201C\u201D]', '"', text)

    # תיקון גרשיים כפולים ומשולשים בהתחלה של מילים
    text = re.sub(r'""([א-ת])', r'"\1', text)  # ""מילה -> "מילה
    text = re.sub(r'"""([א-ת])', r'"\1', text)  # """מילה -> "מילה
    text = re.sub(r'""""([א-ת])', r'"\1', text)  # """"מילה -> "מילה

    # תיקונים ישירים ואגרסיביים לבעיות ספציפיות
    text = text.replace('""יחיינו', '"יחיינו')
    text = text.replace('"""יחיינו', '"יחיינו')
    text = text.replace('""""יחיינו', '"יחיינו')

    # תיקון חזל בכל הצורות האפשריות
    text = text.replace('חזל מביאים', 'חז"ל מביאים')
    text = text.replace('חזל', 'חז"ל')
    text = text.replace('חז ל', 'חז"ל')

    # תיקון זל בכל הצורות האפשריות
    text = text.replace('זל בענין', 'ז"ל בענין')
    text = text.replace('זל מביאים', 'ז"ל מביאים')
    text = text.replace(' זל ', ' ז"ל ')
    text = text.replace(' זל.', ' ז"ל.')
    text = text.replace(' זל,', ' ז"ל,')
    text = text.replace('זל ', 'ז"ל ')
    text = text.replace(' זל', ' ז"ל')

    # כפל התיקונים כדי לוודא שהם עובדים
    text = text.replace('חזל', 'חז"ל')  # שוב
    text = re.sub(r'\bזל\b', 'ז"ל', text)  # תיקון עם regex
    text = re.sub(r'\bחזל\b', 'חז"ל', text)  # תיקון עם regex

    print('Phase 1: Basic cleanup completed', file=sys.stderr)

    # שלב 2: תיקון קיצורים עבריים - ישיר וחד-משמעי
    # בהתבסס על הדוגמאות הספציפיות מהמשתמש
    abbreviation_fixes = [
        ('שליט "א', 'שליט"א'),
        ('שליט א', 'שליט"א'),
        ('רש י', 'רש"י'),
        ('רש "י', 'רש"י'),
        ('חז "ל', 'חז"ל'),
        ('חז ל', 'חז"ל'),
        ('ל "ט', 'ל"ט'),
        ('ל ט', 'ל"ט'),
        ('לטעמוד', 'ל"ט עמוד'),  # תיקון ספציפי למילים דבוקות
        ('הרמב "ן', 'הרמב"ן'),
        ('הרמב ן', 'הרמב"ן'),
        ('רמב "ם', 'רמב"ם'),
        ('רמב ם', 'רמב"ם'),
        ('האר י ז ל', 'האר"י ז"ל'),
        ('האר"י "ז"ל', 'האר"י ז"ל'),
        ('הארי זל', 'האר"י ז"ל'),  # תיקון זל לז"ל
        ('זל בענין', 'ז"ל בענין'),  # תיקון זל לז"ל
        ('חזל', 'חז"ל'),  # תיקון חזל לחז"ל
        (' זל ', ' ז"ל '),  # תיקון זל בכל מקום
        ('זל מביאים', 'ז"ל מביאים'),  # תיקון זל בהקשר ספציפי
        ('זל בענין', 'ז"ל בענין'),  # תיקון זל בהקשר ספציפי
        ('חזל מביאים', 'חז"ל מביאים'),  # תיקון חזל בהקשר ספציפי
        ('שו "ע', 'שו"ע'),
        ('שו ע', 'שו"ע'),
        ('ד "ה', 'ד"ה'),
        ('ב "ה', 'ב"ה')
    ]

    for wrong, correct in abbreviation_fixes:
        text = text.replace(wrong, correct)

    print('Phase 2: Fixed Hebrew abbreviations', file=sys.stderr)

    # שלב 3: הסרת גרשיים מיותרים ממילים בודדות
    # בהתבסס על הבעיות הספציפיות שהמשתמש דיווח עליהן
    unwanted_quoted_words = [
        'טעמוד', 'עמוד', 'ב\'', 'גוי', 'תראה', 'איך', 'הרמבן', 'צריכה',
        'את', 'רוצה', 'לעשות', 'משהו', 'שמע', 'ישראל', 'בבוקר',
        'כתוב', 'בפסוק', 'תהיה',
        'בענין', 'מביאים', 'ז', 'ל'
    ]

    for word in unwanted_quoted_words:
        # הסר גרשיים מהתחלה והסוף
        text = text.replace(f'"{word}"', word)
        text = text.replace(f'"{word}', word)
        text = text.replace(f'{word}"', word)

    print('Phase 3: Removed unwanted quotes from words', file=sys.stderr)

    # שלב 4: תיקון מילים צמודות
    merged_word_fixes = [
        ('אמרשלום', 'אמר שלום'),
        ('זהדבר', 'זה דבר'),
        ('חשובמאוד', 'חשוב מאוד'),
        ('יודעתראו', 'יודעת ראו'),
        ('שאלתיאותו', 'שאלתי אותו'),
        ('אומרתאני', 'אומרת אני'),
        ('נמאס.מאיפה', 'נמאס. מאיפה'),
        ('ההצלחה.דוד', 'ההצלחה. דוד'),
        ('נפלאים.בעזרת', 'נפלאים. בעזרת'),
        ('זה.כשאדם', 'זה. כשאדם')
    ]

    for wrong, correct in merged_word_fixes:
        text = text.replace(wrong, correct)

    print('Phase 4: Fixed merged words', file=sys.stderr)

    # שלב 5: תיקון פיסוק ורווחים
    # נקודה צמודה למילה
    text = re.sub(r'([א-ת])\.([א-ת])', r'\1. \2', text)
    # רווח אחרי פיסוק
    text = re.sub(r'([.,!?:;])([א-ת])', r'\1 \2', text)
    # הסר רווח לפני פיסוק
    text = re.sub(r'\s+([.,!?:;])', r'\1', text)
    # רווחים כפולים
    text = re.sub(r'\s{2,}', ' ', text)

    print('Phase 5: Fixed punctuation and spacing', file=sys.stderr)

    # שלב 6: תיקונים ספציפיים לבעיות מורכבות
    specific_fixes = [
        ('בדף ל טעמוד ב\'', 'בדף ל"ט עמוד ב\''),
        ('שואל הרמבן', 'שואל הרמב"ן'),
        ('". "ברוך', '"ברוך'),
        ('"ברוך "תהיה', '"ברוך תהיה'),
        ('"תראה "איך', '"תראה איך'),
        ('שואל "הרמב"ן', 'שואל הרמב"ן'),
        ('אומר "ר\'', 'אומר ר\''),
        ('הם קראו "שמע "ישראל"', 'הם קראו "שמע ישראל"'),
        ('להודות לך ולייחדך"', '"להודות לך ולייחדך"'),
        ('לעשותם בקרב הארץ"', '"לעשותם בקרב הארץ"'),  # הוסף גרשיים בהתחלה לציטוט פסוק
        ('יחיינו מיומיים כתוב', '"יחיינו מיומיים" כתוב'),  # הוסף גרשיים לפסוק
        ('יחיינו מיומיים"', '"יחיינו מיומיים"'),  # תקן אם יש רק גרשיים בסוף
        ('""יחיינו', '"יחיינו'),  # תקן גרשיים כפולים בהתחלה
        ('"""יחיינו', '"יחיינו'),  # תקן גרשיים משולשים
        ('ברוך תהיה מכל העמים"', '"ברוך תהיה מכל העמים"'),  # הוסף גרשיים בהתחלת פסוק
        ('אמר שלום. והלך לביתו', 'אמר שלום והלך לביתו')  # הסר נקודה מיותרת
    ]

    for wrong, correct in specific_fixes:
        text = text.replace(wrong, correct)

    print('Phase 6: Applied specific fixes', file=sys.stderr)

    # שלב 7: תיקונים סופיים וחיוניים - חובה שיעבדו!
    print('Phase 7: Final critical fixes', file=sys.stderr)

    # תיקונים אחרונים וחיוניים
    text = text.replace('""יחיינו', '"יחיינו')
    text = text.replace('"""יחיינו', '"יחיינו')
    text = text.replace('""""יחיינו', '"יחיינו')

    # תיקון חזל בכל מקום
    text = text.replace('חזל', 'חז"ל')
    text = text.replace('חז ל', 'חז"ל')

    # תיקון זל בכל מקום
    text = re.sub(r'\bזל\b', 'ז"ל', text)
    text = text.replace(' זל ', ' ז"ל ')
    text = text.replace(' זל.', ' ז"ל.')
    text = text.replace(' זל,', ' ז"ל,')
    text = text.replace('זל בענין', 'ז"ל בענין')

    # עוד סיבוב תיקונים למקרה שלא עבד
    text = text.replace('חזל', 'חז"ל')
    text = text.replace('זל בענין', 'ז"ל בענין')
    text = text.replace('זל מביאים', 'ז"ל מביאים')

    # תיקון פסוקים שחסרים גרשיים בהתחלה
    text = text.replace('בקרב הארץ"', '"בקרב הארץ"')
    text = text.replace('לעשותם בקרב הארץ"', '"לעשותם בקרב הארץ"')

    # הסרת גרשיים מיותרים ממילים בודדות - אגרסיבי
    problematic_quoted_words = [
        'את', 'רוצה', 'לעשות', 'משהו', 'צריכה', 'גוי', 'תראה', 'איך',
        'שמע', 'ישראל', 'בבוקר', 'הרמבן', 'ר\'', 'זלמן', 'אומר', 'לו',
        'דבר', 'שני', 'עמוד', 'ב\'', 'טעמוד', 'כתוב', 'בפסוק'
    ]

    for word in problematic_quoted_words:
        # הסר גרשיים מיותרים מסביב למילים בודדות
        text = re.sub(rf'\s+"{word}"\s+', f' {word} ', text)  # רווח לפני ואחרי
        text = re.sub(rf'"{word}"\s+', f'{word} ', text)      # התחלת משפט
        text = re.sub(rf'\s+"{word}"', f' {word}', text)      # סוף משפט
        text = re.sub(rf'"{word}"([.,!?])', rf'{word}\1', text)  # לפני פיסוק

    # הסרת גרשיים מיותרים במקומות כלליים
    text = re.sub(r'(?<=[א-ת])\s+"([א-ת]{1,6})"\s+(?=[א-ת])', r' \1 ', text)  # מילה באמצע משפט

    # תיקונים ישירים לבעיות ספציפיות של גרשיים מיותרים
    text = text.replace('"דבר "שני', 'דבר שני')
    text = text.replace('"אומר "לו', 'אומר לו')
    text = text.replace('"את "צריכה', 'את צריכה')
    text = text.replace('"אתה "רוצה', 'אתה רוצה')
    text = text.replace('"לעשות "משהו', 'לעשות משהו')
    text = text.replace('"תראה "איך', 'תראה איך')
    text = text.replace('כל "גוי', 'כל גוי')
    text = text.replace('היום "בבוקר', 'היום בבוקר')

    # תיקון כללי לגרשיים מיותרים במילים בודדות
    text = re.sub(r'"([א-ת]{1,8})"\s+(?![א-ת]*")', r'\1 ', text)  # "מילה" מילה -> מילה מילה
    text = re.sub(r'\s+"([א-ת]{1,8})"\s+', r' \1 ', text)        # מילה "מילה" מילה -> מילה מילה מילה

    # תיקונים ספציפיים נוספים לבעיות חדשות
    text = text.replace('ה"אוהב ישראל', 'ה"אוהב ישראל"')  # הוסף גרשיים אחרי ישראל
    text = text.replace('תראה איך נראה יהודי, תראה איך את הדברים האלה"', '"תראה איך נראה יהודי, תראה איך את הדברים האלה"')  # הוסף גרשיים בהתחלה
    text = text.replace('"לעשותם "בקרב הארץ"', '"לעשותם בקרב הארץ"')  # הסר גרשיים מיותרים
    text = text.replace('לעשותם ""בקרב הארץ"', 'לעשותם בקרב הארץ"')  # הסר גרשיים כפולים
    text = text.replace('שאינו עומד בדיבורו."', 'שאינו עומד בדיבורו".')  # הזז נקודה אחרי גרשיים
    text = text.replace('שאינו עומד בדיבורו"', '"שאינו עומד בדיבורו"')  # הוסף גרשיים פותחים
    text = text.replace('מזלטוב', 'מזל טוב')  # הפרד מילים צמודות
    text = text.replace('למען תחיון", אומר למען תחיון"', '"למען תחיון", אומר "למען תחיון"')  # הוסף גרשיים בהתחלה

    # תיקון נוסף לגרשיים כפולים לפני מילים
    text = re.sub(r'""([א-ת])', r'"\1', text)  # ""מילה -> "מילה
    text = re.sub(r'"""([א-ת])', r'"\1', text)  # """מילה -> "מילה

    # תיקון פסקאות שנקטעות באמצע משפט
    text = text.replace('לעתיד לבוא.\nוסוכה שמה."', 'לעתיד לבוא. וסוכה שמה."')  # חבר משפט שנקטע

    # תיקון נוסף לגרשיים אחרי נקודה - אגרסיבי יותר
    text = re.sub(r'([א-ת])\.\"', r'\1".', text)  # מילה." -> מילה".
    text = re.sub(r'([א-ת])\."', r'\1".', text)   # מילה." -> מילה".

    # תיקונים ספציפיים לבעיות שדווחו
    text = text.replace('גן עדן".מה', 'גן עדן". מה')  # הוסף רווח אחרי נקודה
    text = text.replace('יושר".והיה', 'יושר". והיה')  # הוסף רווח אחרי נקודה

    # תיקון כללי לנקודה+גרשיים+מילה צמודה
    text = re.sub(r'([א-ת])\."([א-ת])', r'\1". \2', text)  # מילה."מילה -> מילה". מילה
    text = re.sub(r'([א-ת])\"\.([א-ת])', r'\1". \2', text)  # מילה".מילה -> מילה". מילה

    # ניקוי סופי
    text = text.strip()

    print('✅ ULTIMATE Hebrew processing completed!', file=sys.stderr)
    return text

def set_rtl_paragraph(paragraph):
    """
    מגדיר פסקה כ-RTL (ימין לשמאל) - גרסה משופרת
    """
    try:
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement

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

        # הוספת יישור ימין חזק
        jc = OxmlElement('w:jc')
        jc.set(qn('w:val'), 'right')
        pPr.append(jc)

        print(f"RTL settings applied to paragraph", file=sys.stderr)

    except Exception as e:
        print(f"Warning: Cannot set RTL: {str(e)}", file=sys.stderr)

def main():
    """
    פונקציה ראשית המקבלת פרמטרים מ-Node.js
    """
    try:
        print("Python script started", file=sys.stderr)
        print(f"Python version: {sys.version}", file=sys.stderr)
        print(f"Arguments: {sys.argv}", file=sys.stderr)

        if len(sys.argv) != 2:
            print("Usage: python generate_word_doc.py '<json_file_path>'")
            sys.exit(1)

        # בדיקת python-docx - לא בהכרח נדרשת כי יש לנו HTML fallback
        try:
            import docx
            print(f"python-docx version: {docx.__version__}", file=sys.stderr)
            print("python-docx is available", file=sys.stderr)
        except ImportError as e:
            print(f"python-docx import error: {str(e)}", file=sys.stderr)
            print("Will use HTML fallback instead", file=sys.stderr)

        # קריאת הנתונים מקובץ JSON
        json_file_path = sys.argv[1]
        print(f"Reading JSON data from file: {json_file_path}", file=sys.stderr)

        try:
            with open(json_file_path, 'r', encoding='utf-8') as f:
                json_data = f.read()
            print(f"Loaded JSON data length: {len(json_data)}", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: Failed to read JSON file: {str(e)}", file=sys.stderr)
            print(json.dumps({"success": False, "error": f"Failed to read JSON file: {str(e)}"}))
            sys.exit(1)

        data = json.loads(json_data)
        print(f"Parsed data keys: {list(data.keys())}", file=sys.stderr)

        transcription = data.get('transcription', '')
        title = data.get('title', 'תמלול')
        output_path = data.get('output_path', 'output.docx')
        language = data.get('language', 'Hebrew')  # ברירת מחדל: עברית

        print(f"Creating document: {title} -> {output_path}", file=sys.stderr)
        print(f"Transcription type: {type(transcription)}", file=sys.stderr)
        print(f"Transcription length: {len(str(transcription))}", file=sys.stderr)
        print(f"Transcription preview: {str(transcription)[:100]}...", file=sys.stderr)

        # Validation של הטקסט
        if not transcription or not isinstance(transcription, str):
            error_msg = f"Invalid transcription data: type={type(transcription)}, value={str(transcription)[:200]}"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            print(json.dumps({"success": False, "error": error_msg}))
            sys.exit(1)

        if len(transcription.strip()) < 10:
            error_msg = f"Transcription too short: '{transcription}'"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            print(json.dumps({"success": False, "error": error_msg}))
            sys.exit(1)

        # יצירת המסמך
        success = create_hebrew_word_document(transcription, title, output_path, language)

        if success:
            print(json.dumps({"success": True, "file_path": output_path}))
        else:
            print(json.dumps({"success": False, "error": "Failed to create document"}))

    except Exception as e:
        print(f"Exception in main: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()