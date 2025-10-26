const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting template modification process...');

// Step 1: Extract the template.docx file
console.log('1. Extracting template.docx...');
const extractDir = path.join(__dirname, 'template_extracted');

// Remove existing extraction directory if it exists
if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
}

// Extract the docx file
execSync(`cd "${__dirname}" && mkdir template_extracted && cd template_extracted && unzip -q ../template.docx`);

// Step 2: Read and modify document.xml
console.log('2. Reading document.xml...');
const documentXmlPath = path.join(extractDir, 'word', 'document.xml');
let documentXml = fs.readFileSync(documentXmlPath, 'utf8');

console.log('3. Replacing Hebrew text content with REPLACECONTENT...');

// Function to replace text content while preserving all formatting
function replaceTextContent(xmlContent) {
    // This regex finds all <w:t> tags and their content, including those with xml:space attributes
    // It preserves all formatting elements around the text
    const textTagRegex = /(<w:t[^>]*>)(.*?)(<\/w:t>)/g;

    let modifiedXml = xmlContent.replace(textTagRegex, (match, openTag, textContent, closeTag) => {
        // Only replace if there's actual Hebrew/text content (not empty or just spaces)
        const trimmedContent = textContent.trim();
        if (trimmedContent.length > 0) {
            // Replace with REPLACECONTENT, preserving any xml:space attributes
            return openTag + 'REPLACECONTENT' + closeTag;
        }
        // Keep original if it's just whitespace or empty
        return match;
    });

    return modifiedXml;
}

// Apply the text replacement
const modifiedDocumentXml = replaceTextContent(documentXml);

// Step 3: Write the modified document.xml back
console.log('4. Writing modified document.xml...');
fs.writeFileSync(documentXmlPath, modifiedDocumentXml, 'utf8');

// Step 4: Repackage into template.docx
console.log('5. Repackaging into template.docx...');

// Create backup of original template
if (!fs.existsSync(path.join(__dirname, 'template.docx.backup'))) {
    fs.copyFileSync(path.join(__dirname, 'template.docx'), path.join(__dirname, 'template.docx.backup'));
    console.log('   Created backup: template.docx.backup');
}

// Use PowerShell to create the zip file (Windows compatible)
const tempZipPath = path.join(__dirname, 'temp_template.zip');
execSync(`powershell "Compress-Archive -Path '${extractDir}\\*' -DestinationPath '${tempZipPath}' -Force"`);

// Replace the original template.docx with the new one
const templatePath = path.join(__dirname, 'template.docx');
if (fs.existsSync(templatePath)) {
    fs.unlinkSync(templatePath);
}
fs.renameSync(tempZipPath, templatePath);

console.log('6. Template modification completed successfully!');
console.log('');
console.log('Summary:');
console.log('- Original template backed up as template.docx.backup');
console.log('- All Hebrew text content replaced with "REPLACECONTENT"');
console.log('- All RTL formatting, paragraph structure, and Hebrew language settings preserved');
console.log('- Template ready for server use');

// Cleanup
process.chdir(__dirname);
fs.rmSync(extractDir, { recursive: true, force: true });

console.log('- Temporary files cleaned up');
console.log('');
console.log('The modified template.docx is ready for use in your Hebrew transcription application.');