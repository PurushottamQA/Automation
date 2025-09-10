const fs = require("fs");
const path = require("path");
const JiraClient = require("jira-client");
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

async function createJiraIssue(testName, errorDetails, artifactFiles) {
  try {
    const allureUrl = process.env.ALLURE_REPORT_URL || "";

    // Build description
    let description = `h3. Failed Test\n*Test Name:* ${testName}\n\n*Error Details:*\n${errorDetails}`;
    if (allureUrl) {
      description += `\n\n*Allure Report:* [Open Report|${allureUrl}]`;
    }

    // Check if issue already exists
    const jql = `project = ${process.env.JIRA_PROJECT_KEY} AND summary ~ "[Automation Bug] ${testName}" ORDER BY created DESC`;
    const searchResult = await jira.searchJira(jql);

    if (searchResult.issues && searchResult.issues.length > 0) {
      const existingIssue = searchResult.issues[0];
      console.log(`🔄 Issue already exists: ${existingIssue.key}, checking status...`);

      const status = existingIssue.fields.status.name.toLowerCase();

      // Handle Done/Closed status
      if (["done", "closed"].includes(status)) {
        const transitions = await jira.listTransitions(existingIssue.key);
        const reopenTransition = transitions.transitions.find((t) =>
          ["reopen", "open"].some((kw) => t.name.toLowerCase().includes(kw))
        );
        if (reopenTransition) {
          await jira.transitionIssue(existingIssue.key, {
            transition: { id: reopenTransition.id },
          });
          console.log(`🔓 Reopened issue ${existingIssue.key}`);
        } else {
          console.log(
            `⚠️ No valid reopen transition found for ${existingIssue.key}. Available: ${transitions.transitions
              .map((t) => t.name)
              .join(", ")}`
          );
        }
      }

      // Add comment with details
      await jira.addComment(
        existingIssue.key,
        `h3. Retest Failure\n*Test Name:* ${testName}\n\n*Error Details:*\n${errorDetails}\n\n${allureUrl ? `*Allure Report:* [Open Report|${allureUrl}]` : ""}`
      );

      // Attach all artifacts
      for (const file of artifactFiles) {
        if (fs.existsSync(file)) {
          await jira.addAttachmentOnIssue(existingIssue.key, fs.createReadStream(file));
          console.log(`📎 Attached to ${existingIssue.key}: ${path.basename(file)}`);
        }
      }

      return existingIssue.key;
    }

    // Create Jira issue if none exists
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
    console.log(`⏳ Creating/Updating Jira issue for: ${test.testName}`);
    await createJiraIssue(test.testName, test.errorDetails, test.artifactFiles);
  }
}

main();
