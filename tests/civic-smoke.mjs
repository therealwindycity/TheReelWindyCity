import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

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
function capturePageError(error) {
  // @sparticuz/chromium's required single-process mode can emit harmless MapLibre worker-serialization noise.
  if (process.env.CHROMIUM_PATH && /can't deserialize unregistered class StructArrayLayout/i.test(error.message)) return;
  errors.push(error.message);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  await context.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MINIMAL_STYLE) }));
  const page = await context.newPage();
  page.on('pageerror', capturePageError);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const canonicalUrl = 'https://therealwindycity.github.io/TheReelWindyCity/';
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /real public meetings/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow/);
  await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute('content', /max-image-preview:large/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonicalUrl);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  if (!structuredData?.includes('"@type":"WebSite"') || !structuredData.includes(canonicalUrl)) {
    throw new Error('Expected truthful WebSite JSON-LD with the canonical URL');
  }
  const publicBase = `${BASE_URL.replace(/\/+$/, '')}/`;
  const sitemapResponse = await context.request.get(new URL('sitemap.xml', publicBase).toString());
  const sitemapText = await sitemapResponse.text();
  const meetingIndex = JSON.parse(await readFile('public/data/meetings.json', 'utf8'));
  const sitemapLocations = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (sitemapResponse.status() !== 200 || sitemapLocations.length !== meetingIndex.meetings.length + 3) {
    throw new Error(`Expected homepage, meeting/transcript indexes, and all ${meetingIndex.meetings.length} meeting URLs in sitemap; found ${sitemapLocations.length}`);
  }
  const archiveResponse = await context.request.get(new URL('meetings/', publicBase).toString());
  const archiveHtml = await archiveResponse.text();
  if (archiveResponse.status() !== 200 || !archiveHtml.includes('Cheyenne public meeting archive') || !archiveHtml.includes('transcripts/')) {
    throw new Error('Expected the crawlable meeting archive index and transcript link to be exported');
  }
  const transcriptResponse = await context.request.get(new URL('transcripts/', publicBase).toString());
  const transcriptHtml = await transcriptResponse.text();
  if (transcriptResponse.status() !== 200 || !transcriptHtml.includes('Cheyenne public meeting transcripts')) {
    throw new Error('Expected the timestamped transcript index to be exported');
  }
  const historicalMeetings = meetingIndex.meetings.filter((meeting) => !meeting.upcoming);
  const oldestMeeting = historicalMeetings.reduce((oldest, meeting) => meeting.date < oldest.date ? meeting : oldest);
  const latestMeeting = historicalMeetings.reduce((latest, meeting) => meeting.date > latest.date ? meeting : latest);
  for (const meeting of [oldestMeeting, latestMeeting]) {
    const recordResponse = await context.request.get(new URL(`meetings/${meeting.id}/`, publicBase).toString());
    const recordHtml = await recordResponse.text();
    const recordCanonical = `https://therealwindycity.github.io/TheReelWindyCity/meetings/${meeting.id}/`;
    if (recordResponse.status() !== 200 || !recordHtml.includes(meeting.bodyLabel) || !recordHtml.includes(recordCanonical)) {
      throw new Error(`Expected crawlable static record page for ${meeting.id}`);
    }
  }
  const faviconResponse = await context.request.get(new URL('favicon.svg', publicBase).toString());
  if (faviconResponse.status() !== 200 || !(await faviconResponse.text()).includes('<svg')) {
    throw new Error('Expected the Civic Cheyenne favicon to be available');
  }
  console.log(`PASS: SEO metadata, sitemap with ${sitemapLocations.length} URLs, full archive index, oldest/latest static meeting pages, and favicon`);
  await expect(page.getByRole('heading', { name: 'Big decisions. Local impact.' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('.map-loading')).not.toBeVisible({ timeout: 20000 });
  await expect(page.locator('.map-unavailable')).not.toBeVisible();
  await expect(page.locator('.brief-eyebrow')).toContainText('NEXT UP IN COUNCIL CHAMBERS');
  await expect(page.locator('.session-brief')).toContainText('Public Services Committee');
  await expect(page.locator('.session-brief')).toContainText('October 5, 2026');
  await expect(page.locator('.session-brief')).toContainText('11');
  await expect(page.locator('.source-count')).toContainText('2008');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); });
  await page.screenshot({ path: 'test-output/overview.png', fullPage: true, animations: 'disabled' });
  console.log('PASS: dashboard opens on the next posted meeting and shows archive coverage');

  await page.getByRole('button', { name: 'Open the next meeting', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The agenda is posted. Take a look before it happens.' })).toBeVisible();
  await expect(page.locator('.session-location-banner')).toContainText('Public Services Committee');
  await expect(page.locator('.session-location-banner')).toContainText('Monday, October 5, 2026');
  await expect(page.locator('.meeting-item')).toHaveCount(11);
  await expect(page.locator('.meeting-item-stack')).toContainText('Hitching Post District');
  await expect(page.getByRole('link', { name: /Join on Zoom/ })).toBeVisible();
  await page.screenshot({ path: 'test-output/next-meeting.png', fullPage: true, animations: 'disabled' });
  await page.locator('.meeting-switcher-quick').getByRole('button', { name: /Finance · Tue/ }).click();
  await expect(page.locator('.session-location-banner')).toContainText('October 6, 2026');
  await expect(page.locator('.meeting-item')).toHaveCount(6);
  await expect(page.locator('.meeting-item-stack')).toContainText('Airport Golf Course');
  await page.locator('.meeting-switcher-quick').getByRole('button', { name: /Guided session/ }).click();
  await expect(page.getByRole('heading', { name: 'Inside Council Chambers.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open the complete agenda' }).click();
  await expect(page.locator('.document-modal')).toBeVisible();
  await expect(page.frameLocator('.document-frame').getByText('JANUARY 26, 2026', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.document-modal')).not.toBeVisible();
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
  await page.locator('.featured-sources button').filter({ hasText: 'Posted agenda' }).click();
  await expect(page.locator('.document-modal')).toBeVisible();
  await expect(page.locator('.document-header')).toContainText('October 5, 2026');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Source library/ }).first().click();
  await page.getByLabel('Choose GitHub archive').selectOption('The-Real-Windy-City-');
  await page.getByLabel('Search all repository source files').fill('2026-01-26');
  await expect(page.locator('.source-file-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.source-card-main').first().click();
  await expect(page.locator('.document-text')).toContainText('x6Veeticz3Q', { timeout: 20000 });
  await page.keyboard.press('Escape');
  console.log('PASS: source search, bookmarks, safely rendered original agenda, posted next-meeting agenda, transcript');

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

  await page.getByRole('button', { name: 'Live alerts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PULSE', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cheyenne & Wyoming Live Scanner Console/ })).toBeVisible();
  await expect(page.locator('.pulse-scanner-tuner')).toContainText('Laramie County Law Enforcement');
  await page.getByRole('button', { name: /Cheyenne Talkgroups/ }).click();
  await expect(page.locator('.pulse-talkgroup-panel')).toContainText('02-LE 1 DSP');
  await expect(page.locator('.pulse-talkgroup-panel')).toContainText('02-CFR 1');
  await page.getByRole('button', { name: /Cheyenne \/ Laramie Co\./ }).click();
  await expect(page.locator('.pulse-alert-list .broadcast-alert').first()).toBeVisible();
  console.log('PASS: Cheyenne & Wyoming Live Scanner Console, WyoLink P25 talkgroups, and live alerts feed');

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.locator('.session-date-select').click();
  await expect(page.locator('.featured-meeting').first()).toContainText('Public Services Committee');
  await expect(page.locator('.featured-meeting').first()).toContainText('Start here');
  const pickerButtons = await page.locator('.meeting-picker-list button').count();
  if (pickerButtons < 600) throw new Error(`Expected the complete meeting index in the picker, found ${pickerButtons}`);
  await expect(page.locator('.meeting-picker-list')).toContainText('May 27, 2008');
  await expect(page.locator('.meeting-picker-list')).toContainText('September 28, 2026');
  await page.locator('.meeting-picker-list button').filter({ hasText: 'September 28, 2026' }).first().click();
  await expect(page.getByRole('heading', { name: 'Everything the city kept from this meeting.' })).toBeVisible();
  await expect(page.locator('.session-location-banner')).toContainText('September 28, 2026');
  await expect(page.locator('.meeting-docs-strip').or(page.locator('.watch-source-actions'))).toBeVisible();
  await page.getByRole('button', { name: 'Explore another meeting', exact: true }).click();
  await page.locator('.meeting-picker-list button').filter({ hasText: 'September 22, 2026 · Finance Committee' }).first().click();
  await expect(page.locator('.session-location-banner')).toContainText('Finance Committee');
  await page.getByRole('button', { name: 'Read transcript', exact: true }).click();
  await expect(page.locator('.document-modal')).toBeVisible();
  await expect(page.locator('.document-header')).toContainText('Finance Committee transcript');
  await expect(page.locator('.document-actions a').filter({ hasText: 'Original source' })).toHaveAttribute('href', /2026-09-22-finance-committee\.md/);
  await page.keyboard.press('Escape');
  console.log('PASS: every meeting indexed, next meeting featured, archived meeting & transcript open');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, isMobile: true, deviceScaleFactor: 1 });
  await mobile.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MINIMAL_STYLE) }));
  const mp = await mobile.newPage();
  mp.on('pageerror', capturePageError);
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
