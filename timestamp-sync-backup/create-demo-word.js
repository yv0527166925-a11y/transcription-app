// יצירת קובץ Word דמו עם חותמות זמן נסתרות לבדיקה
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function createDemoWordWithTimestamps() {
  try {
    console.log('🎯 Creating demo Word document with embedded timestamps...');

    const transcription = `כותרת: מסר לפרשת נצבים

זה טקסט לדוגמה לבדיקת הסינכרון. כל מילה במשפט הזה צריכה להיות מסונכרנת עם האודיו. אפשר ללחוץ על כל מילה וזה יקפוץ למקום הנכון באודיו. המערכת החדשה תזהה אוטומטי חותמות זמן מקבצי Word.`;

    const duration = 60; // 60 שניות
    const words = transcription.split(/\s+/).filter(w => w.trim().length > 0);
    const timePerWord = duration / words.length;

    // יצירת מידע חותמות הזמן
    const timestampData = {
      version: "1.0",
      totalDuration: duration,
      audioSync: words.map((word, index) => ({
        index,
        word: word.trim(),
        startTime: index * timePerWord,
        endTime: (index + 1) * timePerWord
      }))
    };

    // יצירת ZIP חדש
    const zip = new JSZip();

    // Basic document.xml
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${transcription}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    zip.file('word/document.xml', docXml);

    // Core properties
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
    <dc:title>מסר לפרשת נצבים</dc:title>
    <dc:creator>Demo System</dc:creator>
    <cp:lastModifiedBy>Demo System</cp:lastModifiedBy>
    <cp:revision>1</cp:revision>
    <cp:created>2025-11-07T10:00:00Z</cp:created>
    <cp:modified>2025-11-07T10:00:00Z</cp:modified>
</cp:coreProperties>`;

    zip.file('docProps/core.xml', coreXml);

    // App properties
    const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
    <Application>Demo Transcription App</Application>
    <DocSecurity>0</DocSecurity>
    <ScaleCrop>false</ScaleCrop>
    <SharedDoc>false</SharedDoc>
    <HyperlinksChanged>false</HyperlinksChanged>
    <AppVersion>1.0</AppVersion>
</Properties>`;

    zip.file('docProps/app.xml', appXml);

    // 🎯 Custom Properties עם חותמות הזמן
    const customPropsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="audioTimestamps">
        <vt:lpwstr>${Buffer.from(JSON.stringify(timestampData)).toString('base64')}</vt:lpwstr>
    </property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="syncVersion">
        <vt:lpwstr>1.0</vt:lpwstr>
    </property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="4" name="wordCount">
        <vt:i4>${words.length}</vt:i4>
    </property>
</Properties>`;

    zip.file('docProps/custom.xml', customPropsXml);

    // Content Types
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

    zip.file('[Content_Types].xml', contentTypesXml);

    // Main relationships
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
    <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
    <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>
</Relationships>`;

    zip.file('_rels/.rels', relsXml);

    // יצירת הקובץ
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const outputPath = path.join(__dirname, 'demo-with-timestamps.docx');
    fs.writeFileSync(outputPath, buffer);

    console.log(`✅ Demo Word document created: ${outputPath}`);
    console.log(`🎯 Contains ${words.length} words with timestamps`);
    console.log(`⏱️ Total duration: ${duration} seconds (${timePerWord.toFixed(2)}s per word)`);

    return outputPath;

  } catch (error) {
    console.error('❌ Error creating demo Word document:', error);
    throw error;
  }
}

// הרץ את הפונקציה
createDemoWordWithTimestamps().then(filePath => {
  console.log('🎉 Demo Word document ready for testing!');
  console.log(`📁 File: ${filePath}`);
  console.log('📝 Instructions:');
  console.log('   1. Go to http://localhost:3000/player.html');
  console.log('   2. Upload any audio file (for demo)');
  console.log('   3. Upload this Word document');
  console.log('   4. Check that it shows: "🎯 קובץ Word עם חותמות זמן מוטמעות"');
}).catch(error => {
  console.error('❌ Failed to create demo:', error);
});