const fs = require("fs");
const path = require("path");

const resultsDir = path.join(__dirname, "test-results");
const cleanDir = path.join(resultsDir); // we’ll put clean folders here

function sanitizeName(name) {
  return name.replace(/[^a-z0-9]/gi, "_");
}

fs.readdirSync(resultsDir).forEach((folder) => {
  const folderPath = path.join(resultsDir, folder);
  if (!fs.statSync(folderPath).isDirectory()) return;

  const traceFile = path.join(folderPath, "trace.zip");
  if (!fs.existsSync(traceFile)) {
    // Remove passed test folders (no trace.zip)
    fs.rmSync(folderPath, { recursive: true, force: true });
    return;
  }

  // Try to derive test name (fallback: use folder name)
  let testName = folder.split("-chromium")[0]; // crude cleanup
  const cleanFolder = path.join(cleanDir, sanitizeName(testName));

  if (!fs.existsSync(cleanFolder)) {
    fs.mkdirSync(cleanFolder, { recursive: true });
  }

  // Copy all artifact files from the Playwright folder
  fs.readdirSync(folderPath).forEach((file) => {
    const src = path.join(folderPath, file);
    const dest = path.join(cleanFolder, file);
    fs.copyFileSync(src, dest);
  });

  console.log(`📦 Created clean folder: ${cleanFolder}`);
});

console.log("✅ Cleaned passed tests and copied artifacts for failed ones.");
