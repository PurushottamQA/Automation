// jira-reporter.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const readline = require("readline");

// Debug log env vars
console.log("✅ Loaded ENV:");
console.log({
  JIRA_HOST: process.env.JIRA_HOST,
  JIRA_USER: process.env.JIRA_USER,
  JIRA_TOKEN: process.env.JIRA_TOKEN ? "✅ Loaded" : "❌ Missing",
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,
  ALLURE_REPORT_URL: process.env.ALLURE_REPORT_URL,
});

// Directory containing test results
const resultsDir = path.join(__dirname, "test-results");

// Helper: prompt user
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

// Helper: load steps.log if available
function loadStepsLog(testDir) {
  const logPath = path.join(testDir, "steps.log");
  if (!fs.existsSync(logPath)) return null;

  console.log(`📝 steps.log found for ${path.basename(testDir)}`);
  return fs.readFileSync(logPath, "utf-8").trim();
}

// Helper: attach all artifacts from the clean failed-test folder
async function attachArtifacts(issueKey, testDir) {
  const artifacts = fs.readdirSync(testDir).filter(f =>
    f.endsWith(".zip") || f.endsWith(".png") || f.endsWith(".webm") || f === "steps.log"
  );

  console.log(`🔹 Found ${artifacts.length} artifact(s) for ${path.basename(testDir)}`);

  for (const fileName of artifacts) {
    const form = new FormData();
    form.append("file", fs.createReadStream(path.join(testDir, fileName)));

    await axios.post(
      `${process.env.JIRA_HOST}/rest/api/2/issue/${issueKey}/attachments`,
      form,
      {
        auth: { username: process.env.JIRA_USER, password: process.env.JIRA_TOKEN },
        headers: { "X-Atlassian-Token": "no-check", ...form.getHeaders() },
      }
    );
    console.log(`📎 Attached: ${fileName}`);
  }
}

(async () => {
  if (!fs.existsSync(resultsDir)) {
    console.log("❌ No test-results folder found.");
    return;
  }

  const testDirs = fs
    .readdirSync(resultsDir)
    .map(f => path.join(resultsDir, f))
    .filter(p => fs.statSync(p).isDirectory());

  if (testDirs.length === 0) {
    console.log("✅ No test folders found.");
    return;
  }

  for (const testDir of testDirs) {
    // Load steps.log; if missing, skip (passed tests or gibberish folders)
    const stepsLog = loadStepsLog(testDir);
    if (!stepsLog) {
      console.log(`⏭️ Skipping passed or invalid test folder: ${path.basename(testDir)}`);
      continue;
    }

    const summary = `[Automation Bug] ${path.basename(testDir)}`;
    const description = `Automated test **${path.basename(testDir)}** failed.\n\n**Steps to Reproduce:**\n${stepsLog}\n\nAllure Report: ${process.env.ALLURE_REPORT_URL || 'N/A'}`;

    const answer = await askQuestion(`Create Jira for failed test "${summary}"? (y/n) `);
    if (answer.toLowerCase() !== "y") {
      console.log(`⏭️ Skipped Jira issue for ${path.basename(testDir)}`);
      continue;
    }

    try {
      console.log(`🔹 Creating Jira issue for ${path.basename(testDir)}...`);
      const res = await axios.post(
        `${process.env.JIRA_HOST}/rest/api/2/issue`,
        {
          fields: {
            project: { key: process.env.JIRA_PROJECT_KEY },
            summary,
            description,
            issuetype: { name: "Bug" },
          },
        },
        {
          auth: { username: process.env.JIRA_USER, password: process.env.JIRA_TOKEN },
        }
      );

      const issueKey = res.data.key;
      console.log(`✅ Created Jira issue: ${issueKey}`);

      // Attach all artifacts
      await attachArtifacts(issueKey, testDir);

    } catch (err) {
      console.error("❌ Failed to create Jira issue:", err.message);
    }
  }
})();
