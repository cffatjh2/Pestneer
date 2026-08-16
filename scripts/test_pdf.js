const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; }
  h1 { color: #0f766e; }
</style>
</head>
<body>
  <h1>Pesneer Test Belgesi</h1>
  <p>Bu bir test PDF çıktısıdır.</p>
</body>
</html>
`;

const tempHtml = path.join(__dirname, 'temp_test.html');
fs.writeFileSync(tempHtml, htmlContent, 'utf8');

const outputPath = 'C:\\Users\\cffat\\OneDrive\\Masaüstü\\Pesneer_Kullanim_Test.pdf';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

try {
  execSync(`"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPath}" "${tempHtml}"`, { stdio: 'inherit' });
  console.log("PDF Created Successfully at:", outputPath);
  console.log("Exists:", fs.existsSync(outputPath));
} catch (e) {
  console.error("Error creating PDF:", e);
} finally {
  if (fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml);
}
