// page-logger.js
const fs = require('fs');
const path = require('path');

class PageLogger {
  constructor(page, testFolder) {
    this.page = page;
    this.testFolder = testFolder;
    this.logPath = path.join(testFolder, 'steps.log');

    // Reset log file at start of test
    fs.mkdirSync(this.testFolder, { recursive: true });
    fs.writeFileSync(this.logPath, '');
  }

  log(step) {
    fs.appendFileSync(this.logPath, step + '\n');
  }

  friendlyLabel(selector) {
    if (!selector) return 'element';
    selector = selector.replace(/^#/, '').replace(/\./g, ' ').replace(/-/g, ' ');
    return selector.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Wrapped Page Actions
  async goto(url, options) {
    this.log(`Navigate to "${url}"`);
    return this.page.goto(url, options);
  }

  async click(selector, options) {
    this.log(`Click ${this.friendlyLabel(selector)}`);
    return this.page.click(selector, options);
  }

  async fill(selector, value, options) {
    this.log(`Fill ${this.friendlyLabel(selector)} with "${value}"`);
    return this.page.fill(selector, value, options);
  }

  async press(selector, key, options) {
    this.log(`Press "${key}" in ${this.friendlyLabel(selector)}`);
    return this.page.press(selector, key, options);
  }

  async check(selector, options) {
    this.log(`Check ${this.friendlyLabel(selector)}`);
    return this.page.check(selector, options);
  }

  async uncheck(selector, options) {
    this.log(`Uncheck ${this.friendlyLabel(selector)}`);
    return this.page.uncheck(selector, options);
  }

  async selectOption(selector, value, options) {
    this.log(`Select option "${value}" in ${this.friendlyLabel(selector)}`);
    return this.page.selectOption(selector, value, options);
  }

  async setInputFiles(selector, files, options) {
    this.log(`Upload file "${files}" to ${this.friendlyLabel(selector)}`);
    return this.page.setInputFiles(selector, files, options);
  }

  // Access to raw Playwright page if needed
  get original() {
    return this.page;
  }
}

module.exports = PageLogger;
