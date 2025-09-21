#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json

# ייבוא הפונקציה המעודכנת
from generate_word_doc import create_hebrew_word_document

def test_template_approach():
    test_text = """שלום, זה בדיקת תמלול מהשרת החדש עם פתרון Python מבוסס תבנית!

הטקסט הזה מכיל פסקאות מרובות. האם הוא יעבוד כהלכה עם התבנית העובדת? אני מקווה שכן.

זו פסקה נוספת עם סימני פיסוק: נקודות, פסיקים, סימני קריאה! וגם נקודותיים: כמו כאן.

פסקה רביעית לבדיקת פרדת הפסקאות. זה אמור להיראות מעולה ללא בעיות פיסוק.

בואו נראה איך זה עובד בפועל עם התבנית העובדת!"""

    title = "בדיקה עם תבנית עובדת"
    output_path = "בדיקה_תבנית_עובדת.docx"

    success = create_hebrew_word_document(test_text, title, output_path)

    if success:
        print(f"SUCCESS: {output_path}")
        return True
    else:
        print("FAILED")
        return False

if __name__ == "__main__":
    test_template_approach()