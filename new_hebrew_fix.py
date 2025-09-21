def fix_hebrew_punctuation_aggressive(text):
    """
    תיקון אגרסיבי וסופי לכל בעיות הטקסט העברי
    """
    import re

    print('🔧 Starting AGGRESSIVE Hebrew processing...', file=sys.stderr)

    # שלב 1: ניקוי בסיסי
    text = re.sub(r'["\u0022\u201C\u201D]', '"', text)
    text = text.replace('\\', '')

    # שלב 2: תיקון קיצורים - כל הווריאציות
    abbreviations = {
        'שליט "א': 'שליט"א',
        'שליט \"א': 'שליט"א',
        'רש "י': 'רש"י',
        'רש י': 'רש"י',
        'חז "ל': 'חז"ל',
        'חז ל': 'חז"ל',
        'ל "ט': 'ל"ט',
        'ל ט': 'ל"ט',
        'הרמב "ן': 'הרמב"ן',
        'הרמב ן': 'הרמב"ן',
        'רמב "ם': 'רמב"ם',
        'רמב ם': 'רמב"ם',
        'האר י ז ל': 'האר"י ז"ל'
    }

    for wrong, correct in abbreviations.items():
        text = text.replace(wrong, correct)

    # שלב 3: הסרת גרשיים מיותרים ממילים ספציפיות
    unwanted_quoted_words = [
        'עמוד', 'יחיינו', 'מיומיים', 'כתוב', 'בפסוק', 'ברוך', 'תהיה',
        'גוי', 'תראה', 'איך', 'ז', 'ל', 'בענין', 'מביאים', 'הרמב', 'ן',
        'ר', 'צריכה', 'את', 'רוצה', 'לעשות', 'משהו', 'שמע', 'ישראל'
    ]

    for word in unwanted_quoted_words:
        text = text.replace(f'"{word}"', word)

    # שלב 4: תיקון ציטוטים מפוצלים
    text = re.sub(r'"([א-ת]+)\s+"([א-ת]+)"', r'"\1 \2"', text)

    # שלב 5: תיקון מילים צמודות
    merged_words = {
        'יודעתראו': 'יודעת ראו',
        'אמרשלום': 'אמר שלום',
        'זהדבר': 'זה דבר',
        'חשובמאוד': 'חשוב מאוד',
        'שאלתיאותו': 'שאלתי אותו'
    }

    for wrong, correct in merged_words.items():
        text = text.replace(wrong, correct)

    # שלב 6: תיקון פיסוק ורווחים
    text = re.sub(r'([א-ת])\.([א-ת])', r'\1. \2', text)  # נקודה צמודה
    text = re.sub(r'([.,!?:;])([א-ת])', r'\1 \2', text)  # רווח אחרי פיסוק
    text = re.sub(r'\s+([.,!?:;])', r'\1', text)         # הסר רווח לפני פיסוק
    text = re.sub(r'\s{2,}', ' ', text)                  # רווחים כפולים

    print('✅ AGGRESSIVE Hebrew processing completed', file=sys.stderr)
    return text.strip()

# Test the function
if __name__ == "__main__":
    test_text = 'שליט "א, רש י אמר בקידושין בדף ל"ט "עמוד ב\'.'
    result = fix_hebrew_punctuation_aggressive(test_text)
    print("Input:", test_text)
    print("Output:", result)