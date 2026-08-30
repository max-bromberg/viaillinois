// server/services/tableauSession.js
//
// Downloads the full two-week facilities CSV from the UIUC Tableau dashboard
// by driving a headless Chromium session, setting the Event Date filter to
// "(All)", and capturing the export via the Tableau download popup.

import { chromium } from 'playwright';
import { readFile }  from 'fs/promises';

const TABLEAU_URL = 'https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents';
const NAV_TIMEOUT  = 90_000; // ms, Tableau is slow to render
const PAGE_TIMEOUT = 60_000; // ms, for individual element interactions

// Fire a full bubbling MouseEvent directly on an element, bypassing any
// CSS overlay (Tableau's tab-glass) that intercepts pointer events.
async function jsClick(locator) {
  await locator.evaluate(el => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
  });
}

/**
 * Launch a headless Chromium session, set the Tableau Event Date filter to
 * "(All)", download the full CSV via the export popup, and return the CSV text.
 *
 * @returns {Promise<string>} Raw CSV text
 */
export async function downloadTableauCsv() {
  const browser = await chromium.launch({ headless: true });
  try {
    // acceptDownloads: true is required. Without it Chromium silently blocks downloads.
    const context = await browser.newContext({ acceptDownloads: true });

    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT);

    // Step 1: Navigate and wait for the viz to load
    console.log('[tableau] navigating to dashboard...');
    await page.goto(TABLEAU_URL, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    console.log('[tableau] dashboard loaded');

    // Step 2: Open the Event Date filter dropdown
    console.log('[tableau] opening Event Date filter...');
    await jsClick(page.getByLabel('Filter Event Date Inclusive'));
    await page.waitForTimeout(1000);

    // Step 3: Select "(All)" via keyboard, since the element has tabindex="0" and
    // Tableau's ARIA checkbox implementation handles Space to toggle selection.
    console.log('[tableau] selecting (All)...');
    const allItem = page.locator('div.all-item[role="checkbox"]');
    await allItem.waitFor({ state: 'visible' });
    await allItem.press('Space');
    await page.waitForTimeout(3000);
    console.log('[tableau] data refreshed');

    // Step 4: Open the Download sub-menu
    console.log('[tableau] clicking Download toolbar button...');
    await jsClick(page.getByRole('button', { name: 'Download' }));
    await page.waitForTimeout(1000);

    // Step 5: Click "Data", which opens a popup window
    console.log('[tableau] clicking Data menu item...');
    const dataItem = page.getByRole('menuitem', { name: 'Data' });
    await dataItem.waitFor({ state: 'visible' });
    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: PAGE_TIMEOUT }),
      jsClick(dataItem),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    console.log('[tableau] popup opened');

    // Step 6: Select "Full Data" tab (Tableau labels it "Full Data", not "Full Data Table")
    await popup.getByRole('tab', { name: 'Full Data' }).click();
    await popup.waitForTimeout(1000);

    // Step 7: Click Download in the popup.
    // The popup communicates back to the main page, which initiates the HTTP download,
    // so we listen for the download event on `page`, not `popup`.
    console.log('[tableau] triggering download...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: PAGE_TIMEOUT }),
      popup.getByRole('button', { name: 'Download' }).click({ force: true }),
    ]);
    console.log('[tableau] download event fired:', download.suggestedFilename());

    const downloadPath = await download.path();
    const csv = await readFile(downloadPath, 'utf8');
    console.log(`[tableau] download complete (${csv.length} bytes)`);

    await popup.close().catch(() => {});
    return csv;
  } finally {
    await browser.close();
  }
}

export default { downloadTableauCsv };
