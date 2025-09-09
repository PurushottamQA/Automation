const fs = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, 'test-results');

fs.readdirSync(resultsDir).forEach((folder) => {
  const folderPath = path.join(resultsDir, folder);
  if (!fs.statSync(folderPath).isDirectory()) return;

  const traceFile = path.join(folderPath, 'trace.zip'); // Playwright creates trace only for failed tests
  if (!fs.existsSync(traceFile)) {
    // Remove folders without trace.zip (i.e., passed tests)
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
});

console.log('✅ Cleaned passed test folders. Only failed tests remain.');
