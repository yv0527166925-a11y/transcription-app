#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json

def test_python_script():
    """
    בדיקת הסקריפט Python בנפרד
    """

    # נתונים לבדיקה
    test_data = {
        "transcription": "זה טקסט בדיקה לסקריפט Python. האם הוא עובד כהלכה? כן, אני חושב שכן.",
        "title": "בדיקת סקריפט Python",
        "output_path": "debug_test.docx"
    }

    print("Testing Python script with debug data...")
    print(f"Input: {test_data}")

    try:
        from generate_word_doc import create_hebrew_word_document

        success = create_hebrew_word_document(
            test_data['transcription'],
            test_data['title'],
            test_data['output_path']
        )

        if success:
            print("SUCCESS: Python script works correctly")
            print(json.dumps({"success": True, "file_path": test_data['output_path']}))
        else:
            print("FAILED: Python script failed")
            print(json.dumps({"success": False, "error": "Script returned False"}))

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    test_python_script()