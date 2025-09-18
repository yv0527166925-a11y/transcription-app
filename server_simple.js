// גיבוי של הפונקציה הפשוטה
async function createWordDocumentSimple(transcription, filename, duration) {
  try {
    const cleanName = cleanFilename(filename);

    // נקה את הטקסט פשוט
    let cleanedText = transcription
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const sections = cleanedText.split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);

    // בנה HTML פשוט עם RTL
    let contentHtml = '';
    sections.forEach(section => {
      const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let combinedSection = lines.join(' ').trim();

      // תיקון פיסוק בסיסי בלבד
      combinedSection = combinedSection
        .replace(/\s*\.\s*/g, '. ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*!\s*/g, '! ')
        .replace(/\s*\?\s*/g, '? ')
        .replace(/\s*:\s*/g, ': ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!combinedSection.endsWith('.') && !combinedSection.endsWith('!') && !combinedSection.endsWith('?') && !combinedSection.endsWith(':')) {
        combinedSection += '.';
      }

      contentHtml += `<p dir="rtl" style="direction: rtl !important; text-align: right !important; margin-bottom: 16px; line-height: 1.7; font-size: 12pt;"><span lang="he-IL" xml:lang="he-IL">${combinedSection}</span></p>`;
    });

    const htmlString = `
      <!DOCTYPE html>
      <html lang="he-IL" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="language" content="Hebrew">
          <meta http-equiv="Content-Language" content="he-IL">
          <title>תמלול</title>
        </head>
        <body dir="rtl" style="direction: rtl !important; text-align: right !important; font-family: Arial, sans-serif; font-size: 12pt;" lang="he-IL">
          <h1 dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 16pt; font-weight: bold; margin-bottom: 24px; margin-top: 0;">${cleanName}</h1>
          <div dir="rtl" style="direction: rtl !important; text-align: right !important; font-size: 12pt; line-height: 1.8;">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    const buffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      lang: 'he-IL',
      locale: 'he-IL'
    });

    return buffer;
  } catch (error) {
    console.error('❌ Error creating Word document:', error);
    throw error;
  }
}