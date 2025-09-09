// test-logger-fixture.js
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// ✅ You asked for this:
const resultsDir = path.join(__dirname, 'test-results');

// Root steps log (outside test-results so it survives cleanups)
const rootStepsPath = path.join(process.cwd(), 'steps.log');
try {
  if (fs.existsSync(rootStepsPath)) fs.unlinkSync(rootStepsPath);
} catch {}
fs.writeFileSync(rootStepsPath, '--- Test Execution Steps ---\n', 'utf8');

function appendRoot(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(rootStepsPath, `[${timestamp}] ${message}\n`, 'utf8');
}

function roleLabel(role) {
  const map = {
    button: 'button',
    textbox: 'textbox',
    link: 'link',
    checkbox: 'checkbox',
    heading: 'heading',
    combobox: 'dropdown',
    option: 'option',
    listbox: 'listbox',
    radio: 'radio button',
    switch: 'switch',
    img: 'image',
    menuitem: 'menu item',
  };
  return map[role] || role || 'element';
}

function nameToText(n) {
  if (n instanceof RegExp) return n.source;
  return n || '';
}

function humanLine(action, role, name, extra) {
  const label = roleLabel(role);
  const quoted = name ? `"${name}" ` : '';
  switch (action) {
    case 'click': return `Click ${quoted}${label}`.trim();
    case 'fill': return `Fill ${quoted}${label}${extra ? ` with "${extra}"` : ''}`.trim();
    case 'check': return `Check ${quoted}${label}`;
    case 'uncheck': return `Uncheck ${quoted}${label}`;
    case 'type': return `Type "${extra}" into ${quoted}${label}`;
    case 'selectOption':
      if (typeof extra === 'string') return `Select "${extra}" in ${quoted}${label}`;
      return `Select option in ${quoted}${label}`;
    case 'press': return `Press "${extra}" on ${quoted}${label}`;
    case 'hover': return `Hover over ${quoted}${label}`;
    default: return `${action} ${quoted}${label}`;
  }
}

function wrapLocatorActions(locator, role, name, perTestStream) {
  const log = (line) => {
    appendRoot(line);
    if (perTestStream) perTestStream.write(line + '\n');
  };

  const wrap = (method, action, valueIdx = 0) => {
    if (!locator[method]) return;
    const orig = locator[method].bind(locator);
    locator[method] = async (...args) => {
      let extra;
      if (args.length > valueIdx && args[valueIdx] !== undefined) {
        const v = args[valueIdx];
        if (typeof v === 'string') extra = v;
        else if (v && typeof v === 'object' && 'label' in v) extra = v.label;
        else if (v && typeof v === 'object' && 'value' in v) extra = v.value;
      }
      log(humanLine(action, role, name, extra));
      return orig(...args);
    };
  };

  wrap('click', 'click');
  wrap('fill', 'fill', 0);
  wrap('check', 'check');
  wrap('uncheck', 'uncheck');
  wrap('type', 'type', 0);
  wrap('press', 'press', 0);
  wrap('hover', 'hover');
  wrap('selectOption', 'selectOption', 0);
  return locator;
}

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
    // Collect steps for this test
    const perTestSteps = [];

    const perTestStream = {
      write: (line) => perTestSteps.push(line),
      end: () => {},
    };

    // Patch navigations
    const origGoto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const line = `Go to ${url}`;
      appendRoot(line);
      perTestStream.write(line + '\n');
      return origGoto(url, options);
    };

    // Patch raw selectors
    const origClick = page.click.bind(page);
    page.click = async (selector, options) => {
      const line = `Click ${selector}`;
      appendRoot(line);
      perTestStream.write(line + '\n');
      return origClick(selector, options);
    };

    const origFill = page.fill.bind(page);
    page.fill = async (selector, value, options) => {
      const line = `Fill ${selector} with "${value}"`;
      appendRoot(line);
      perTestStream.write(line + '\n');
      return origFill(selector, value, options);
    };

    const origType = page.type.bind(page);
    page.type = async (selector, text, options) => {
      const line = `Type "${text}" into ${selector}`;
      appendRoot(line);
      perTestStream.write(line + '\n');
      return origType(selector, text, options);
    };

    // Patch getByRole
    const origGetByRole = page.getByRole.bind(page);
    page.getByRole = (role, options) => {
      const name = nameToText(options?.name);
      const locator = origGetByRole(role, options);
      return wrapLocatorActions(locator, role, name, perTestStream);
    };

    await use(page);

    // ✅ Only create test folder if test failed
    if (testInfo.status !== 'passed') {
      const cleanTestName = testInfo.title.replace(/[^a-z0-9]/gi, '_');
      const testDir = path.join(resultsDir, cleanTestName);
      fs.mkdirSync(testDir, { recursive: true });

      // Write steps.log
      const stepsPath = path.join(testDir, 'steps.log');
      fs.writeFileSync(stepsPath, '--- Steps for this test ---\n' + perTestSteps.join('\n'), 'utf8');

      // Copy Playwright artifacts (screenshots, videos, traces)
      const srcDir = testInfo.outputDir;
      if (fs.existsSync(srcDir)) {
        fs.readdirSync(srcDir).forEach((file) => {
          const srcPath = path.join(srcDir, file);
          const destPath = path.join(testDir, file);
          fs.copyFileSync(srcPath, destPath);
        });
      }
    }

    perTestStream.end();
  },
});

module.exports = { test, expect: base.expect, resultsDir };
