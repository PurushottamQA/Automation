const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const glob = require('glob');
require('dotenv').config();

const ALLURE_RESULTS_DIR = path.join(__dirname, 'allure-results');

// Jira config from .env
const jiraUrl = process.env.JIRA_URL;
const jiraEmail = process.env.JIRA_EMAIL;
const jiraToken = process.env.JIRA_TOKEN;
const jiraProjectKey = process.env.JIRA_PROJECT_KEY;
const allureUrl = process.env.ALLURE_URL || '';

const authHeader = {
  Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`,
  Accept: 'application/json'
};

// --- Search for existing Jira issue ---
async function findExistingIssue(summary) {
  const jql = `project=${jiraProjectKey} AND summary~"${summary}" ORDER BY created DESC`;
  try {
    const res = await axios.get(
      `${jiraUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}`,
      { headers: authHeader }
    );
    return res.data.issues.length > 0 ? res.data.issues[0] : null;
  } catch (err) {
    console.error('❌ Error searching Jira:', err.response?.data || err.message);
    return null;
  }
}

// --- Add comment to existing issue ---
async function addComment(issueKey, message) {
  const body = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ text: message, type: 'text' }] }
    ]
  };

  try {
    await axios.post(
      `${jiraUrl}/rest/api/3/issue/${issueKey}/comment`,
      { body },
      { headers: authHeader }
    );
    console.log(`💬 Comment added to ${issueKey}`);
  } catch (err) {
    console.error(`❌ Error adding comment to ${issueKey}:`, err.response?.data || err.message);
  }
}

// --- Attach files to Jira issue ---
async function attachFiles(issueKey, attachments) {
  for (const file of attachments) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️ Attachment not found: ${file}`);
      continue;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(file));

    try {
      await axios.post(
        `${jiraUrl}/rest/api/3/issue/${issueKey}/attachments`,
        form,
        {
          headers: {
            ...authHeader,
            ...form.getHeaders(),
            'X-Atlassian-Token': 'no-check'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      console.log(`📎 Attached: ${path.basename(file)} to ${issueKey}`);
    } catch (err) {
      console.error(`❌ Error attaching ${path.basename(file)}:`, err.response?.data || err.message);
    }
  }
}

// --- Create or update Jira issue ---
async function createOrUpdateJiraIssue(test, attachments) {
  const summary = `[Automation Bug] ${test.name}`;

  const description = {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            text: `Automated test failed.\n\nError: ${test.statusDetails?.message || 'Unknown error'}\n\nUUID: ${test.uuid}\n\n🔗 Allure Report: ${allureUrl}`,
            type: 'text'
          }
        ]
      }
    ]
  };

  const existingIssue = await findExistingIssue(test.name);

  if (existingIssue) {
    console.log(`⚠️ Jira issue already exists: ${existingIssue.key}`);
    await addComment(existingIssue.key, `Test failed again.\n\n🔗 See Allure report: ${allureUrl}`);
    await attachFiles(existingIssue.key, attachments);
    return existingIssue.key;
  }

  const issueData = {
    fields: {
      project: { key: jiraProjectKey },
      summary,
      description,
      issuetype: { name: 'Bug' },
      labels: ['automation', 'playwright']
    }
  };

  try {
    const issue = await axios.post(`${jiraUrl}/rest/api/3/issue`, issueData, { headers: authHeader });
    const issueKey = issue.data.key;
    console.log(`✅ Created Jira issue: ${issueKey}`);
    await attachFiles(issueKey, attachments);
    return issueKey;
  } catch (err) {
    console.error('❌ Error creating Jira issue:', err.response?.data || err.message);
  }
}

// --- Collect failed tests from allure-results ---
function getFailedTests() {
  const failedTests = [];
  const files = fs.readdirSync(ALLURE_RESULTS_DIR)
                  .filter(f => f.endsWith('-result.json')); // only individual test JSON files

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(ALLURE_RESULTS_DIR, file), 'utf-8'));
    if (data.status === 'failed') {
      failedTests.push(data);
    }
  }

  return failedTests;
}

// --- Collect artifacts recursively in allure-results ---
function collectAttachments(test) {
  if (!test.uuid) return [];

  const pattern = path.join(ALLURE_RESULTS_DIR, `**/*${test.uuid}*.*`);
  const files = glob.sync(pattern, { nodir: true });

  if (files.length === 0) {
    console.warn(`⚠️ No artifacts found for test UUID: ${test.uuid}`);
  }

  return files;
}

// --- Main runner ---
async function run() {
  console.log("🔍 Reading allure-results from:", ALLURE_RESULTS_DIR);
  console.log("🔗 Using Allure Report URL:", allureUrl);

  const failedTests = getFailedTests();

  if (failedTests.length === 0) {
    console.log("✅ No failed tests found in allure-results.");
    return;
  }

  for (const test of failedTests) {
    const attachments = collectAttachments(test);
    console.log('📁 Artifacts to attach:', attachments);
    await createOrUpdateJiraIssue(test, attachments);
  }
}

run();
