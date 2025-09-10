const fs = require("fs");
const path = require("path");
const JiraClient = require("jira-client");
const readline = require("readline");
require("dotenv").config();

const resultsDir = path.join(__dirname, "test-results");

const jira = new JiraClient({
  protocol: "https",
  host: process.env.JIRA_HOST.replace("https://", "").replace("http://", ""),
  username: process.env.JIRA_USER,
  password: process.env.JIRA_TOKEN,
  apiVersion: "2",
  strictSSL: true,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createJiraIssue(testName, errorDetails, artifactFiles) {
  try {
    const allureUrl = process.env.ALLURE_REPORT_URL || "";

    // Build description
    let description = `h3. Failed Test\n*Test Name:* ${testName}\n\n*Error Details:*\n${errorDetails}`;
    if (allureUrl) {
      description += `\n\n*Allure Report:* [Open Report|${allureUrl}]`;
    }

    // Create Jira issue
    const issue = await jira.addNewIssue({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY },
        summary: `[Automation Bug] ${testName}`,
        description,
        issuetype: { name: "Bug" },
      },
    });

    console.log(`✅ Jira issue created: ${issue.key}`);

    // Attach all artifacts
    for (const file of artifactFiles) {
      if (fs.existsSync(file)) {
        await jira.addAttachmentOnIssue(issue.key, fs.createReadStream(file));
        console.log(`📎 Attached: ${path.basename(file)}`);
      }
    }

    return issue.key;
  } catch (err) {
    console.error("❌ Failed to create Jira issue:", err);
  }
}

function getFailedTestsArtifacts() {
  const failedTests = [];

  if (!fs.existsSync(resultsDir)) {
    console.error("No test-results directory found!");
    return failedTests;
  }

  const testFolders = fs.readdirSync(resultsDir);
  testFolders.forEach((folder) => {
    const folderPath = path.join(resultsDir, folder);
    if (fs.statSync(folderPath).isDirectory()) {
      const stepsLogPath = path.join(folderPath, "steps.log");

      if (fs.existsSync(stepsLogPath)) {
        const stepsContent = fs.readFileSync(stepsLogPath, "utf-8");

        // Collect artifact files
        const artifacts = fs.readdirSync(folderPath).map((f) => path.join(folderPath, f));

        failedTests.push({
          testName: folder,
          errorDetails: stepsContent,
          artifactFiles: artifacts.filter(
            (f) =>
              f.endsWith(".png") || // screenshots
              f.endsWith(".webm") || // videos
              f.endsWith(".zip") || // traces
              f.endsWith(".json") // logs
          ),
        });
      }
    }
  });

  return failedTests;
}

async function main() {
  const failedTests = getFailedTestsArtifacts();

  for (const test of failedTests) {
    const answer = await askQuestion(
      `❓ Do you want to log a Jira issue for test "${test.testName}"? (y/n): `
    );
    if (answer.toLowerCase() === "y") {
      await createJiraIssue(test.testName, test.errorDetails, test.artifactFiles);
    } else {
      console.log(`⏭️ Skipped Jira issue for: ${test.testName}`);
    }
  }

  rl.close();
}

main();
