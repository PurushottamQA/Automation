import { test as baseTest } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const test = baseTest.extend({
  logTestId: async ({}, use, testInfo) => {
    const stepsLog = path.join(testInfo.outputDir, 'steps.log');
    fs.appendFileSync(stepsLog, `Test ID: ${testInfo.testId}\n`);
    await use();
  },
});
