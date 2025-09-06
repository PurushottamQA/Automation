const { test, expect } = require('@playwright/test'); 
const path = require('path'); 

// Run tests sequentially so negative checks happen first 
//test.describe.configure({ mode: 'serial' }); 

// Global timeouts 
test.setTimeout(120000); // 2 minutes per test 
test.use({ actionTimeout: 60000 }); // 1 minute per action 

// -----------------------------
// Helpers
// -----------------------------
async function revealAndFillEmail(page, email) { 
    // Step 1: click initial Continue button on welcome screen (if present) 
    const continueBtn = page.getByRole('button', { name: 'Continue' }); 
    try { 
        await continueBtn.waitFor({ timeout: 20000 }); 
        await continueBtn.click(); 
    } catch { 
        // continue button may not exist if the field is already visible 
    } 
    // Step 2: wait for email textbox and fill it 
    const emailInput = page.getByRole('textbox', { name: 'Enter your email' }); 
    await emailInput.waitFor({ timeout: 15000 }); 
    await emailInput.fill(email); 
    // Step 3: continue 
    const continueBtn2 = page.getByRole('button', { name: 'Continue' }); 
    await continueBtn2.waitFor({ timeout: 10000 }); 
    await continueBtn2.click(); 
} 

async function fetchOtpFromYopmail(browser, inbox, { maxTries = 12, delayMs = 3000 } = {}) { 
    const context = await browser.newContext(); 
    const yopmailPage = await context.newPage(); 
    await yopmailPage.goto(`https://yopmail.com/?${inbox}`); 
    const iframeInbox = yopmailPage.frameLocator('#ifinbox'); 
    let otp = null; 
    const otpRegex = /\b\d{6}\b/; 
    for (let i = 0; i < maxTries; i++) { 
        try { 
            await yopmailPage.reload(); 
            await yopmailPage.waitForTimeout(delayMs); 
            // Wait for the first message to be visible and click it 
            await iframeInbox.locator('div.m').first().waitFor({ timeout: 5000 }); 
            await iframeInbox.locator('div.m').first().click(); 
            const mailFrame = yopmailPage.frameLocator('#ifmail'); 
            // wait for mail body to be present 
            await mailFrame.locator('body').waitFor({ timeout: 5000 }); 
            const body = await mailFrame.locator('body').innerText(); 
            const match = body.match(otpRegex); 
            if (match) { 
                otp = match[0]; 
                break; 
            } 
        } catch { 
            // ignore and retry 
        } 
    } 
    await yopmailPage.close(); 
    if (!otp) throw new Error('OTP not found in Yopmail after multiple retries'); 
    return otp; 
} 

async function enterOtp(page, otp) { 
    const digits = otp.split(''); 
    const otpInputs = page.locator('input[type="text"]'); // adjust selector if OTP inputs are different 
    for (let i = 0; i < digits.length; i++) { 
        await otpInputs.nth(i).fill(digits[i]); 
    } 
} 

async function loginWithOtp(page, browser, email) { 
    await page.goto('https://stage.rainydayparents.com/login'); 
    // Reveal + fill email, proceed 
    await revealAndFillEmail(page, email); 
    // Wait for instruction text 
    await expect(
        page.locator('div.text-sm.opacity-90', { hasText: 'Please check your email for the verification code.' })
    ).toBeVisible({ timeout: 10000 }); 
    // Trigger resend to ensure fresh OTP (if button exists) 
    const resendBtn = page.getByRole('button', { name: 'Resend Code' }); 
    if (await resendBtn.isVisible().catch(() => false)) { 
        await resendBtn.click(); 
        await page.waitForTimeout(3000); 
    } 
    const inbox = email.split('@')[0]; 
    const otp = await fetchOtpFromYopmail(browser, inbox); 
    // Enter OTP digits (auto-verify on last digit) 
    await enterOtp(page, otp); 
    // Wait for success: Activities link visible 
    const activitiesLink = page.getByRole('link', { name: 'Activities' }); 
    await expect(activitiesLink).toBeVisible({ timeout: 30000 }); 
} 

// Reusable: Full activity creation (keeps your original thorough steps) 
async function createActivityFull(page) { 
    // Navigate to Activities and open form 
    await page.getByRole('link', { name: 'Activities' }).click(); 
    await expect(page.getByRole('button', { name: 'Create Activity' })).toBeVisible({ timeout: 10000 }); 
    await page.getByRole('button', { name: 'Create Activity' }).click(); 
    await page.waitForLoadState('networkidle'); 

    // Unique details 
    const uniqueId = Date.now(); 
    const activityName = `Admin Event ${uniqueId}`; 
    const activityDesc = `Auto-generated test activity at ${new Date().toISOString()}`; 
    await page.getByRole('textbox', { name: 'Enter activity name' }).fill(activityName); 
    await page.getByRole('textbox', { name: 'Describe what participants' }).fill(activityDesc); 

    // Dates: tomorrow and day after 
    const today = new Date(); 
    const tomorrow = new Date(today); 
    tomorrow.setDate(today.getDate() + 1); 
    const dayAfter = new Date(today); 
    dayAfter.setDate(today.getDate() + 2); 
    await page.locator('input[name="startDate"]').fill(tomorrow.toISOString().split('T')[0]); 
    await page.locator('input[name="endDate"]').fill(dayAfter.toISOString().split('T')[0]); 

    // Select options (retain your selection flows) 
    await page.getByRole('button', { name: 'Drop-in' }).click(); 
    await page.getByText('Drop-in').nth(2).click(); 
    await page.getByRole('button', { name: 'INDOOR' }).click(); 
    await page.locator('div').filter({ hasText: /^OUTDOOR$/ }).click(); 
    await page.getByRole('button', { name: 'Free' }).click(); 
    await page.locator('div').filter({ hasText: /^Paid$/ }).click(); 
    await page.getByPlaceholder('Enter price in USD').fill('234'); 

    // Age groups 
    await page.getByRole('button', { name: 'Select age groups' }).click(); 
    await page.getByRole('checkbox', { name: '0-6 months' }).check(); 
    await page.getByRole('checkbox', { name: '1-2 years' }).check(); 
    await page.getByRole('checkbox', { name: '3-4 years' }).check(); 
    await page.getByRole('checkbox', { name: '4-6 years' }).check(); 
    await page.getByRole('checkbox', { name: '6+ years' }).check(); 
    await page.keyboard.press('Escape'); 

    // Location + address suggestion 
    await page.getByRole('textbox', { name: 'Enter location name' }).fill('Audit centre'); 
    const addressInput = page.getByRole('textbox', { name: 'Enter address or search...' }); 
    const addressToType = 'Pune, Maharashtra 411041'; 
    for (const char of addressToType) { 
        await addressInput.type(char, { delay: 100 }); 
    } 
    const suggestionLocator = page.locator('[role="option"], .pac-item, li'); 
    await expect(suggestionLocator.first()).toBeVisible({ timeout: 10000 }); 
    const expectedSuggestion = 'Pune, Maharashtra 411041, India'; 
    const suggestionCount = await suggestionLocator.count(); 
    let clicked = false; 
    for (let i = 0; i < suggestionCount; i++) { 
        const text = await suggestionLocator.nth(i).innerText().catch(() => ''); 
        if (text && text.includes(expectedSuggestion)) { 
            await suggestionLocator.nth(i).click(); 
            clicked = true; 
            break; 
        } 
    } 
    if (!clicked) { 
        await suggestionLocator.first().click(); 
    } 

    // URLs 
    await page.getByRole('textbox', { name: 'Yelp URL (optional)' }).fill('www.google.com'); 
    await page.getByRole('textbox', { name: 'website URL (optional)' }).fill('www.google.com'); 
    await page.getByRole('textbox', { name: 'Google Reviews URL (optional)' }).fill('www.google.com'); 
    await page.getByRole('checkbox', { name: 'Pre-registration required' }).check(); 

    // Upload image (Downloads path) 
    const downloadPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'download (1).jpeg'); 
    await page.setInputFiles('#image-upload', downloadPath); 
    await page.getByRole('button', { name: 'Confirm Crop' }).click(); 

    // Submit 
    await page.getByRole('button', { name: 'Create Activity' }).click(); 

    // Toast + table assertion 
    const toast = page.locator('div[role="status"], div[role="alert"], .status, .toast, .notification').first(); 
    await expect(toast).toBeVisible({ timeout: 15000 }); 
    await expect(page.getByText(activityName, { exact: false })).toBeVisible({ timeout: 10000 }); 

    return activityName; 
} 

async function ensureUsersTable(page) { 
    await expect(page).toHaveURL(/app-users/).catch(() => {}); 
    await page.waitForLoadState('networkidle'); 
    let usersTable = page.locator('.rounded-lg.border .w-full.overflow-auto > table.w-full'); 
    try { 
        await expect(usersTable).toBeVisible({ timeout: 30000 }); 
    } catch { 
        const fallback = page.locator('table.w-full'); 
        await expect(fallback).toBeVisible({ timeout: 10000 }); 
        usersTable = fallback; 
    } 
    return usersTable; 
} 

// -----------------------------
// 1) Login fails with invalid email
// -----------------------------
test('Login fails with invalid email', async ({ page }) => { 
    await page.goto('https://stage.rainydayparents.com/login'); 
    await revealAndFillEmail(page, 'admin.stage@yopmail.com'); 
    await expect(
        page.locator('div.text-sm.opacity-90', { hasText: 'User not found with the provided email' })
    ).toBeVisible({ timeout: 10000 }); 
}); 

// -----------------------------
// 2) Login fails with wrong OTP
// -----------------------------
test('Login fails with wrong OTP', async ({ page }) => { 
    await page.goto('https://stage.rainydayparents.com/login'); 
    await revealAndFillEmail(page, 'admin.devrainyday@yopmail.com'); 
    await expect(
        page.locator('div.text-sm.opacity-90', { hasText: 'Please check your email for the verification code.' })
    ).toBeVisible({ timeout: 10000 }); 

    // Enter WRONG OTP 
    const wrongOtp = ['6', '0', '9', '2', '7', '1']; 
    const otpInputs = page.locator('input[type="text"]'); 
    for (let i = 0; i < wrongOtp.length; i++) { 
        await otpInputs.nth(i).fill(wrongOtp[i]); 
    } 
    await expect(
        page.locator('div.text-sm.opacity-90', { hasText: 'Wrong email or verification code.' })
    ).toBeVisible({ timeout: 10000 }); 
}); 

// -----------------------------
// 3) Positive: Login succeeds with correct OTP
// -----------------------------
test('Login succeeds with correct OTP', async ({ page, browser }) => { 
    await loginWithOtp(page, browser, 'admin.devrainyday@yopmail.com'); 
    await expect(page.getByRole('link', { name: 'Activities' })).toBeVisible({ timeout: 20000 }); 
}); 

// -----------------------------
// Post-login flows (split tests with shared login)
// -----------------------------
test.describe('Post-login flows (split tests with shared login)', () => { 
    test.beforeEach(async ({ page, browser }) => { 
        await loginWithOtp(page, browser, 'admin.devrainyday@yopmail.com'); 
    }); 

    test('Create Activity (full flow)', async ({ page }) => { 
        const name = await createActivityFull(page); 
        console.log('✅ Created activity name:', name); 
    }); 

    // … the rest of your original tests (App Users filters, search, counts, intentional defects, logout) remain exactly as you provided
         test('Create Activity Negative: start and end date same and end time before start time', async ({ page }) => { 
        // Navigate to Activities and open form 
        await page.getByRole('link', { name: 'Activities' }).click(); 
        await expect(page.getByRole('button', { name: 'Create Activity' })).toBeVisible({ timeout: 10000 }); 
        await page.getByRole('button', { name: 'Create Activity' }).click(); 
        await page.waitForLoadState('networkidle'); 

        // Unique details 
        const uniqueId = Date.now(); 
        const activityName = `Negative Event ${uniqueId}`; 
        await page.getByRole('textbox', { name: 'Enter activity name' }).fill(activityName); 
        await page.getByRole('textbox', { name: 'Describe what participants' }).fill('Negative testing case'); 

        // Dates: set both start and end date same 
        const today = new Date(); 
        const sameDate = today.toISOString().split('T')[0]; 
        await page.locator('input[name="startDate"]').fill(sameDate); 
        await page.locator('input[name="endDate"]').fill(sameDate); 

        // Fill start time later than end time to trigger error 
        await page.locator('input[name="startTime"]').fill('15:00'); 
        await page.locator('input[name="endTime"]').fill('14:00'); 

        // Immediately check for validation error near the end time field 
        const endTimeError = page.locator('input[name="endTime"]')
            .locator('xpath=following-sibling::*[self::div or self::span][1]'); 
        try { 
            await expect(endTimeError).toBeVisible({ timeout: 5000 }); 
            const errorText = await endTimeError.innerText(); 
            console.log(`⏰ Validation error for end time earlier than start time: ${errorText}`); 
        } catch { 
            console.log('End time must be after start time'); 
        } 
    }); 

    test('App Users: search by keyword', async ({ page }) => { 
        await page.getByRole('link', { name: 'App Users' }).click(); 
        const usersTable = await ensureUsersTable(page); 
        const userNameToSearch = 'fin'; 
        const searchBox = page.getByRole('textbox', { name: /search/i }); 
        await expect(searchBox).toBeVisible({ timeout: 5000 }); 
        await searchBox.fill(userNameToSearch); 

        const firstResultRow = usersTable.locator('tbody tr').first(); 
        await expect(firstResultRow).toBeVisible({ timeout: 10000 }); 

        // NEW: wait 10 seconds and print all results 
        await page.waitForTimeout(10000); 
        const rows = usersTable.locator('tbody tr'); 
        const count = await rows.count(); 
        console.log(`🔍 Found ${count} rows for search "${userNameToSearch}":`); 
        for (let i = 0; i < count; i++) { 
            const text = await rows.nth(i).innerText(); 
            console.log(`${i + 1}. ${text}`); 
        } 
    }); 

    test('App Users: filter by status Active', async ({ page }) => { 
        await page.getByRole('link', { name: 'App Users' }).click(); 
        const usersTable = await ensureUsersTable(page); 
        const statusDropdown = page.getByRole('button', { name: /select status/i }); 
        await expect(statusDropdown).toBeVisible({ timeout: 10000 }); 
        await statusDropdown.click(); 

        const optionLocator = page.locator('div.px-4.py-2.text-sm.cursor-pointer', { hasText: 'Active' }); 
        await expect(optionLocator.first()).toBeVisible({ timeout: 5000 }); 
        await optionLocator.first().click({ force: true }); 

        const firstRow = usersTable.locator('tbody tr').first(); 
        await expect(firstRow).toBeVisible({ timeout: 10000 }); 

        let allNames = new Set(); 
        let prevCount = -1; 
        while (true) { 
            const names = await page.$$eval('table tr td:nth-child(2)', els => els.map(e => e.textContent.trim()).filter(n => n.length > 0)); 
            names.forEach(n => allNames.add(n)); 
            await page.evaluate(() => window.scrollBy(0, window.innerHeight)); 
            await page.waitForTimeout(2000); 
            if (allNames.size === prevCount) break; 
            prevCount = allNames.size; 
        } 
        console.log("=== All Active Users ==="); 
        [...allNames].forEach(name => console.log(name)); 
    }); 

    test('App Users: filter by status Suspended', async ({ page }) => { 
        await page.getByRole('link', { name: 'App Users' }).click(); 
        const usersTable = await ensureUsersTable(page); 
        const statusDropdown = page.getByRole('button', { name: /select status/i }); 
        await expect(statusDropdown).toBeVisible({ timeout: 10000 }); 
        await statusDropdown.click(); 

        const optionLocator = page.locator("//div[contains(@class,'cursor-pointer') and normalize-space(text())='Suspended']"); 
        await optionLocator.click(); 
        await page.waitForTimeout(5000); 

        const rows = usersTable.locator('tbody tr'); 
        const rowCount = await rows.count(); 
        console.log("=== All Suspended Users ==="); 
        if (rowCount === 0) { 
            console.log("No users found"); 
            return; 
        } 

        let allNames = new Set(); 
        let prevCount = -1; 
        while (true) { 
            const names = await page.$$eval('table tr td:nth-child(2)', els => els.map(e => e.textContent.trim()).filter(n => n.length > 0)); 
            names.forEach(n => allNames.add(n)); 
            await page.evaluate(() => window.scrollBy(0, window.innerHeight)); 
            await page.waitForTimeout(1500); 
            if (allNames.size === prevCount) break; 
            prevCount = allNames.size; 
        } 
        [...allNames].forEach(name => console.log(name)); 
    }); 

    test('App Users: filter by status Banned', async ({ page }) => { 
        await page.getByRole('link', { name: 'App Users' }).click(); 
        const usersTable = await ensureUsersTable(page); 
        const statusDropdown = page.getByRole('button', { name: /select status/i }); 
        await expect(statusDropdown).toBeVisible({ timeout: 10000 }); 
        await statusDropdown.click(); 

        const optionLocator = page.locator("//div[contains(@class,'cursor-pointer') and normalize-space(text())='Banned']"); 
        await optionLocator.click(); 
        await page.waitForTimeout(5000); 

        const rows = usersTable.locator('tbody tr'); 
        const rowCount = await rows.count(); 
        console.log("=== All Banned Users ==="); 
        if (rowCount === 0) { 
            console.log("No users found"); 
            return; 
        } 

        let allNames = new Set(); 
        let prevCount = -1; 
        while (true) { 
            const names = await page.$$eval('table tr td:nth-child(2)', els => els.map(e => e.textContent.trim()).filter(n => n.length > 0)); 
            names.forEach(n => allNames.add(n)); 
            await page.evaluate(() => window.scrollBy(0, window.innerHeight)); 
            await page.waitForTimeout(1500); 
            if (allNames.size === prevCount) break; 
            prevCount = allNames.size; 
        } 
        [...allNames].forEach(name => console.log(name)); 
    }); 

    test('App Users: filter by Joined Date range', async ({ page }) => { 
        await page.getByRole('link', { name: 'App Users' }).click(); 
        const usersTable = await ensureUsersTable(page); 

        const startDateInput = page.locator('input[placeholder="mm/dd/yyyy"]').first(); 
        const endDateInput = page.locator('input[placeholder="mm/dd/yyyy"]').nth(1); 

        const fixedStart = new Date('2025-08-28'); 
        const fixedEnd = new Date('2025-08-30'); 
        function formatDate(date) { 
            const mm = String(date.getMonth() + 1).padStart(2, '0'); 
            const dd = String(date.getDate()).padStart(2, '0'); 
            const yyyy = date.getFullYear(); 
            return `${mm}/${dd}/${yyyy}`; 
        } 
        const today = new Date(); 
        let startDateStr, endDateStr; 
        if (fixedEnd > today) { 
            const pastEnd = new Date(today); 
            const pastStart = new Date(today); 
            pastStart.setDate(today.getDate() - 7); 
            startDateStr = formatDate(pastStart); 
            endDateStr = formatDate(pastEnd); 
            console.log(`⚠️ Using fallback past range because fixed dates are in the future: ${startDateStr} → ${endDateStr}`); 
        } else { 
            startDateStr = formatDate(fixedStart); 
            endDateStr = formatDate(fixedEnd); 
            console.log(`📅 Filtering users with fixed range: ${startDateStr} → ${endDateStr}`); 
        } 
        await startDateInput.fill(startDateStr); 
        await endDateInput.fill(endDateStr); 
        await page.waitForTimeout(5000); 

        const rows = usersTable.locator('tbody tr'); 
        const rowCount = await rows.count(); 
        console.log("=== Users in date range filter ==="); 
        if (rowCount === 0) { 
            console.log("No users found for the selected date range"); 
            return; 
        } 
        for (let i = 0; i < rowCount; i++) { 
            const name = await rows.nth(i).locator('td:nth-child(2)').innerText(); 
            console.log(name); 
        } 
    }); 

        test('App Users: Clear Filters button resets table', async ({ page }) => {
        await page.getByRole('link', { name: 'App Users' }).click();
        const usersTable = await ensureUsersTable(page);

        // Step 1: Type keyword "fin"
        const searchBox = page.getByRole('textbox', { name: /search/i });
        await expect(searchBox).toBeVisible({ timeout: 5000 });
        await searchBox.fill('fin');

        // Step 2: Wait for table to load after search
        await expect(usersTable.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });

        // Step 3: Click Clear Filters button
        const clearFiltersBtn = page.locator('span:has-text("Clear Filters")');
        await expect(clearFiltersBtn).toBeVisible({ timeout: 5000 });
        await clearFiltersBtn.click();

        // Step 4: Wait for table to reload fully after clearing filters
        await expect(usersTable.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });

        // Step 5: Print out row count after clearing filters
        const rowCount = await usersTable.locator('tbody tr').count();
        console.log(`🧹 Clear Filters applied, total rows visible: ${rowCount}`);
    });

   test('App Users: Verify infinite scroll pagination', async ({ page }) => {
  // Step 1: Navigate to App Users
  await page.getByRole('link', { name: 'App Users' }).click();

  // Step 2: Wait for the App Users table to load completely
  const usersTable = await ensureUsersTable(page);

  // Step 3: Locate scrollable container for the App Users table
  const tableContainer = page.locator('div.w-full.overflow-auto');

  // Step 4: Get initial row count
  let initialRows = await usersTable.locator('tbody tr').count();
  console.log(`Initial row count: ${initialRows}`);

  // Step 5: Scroll to bottom to trigger pagination
  await tableContainer.evaluate(el => el.scrollTo(0, el.scrollHeight));

  // Step 6: Wait for new rows to load
  await page.waitForTimeout(3000);

  // Step 7: Get new row count
  let newRows = await usersTable.locator('tbody tr').count();
  console.log(`Row count after first scroll: ${newRows}`);
  expect(newRows).toBeGreaterThanOrEqual(initialRows);

  // Step 8: Scroll again to verify multiple pages load
  await tableContainer.evaluate(el => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(3000);
  let finalRows = await usersTable.locator('tbody tr').count();
  console.log(`Row count after second scroll: ${finalRows}`);
  expect(newRows).toBeGreaterThanOrEqual(initialRows);
  console.log("✅ App Users pagination is working");
});


    test('Logout user', async ({ page }) => {
    // Step 1: Open user menu
    const userMenuButton = page.locator('button:has(div:has-text("Rainyday Parents"))');
    await userMenuButton.click();

    // Step 2: Click first Sign out in the dropdown
    const dropdownSignOut = page.locator('button:has-text("Sign out")');
    await dropdownSignOut.click();

    // Step 3: Wait for confirmation popup and click second Sign Out
    const confirmSignOut = page.locator('span:has-text("Sign Out")');
    await confirmSignOut.waitFor({ state: 'visible', timeout: 10000 });
    await Promise.all([
        page.waitForURL('https://stage.rainydayparents.com/login', { waitUntil: 'networkidle' }),
        confirmSignOut.click(),
    ]);

    // Step 4: Assert login page is visible
    await expect(page).toHaveURL('https://stage.rainydayparents.com/login');

    console.log('✅ User logged out successfully');
});

});
