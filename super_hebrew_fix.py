#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import sys

def super_aggressive_hebrew_fix(text):
    """
    תיקון סופי וחזק לכל בעיות הטקסט העברי - בהתבסס על התוצאות האמיתיות
    """

    print('🔧 Starting SUPER AGGRESSIVE Hebrew fix...', file=sys.stderr)

    # שלב 1: ניקוי בסיסי
    text = text.replace('\\', '')
    text = re.sub(r'["\u0022\u201C\u201D]', '"', text)

    print('Phase 1: Basic cleanup done', file=sys.stderr)

    # שלב 2: תיקון קיצורים עבריים - חזק מאוד
    # כל הווריאציות האפשריות
    abbreviation_fixes = [
        ('שליט "א', 'שליט"א'),
        ('רש "י', 'רש"י'),
        ('רש י', 'רש"י'),
        ('חז "ל', 'חז"ל'),
        ('חז ל', 'חז"ל'),
        ('ל "ט', 'ל"ט'),
        ('ל ט', 'ל"ט'),
        ('הרמב "ן', 'הרמב"ן'),
        ('רמב "ם', 'רמב"ם'),
        ('שו "ע', 'שו"ע'),
        ('ד "ה', 'ד"ה'),
        ('ב "ה', 'ב"ה'),
        ('האר י ז ל', 'האר"י ז"ל'),
        ('האר"י "ז"ל', 'האר"י ז"ל')
    ]

    for wrong, correct in abbreviation_fixes:
        text = text.replace(wrong, correct)

    print('Phase 2: Fixed abbreviations', file=sys.stderr)

    # שלב 3: הסרת גרשיים מיותרים מכל המילים הבעייתיות
    problematic_quoted_words = [
        '"עמוד', '"יחיינו', '"מיומיים', '"כתוב', '"בפסוק', '"ברוך', '"תהיה',
        '"גוי', '"תראה', '"איך', '"ז"ל', '"בענין', '"מביאים', '"הרמב"ן',
        '"ר\'', '"צריכה', '"את', '"רוצה', '"לעשות', '"משהו', '"שמע', '"ישראל'
    ]

    for quoted_word in problematic_quoted_words:
        clean_word = quoted_word[1:]  # הסר את הגרשיים הראשונים
        text = text.replace(quoted_word, clean_word)

    # הסר גרשיים מיותרים בסוף מילים
    end_quoted_words = [
        'עמוד"', 'יחיינו"', 'מיומיים"', 'כתוב"', 'בפסוק"', 'ברוך"', 'תהיה"',
        'גוי"', 'תראה"', 'איך"', 'בענין"', 'מביאים"', 'צריכה"', 'את"',
        'רוצה"', 'לעשות"', 'משהו"', 'שמע"', 'ישראל"'
    ]

    for quoted_word in end_quoted_words:
        clean_word = quoted_word[:-1]  # הסר את הגרשיים האחרונים
        text = text.replace(quoted_word, clean_word)

    print('Phase 3: Removed unwanted quotes', file=sys.stderr)

    # שלב 4: תיקון מילים צמודות
    merged_word_fixes = [
        ('אמרשלום', 'אמר שלום'),
        ('זהדבר', 'זה דבר'),
        ('חשובמאוד', 'חשוב מאוד'),
        ('יודעתראו', 'יודעת ראו'),
        ('שאלתיאותו', 'שאלתי אותו'),
        ('אומרתאני', 'אומרת אני')
    ]

    for wrong, correct in merged_word_fixes:
        text = text.replace(wrong, correct)

    print('Phase 4: Fixed merged words', file=sys.stderr)

    # שלב 5: תיקון ציטוטים מפוצלים - אגרסיבי
    # תקן ציטוטים שמפוצלים בטעות
    text = re.sub(r'"([א-ת]+)\s+"([א-ת]+)"', r'"\1 \2"', text)  # "מילה "מילה" -> "מילה מילה"
    text = re.sub(r'"([א-ת]+)"\s+"([א-ת]+)"', r'"\1 \2"', text)  # "מילה" "מילה" -> "מילה מילה"

    print('Phase 5: Fixed split quotes', file=sys.stderr)

    # שלב 6: תיקון פיסוק ורווחים
    text = re.sub(r'([א-ת])\.([א-ת])', r'\1. \2', text)  # נקודה צמודה
    text = re.sub(r'([.,!?:;])([א-ת])', r'\1 \2', text)  # רווח אחרי פיסוק
    text = re.sub(r'\s+([.,!?:;])', r'\1', text)         # הסר רווח לפני פיסוק
    text = re.sub(r'\s{2,}', ' ', text)                  # רווחים כפולים

    print('Phase 6: Fixed punctuation', file=sys.stderr)

    # שלב 7: תיקונים ספציפיים לבעיות שנותרו
    specific_fixes = [
        ('". "ברוך', '"ברוך'),  # הסר נקודה וגרשיים מיותרים
        ('"ברוך "תהיה', '"ברוך תהיה'),
        ('"תראה "איך', '"תראה איך'),
        ('שואל "הרמב"ן', 'שואל הרמב"ן'),
        ('אומר "ר\'', 'אומר ר\''),
        ('הם קראו "שמע "ישראל"', 'הם קראו "שמע ישראל"')
    ]

    for wrong, correct in specific_fixes:
        text = text.replace(wrong, correct)

    print('Phase 7: Applied specific fixes', file=sys.stderr)

    print('✅ SUPER AGGRESSIVE Hebrew fix completed!', file=sys.stderr)
    return text.strip()

# Test the function
if __name__ == "__main__":
    test_input = '''שליט "א, רש י אמר בקידושין בדף ל"ט "עמוד ב'. חז"ל "מביאים את דברי האר"י "ז"ל "בענין זה. "יחיינו "מיומיים "כתוב "בפסוק. ".
"ברוך "תהיה מכל העמים". כל "גוי שיעבור, יגיד, "תראה "איך נראה יהודי. לעשותם בקרב הארץ". שואל "הרמב"ן, אומר "ר\' זלמן.
נמאס. מאיפה באה הבעיה. ההצלחה. דוד מלך ישראל. נפלאים. בעזרת השם יתברך. זה. כשאדם רואה דבר כזה. יודעת ראו מה קרה?
שאלתי אותו אבל הוא לא ענה. אומר לו, דבר שני. את "צריכה "את זה? אתה "רוצה "לעשות "משהו טוב. הוא אמרשלום לכולם. זהדבר חשובמאוד בחיים. אמר שלום. והלך לביתו. הם קראו "שמע "ישראל".'''

    result = super_aggressive_hebrew_fix(test_input)
    print("\n=== RESULT ===")
    print(result)