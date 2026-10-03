import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('test-output', { recursive: true });

// Minimal offline map style so the MapLibre smoke checks don't depend on tile servers.
const MINIMAL_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e8ece6" } }],
};

// Optional in-sandbox Chromium (e.g. @sparticuz/chromium) when Playwright's own browser isn't installed.
let launchOptions = { headless: true, args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) {
  let extraArgs = ['--disable-gpu', '--single-process', '--no-zygote'];
  try { extraArgs = (await import('@sparticuz/chromium')).default.args; } catch {}
  launchOptions = { headless: true, executablePath: process.env.CHROMIUM_PATH, args: [...new Set([...extraArgs, '--no-sandbox'])] };
}
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch(launchOptions);
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  await context.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MINIMAL_STYLE) }));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Big decisions. Local impact.' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('.map-loading')).not.toBeVisible({ timeout: 20000 });
  await expect(page.locator('.map-unavailable')).not.toBeVisible();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); });
  await page.screenshot({ path: 'test-output/overview.png', fullPage: true, animations: 'disabled' });
  console.log('PASS: dashboard and real chamber image');

  await page.getByRole('button', { name: 'Enter council chambers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inside Council Chambers.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with the actual ordinance.' })).toBeVisible();
  await page.getByRole('button', { name: 'Read & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Hear the discussion in the room.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to impacts' }).click();
  await expect(page.getByRole('heading', { name: 'Follow the change into Cheyenne.' })).toBeVisible();
  await page.getByRole('button', { name: 'The owner-occupancy requirement', exact: false }).click();
  await expect(page.getByText('That’s right. The answer follows the original agenda and meeting record.')).toBeVisible();
  await page.getByRole('button', { name: 'Add my perspective' }).click();
  await page.getByRole('button', { name: 'I have questions', exact: true }).click();
  await page.getByLabel(/Your notes, questions, or reasoning/).fill('Which parking conditions apply to corner lots?');
  await page.getByRole('button', { name: 'Save my perspective', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to your notebook', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My civic notebook', exact: true }).click();
  await expect(page.getByText('Which parking conditions apply to corner lots?', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Which parking conditions apply to corner lots?', { exact: true })).toBeVisible();
  console.log('PASS: four-stage session, knowledge check, notebook reflection persistence');

  await page.getByRole('button', { name: /Source library/ }).first().click();
  await page.getByLabel('Search all repository source files').fill('Jan 26, 2026');
  await expect(page.locator('.source-file-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.source-save-button').first().click();
  await expect(page.locator('.source-save-button.saved').first()).toBeVisible();
  const agenda = page.locator('.source-card-main').filter({ hasText: 'Agenda.pdf' }).first();
  await agenda.click();
  await expect(page.locator('.document-modal')).toBeVisible();
  await expect(page.frameLocator('.document-frame').getByText('JANUARY 26, 2026', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.document-modal')).not.toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.locator('.featured-sources button').filter({ hasText: 'Official meeting minutes' }).click();
  await expect(page.locator('.document-modal')).toBeVisible();
  await expect(page.locator('.document-frame')).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Source library/ }).first().click();
  await page.getByLabel('Choose GitHub archive').selectOption('The-Real-Windy-City-');
  await page.getByLabel('Search all repository source files').fill('2026-01-26');
  await expect(page.locator('.source-file-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.source-card-main').first().click();
  await expect(page.locator('.document-text')).toContainText('x6Veeticz3Q', { timeout: 20000 });
  await page.keyboard.press('Escape');
  console.log('PASS: source search, bookmarks, safely rendered real agenda, official minutes, original transcript');

  await page.getByRole('button', { name: 'City impact map', exact: true }).click();
  await page.getByRole('button', { name: 'East Cheyenne annexation', exact: true }).click();
  await expect(page.locator('.impact-detail-panel')).toContainText('unanimous approval on second reading');
  await page.getByRole('button', { name: 'Before the proposal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Before this proposal' })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: 'test-output/impact.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Ordinance tracker', exact: true }).click();
  await page.getByLabel('Filter by reading').selectOption('3rd reading');
  await expect(page.locator('.tracker-row')).toHaveCount(1);
  await expect(page.locator('.tracker-row')).toContainText('Postponed to Feb 9');
  console.log('PASS: interactive map, before/if-enacted comparison, verified ordinance statuses');

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'January 26, 2026', exact: true }).click();
  await expect(page.locator('.meeting-picker-list button')).toHaveCount(33);
  await page.locator('.meeting-picker-list button').first().click();
  await expect(page.locator('.archive-session-reader')).toBeVisible();
  await page.getByRole('button', { name: 'Follow the discussion', exact: true }).click();
  await expect(page.locator('.archive-session-reader')).toBeVisible();
  console.log('PASS: real archived session switching');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, isMobile: true, deviceScaleFactor: 1 });
  await mobile.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MINIMAL_STYLE) }));
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await mp.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(mp.getByRole('heading', { name: 'Big decisions. Local impact.' })).toBeVisible();
  await mp.screenshot({ path: 'test-output/mobile.png', animations: 'disabled' });
  let overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on the mobile overview');
  await mp.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await mp.getByRole('button', { name: 'City impact map', exact: true }).click();
  await expect(mp.getByRole('heading', { name: 'From ordinance to everyday life.' })).toBeVisible();
  overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on the mobile map');
  console.log('PASS: mobile navigation and responsive layouts');
  if (errors.length) throw new Error(`Browser exceptions: ${errors.join('; ')}`);
  console.log('ALL CIVIC BROWSER CHECKS PASSED');
} finally {
  await browser.close();
}
