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

/**
 * A statically exported Next app can hold more than one `link[rel=canonical]`
 * after hydration (the exported head plus the copy the client runtime re-applies
 * from layout metadata). What matters for indexing is that every copy declares
 * the same URL, so assert on all of them rather than on whichever one strict mode
 * happens to resolve first.
 */
async function expectCanonical(page, expected) {
  const hrefs = () => page.locator('link[rel="canonical"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  await expect.poll(async () => {
    const found = await hrefs();
    return found.length > 0 && found.every((href) => href === expected) ? 'ok' : found;
  }, { timeout: 15000 }).toBe('ok');
}
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
  // Keep the live-desk smoke check deterministic and independent of third-party uptime.
  await context.route('https://api.weather.gov/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/geo+json',
    body: JSON.stringify({ features: [], properties: {} }),
  }));
  await context.route('https://www.wyoroad.info/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<html><body><p>CI fixture: no current WYDOT travel advisories.</p></body></html>',
  }));
  await context.route('https://services3.arcgis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: [] }),
  }));
  await context.route('https://earthquake.usgs.gov/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/geo+json',
    body: JSON.stringify({ features: [] }),
  }));
  await context.route('https://api.rss2json.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', items: [] }),
  }));
  // The Arena window is visitor-initiated; the smoke check opens it, so stub the
  // host instead of depending on arena.ai uptime or its frame policy.
  await context.route('https://arena.ai/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Arena fixture</title><h1>Arena agent window</h1>',
  }));
  const rssHosts = [
    'capcity.news', 'kgab.com', 'kfbcradio.com', 'shortgo.co',
    'www.wyomingpublicmedia.org', 'wyofile.com', 'oilcity.news', 'county17.com',
    'sheridanmedia.com', 'buckrail.com', 'county10.com', 'www.sweetwaternow.com',
  ];
  for (const host of rssHosts) {
    await context.route(`https://${host}/**`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/rss+xml',
      body: '<?xml version="1.0"?><rss version="2.0"><channel><title>CI fixture</title><description>Empty deterministic test feed.</description></channel></rss>',
    }));
  }
  const page = await context.newPage();
  page.on('pageerror', capturePageError);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const canonicalUrl = 'https://therealwindycity.github.io/TheReelWindyCity/';
  await expectCanonical(page, canonicalUrl);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /real public meetings/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow/);
  await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute('content', /max-image-preview:large/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonicalUrl);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  if (!structuredData?.includes('"@type":"WebSite"') || !structuredData.includes(canonicalUrl)) {
    throw new Error('Expected truthful WebSite JSON-LD with the canonical URL');
  }
  const appearanceButton = page.getByRole('button', { name: 'Choose site appearance' });
  await appearanceButton.click();
  await expect(appearanceButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Choose your reading style' })).toBeVisible();
  await expect(page.locator('.style-choice')).toHaveCount(10);
  await expect(page.locator('.style-choice-preview[class*="style-preview--"]')).toHaveCount(10);
  const fieldNotesChoice = page.getByRole('button', { name: /Field Notes/ });
  await fieldNotesChoice.click();
  await expect(fieldNotesChoice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.civic-shell')).toHaveAttribute('data-style', 'field-notes');
  await expect(page.locator('.overview-hero-grid')).toHaveCSS('display', 'flex');
  await page.keyboard.press('Escape');
  await expect(appearanceButton).toHaveAttribute('aria-expanded', 'false');
  await expect(appearanceButton).toBeFocused();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.civic-shell')).toHaveAttribute('data-style', 'field-notes');
  await page.getByRole('button', { name: 'Choose site appearance' }).click();
  await page.getByRole('button', { name: /^Prairie/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  console.log('PASS: ten presentation styles are selectable and the preference persists');
  const publicBase = `${BASE_URL.replace(/\/+$/, '')}/`;
  const sitemapResponse = await context.request.get(new URL('sitemap.xml', publicBase).toString());
  const sitemapText = await sitemapResponse.text();
  const meetingIndex = JSON.parse(await readFile('public/data/meetings.json', 'utf8'));
  const ecosystem = JSON.parse(await readFile('src/data/wyoming-ecosystem.json', 'utf8'));
  const statewidePages = 3 + ecosystem.counties.length * 2 + ecosystem.municipalities.length * 2;
  const sitemapLocations = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedSitemap = meetingIndex.meetings.length + 8 + statewidePages;
  if (sitemapResponse.status() !== 200 || sitemapLocations.length !== expectedSitemap) {
    throw new Error(`Expected homepage, meeting/transcript indexes, four civic hub pages, the MyNewSpace profile, ${statewidePages} statewide pages, and all ${meetingIndex.meetings.length} meeting URLs in sitemap; found ${sitemapLocations.length}`);
  }
  const newspaceResponse = await context.request.get(new URL('mynewspace/', publicBase).toString());
  const newspaceHtml = await newspaceResponse.text();
  if (newspaceResponse.status() !== 200 || !newspaceHtml.includes('mynewspace') || !newspaceHtml.includes('My Top 8 Friends')) {
    throw new Error(`Expected the static MyNewSpace profile page to be exported (status ${newspaceResponse.status()})`);
  }
  // The sitemap holds absolute canonical URLs, not the localhost mirror's URLs,
  // so the membership test has to be written against the production canonical.
  if (sitemapLocations.length && !sitemapLocations.includes(`${canonicalUrl}mynewspace/`)) {
    throw new Error(`MyNewSpace profile page is missing from the sitemap (${sitemapLocations.filter((url) => url.includes('mynewspace')).join(', ') || 'no match'})`);
  }
  const casperResponse = await context.request.get(new URL('civic/places/casper/', publicBase).toString());
  const casperHtml = await casperResponse.text();
  if (casperResponse.status() !== 200 || !casperHtml.includes('Casper') || !casperHtml.includes('civic record') || !casperHtml.includes('PLACE ARCHIVE') || casperHtml.includes('Five real ordinances from the January 26 session')) {
    throw new Error(`Expected the Casper civic to replace the Cheyenne ordinance experience (status ${casperResponse.status()})`);
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
  const hubPages = [
    { path: 'hub/', marker: 'Local government is easier to follow', extra: '<iframe' },
    { path: 'hub/meetings/', marker: 'Meetings &amp; agendas', extra: 'FEATURED POSTED AGENDA' },
    { path: 'hub/signals/', marker: 'Live signal desk', extra: 'WyoLink P25' },
    { path: 'hub/learn/', marker: 'Learn to follow a public decision', extra: 'QUICK KNOWLEDGE CHECK' },
  ];
  for (const hub of hubPages) {
    const response = await context.request.get(new URL(hub.path, publicBase).toString());
    const html = await response.text();
    if (response.status() !== 200 || !html.includes(hub.marker) || !html.includes(hub.extra)) {
      throw new Error(`Expected dedicated ${hub.path} civic hub page with source-backed content`);
    }
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

  await page.getByRole('button', { name: 'Wyoming Pulse', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PULSE', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cheyenne & Wyoming Live Scanner Console/ })).toBeVisible();
  await expect(page.locator('.pulse-status-updated')).toHaveAttribute('data-provenance', /live|snapshot/);
  await expect(page.locator('.pulse-status-updated')).toContainText(/LIVE SOURCES|DATED SNAPSHOT/);
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

  // The "Open this meeting in Civic Cheyenne" links on the static record pages point at
  // /?meeting=<id>. That deep link must open the named meeting, survive a reload, and move
  // the canonical URL onto the meeting's own record page so the two do not compete.
  const newestHistorical = historicalMeetings.reduce((latest, meeting) => meeting.date > latest.date ? meeting : latest);
  const deepLinkCanonical = `https://therealwindycity.github.io/TheReelWindyCity/meetings/${newestHistorical.id}/`;
  await page.goto(`${publicBase}?meeting=${newestHistorical.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.session-location-banner')).toContainText(newestHistorical.bodyLabel);
  await expectCanonical(page, deepLinkCanonical);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.session-location-banner')).toContainText(newestHistorical.bodyLabel);
  await expectCanonical(page, deepLinkCanonical);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expectCanonical(page, canonicalUrl);
  console.log('PASS: meeting deep links open the record and consolidate the canonical URL');

  await page.getByRole('button', { name: 'Wyoming Pulse', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A state-wide desk, split into streams.' })).toBeVisible();
  await expect(page.locator('.pulse-stream-row')).toHaveCount(9);
  await page.getByRole('button', { name: /Statewide headlines\. .*Open this stream's news archive/ }).click();
  await expect(page.getByRole('heading', { name: 'Statewide headlines archive' })).toBeVisible();
  await expect(page.locator('.pulse-stream-story').first()).toBeVisible();
  await expect(page.locator('.pulse-archive-source-link')).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: /Public safety\. .*Open this stream's news archive/ }).click();
  await expect(page.getByRole('heading', { name: 'Public safety archive' })).toBeVisible();
  await page.getByRole('button', { name: /Wyoming sports\. .*Open this stream's news archive/ }).click();
  await expect(page.getByRole('heading', { name: 'Wyoming sports archive' })).toBeVisible();
  await expect(page.locator('.pulse-stream-story').first()).toBeVisible();
  console.log('PASS: nine sector marquees expand to source-linked Wyoming news history, including sports');

  // MyNewSpace: the profile is the published record, the studio is the visitor's.
  await page.goto(`${publicBase}mynewspace/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /mynewspace/ }).first()).toBeVisible();
  await expectCanonical(page, `${canonicalUrl}mynewspace/`);
  await expect(page.getByText('Not affiliated with')).toBeVisible();
  await expect(page.locator('.nsp-snapshot')).toContainText('Record snapshot');
  const arenaFrame = page.locator('#nsp-studio iframe');
  if (await arenaFrame.evaluate((frame) => frame.hasAttribute('src'))) {
    throw new Error('The Arena window loaded before the visitor asked for it');
  }
  await expect(page.getByRole('button', { name: /Load Arena window/ })).toBeVisible();
  await page.getByRole('button', { name: /Load Arena window/ }).click();
  await expect(arenaFrame).toHaveAttribute('src', /arena\.ai/);
  console.log('PASS: MyNewSpace ships an unfired Arena window that opens only on request');

  await page.getByRole('tab', { name: 'Code console' }).click();
  await page.getByLabel('Custom CSS').fill('#nsp-sec-about{display:none!important}</style><img src=x onerror="window.__pwned=1">\n@import url("https://evil.example/x.css");');
  await page.getByRole('button', { name: /Apply stylesheet/ }).click();
  await expect(page.locator('#nsp-sec-about')).toBeHidden();
  const injected = await page.evaluate(() => document.getElementById('nsp-custom-css')?.textContent ?? '');
  if (injected.includes('</style>') || injected.includes('@import') || injected.includes('onerror')) {
    throw new Error(`Custom CSS was not neutralized before injection: ${injected.slice(0, 160)}`);
  }
  if (await page.evaluate(() => window.__pwned !== undefined)) {
    throw new Error('Custom CSS executed script in the page');
  }
  await page.getByLabel('Custom HTML module').fill('<marquee>read the agenda</marquee><script>window.__pwned2=1<\/script>');
  await page.getByRole('button', { name: /Save module/ }).click();
  const moduleFrame = page.locator('.nsp-module-frame');
  await expect(moduleFrame).toHaveAttribute('srcdoc', /marquee/);
  // The exact allowlist does not matter as much as the two things that do: the
  // frame is sandboxed at all, and it is not granted same-origin access.
  const sandboxValue = await moduleFrame.evaluate((frame) => frame.getAttribute('sandbox'));
  if (sandboxValue === null || /allow-same-origin|allow-top-navigation/.test(sandboxValue)) {
    throw new Error(`The custom module frame is not sealed (sandbox=${JSON.stringify(sandboxValue)})`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nsp-sec-about')).toBeHidden();
  // The studio opens on the Arena tab again, so the console has to be re-opened
  // before its fields can show what came back out of localStorage.
  await page.getByRole('tab', { name: 'Code console' }).click();
  await expect(page.getByLabel('Custom CSS')).toHaveValue(/nsp-sec-about/);
  await expect(page.getByLabel('Custom HTML module')).toHaveValue(/marquee/);
  if (await page.evaluate(() => window.__pwned2 !== undefined)) {
    throw new Error('The sealed custom module reached the host page');
  }
  console.log('PASS: studio CSS/HTML is sanitized, sandboxed, applied, and persisted per browser');

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('#nsp-sec-about')).toBeVisible();
  await expect(page.getByLabel('Custom CSS')).toHaveValue('');
  await page.getByLabel('Your note').fill('Checking the second reading against the minutes.');
  await page.getByRole('button', { name: 'Post to my view' }).click();
  await expect(page.locator('.nsp-wall-local li')).toHaveCount(1);
  await expect(page.locator('.nsp-wall-notice')).toContainText('this browser');
  await page.screenshot({ path: 'test-output/mynewspace.png', fullPage: true, animations: 'disabled' });
  console.log('PASS: MyNewSpace resets to the published profile and keeps a note local');

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
  await mp.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await mp.getByRole('button', { name: 'Wyoming Pulse', exact: true }).click();
  await expect(mp.locator('.pulse-stream-row')).toHaveCount(9);
  await mp.getByRole('button', { name: /Roads & travel\. .*Open this stream's news archive/ }).click();
  await expect(mp.getByRole('heading', { name: 'Roads & travel archive' })).toBeVisible();
  overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on the mobile news stream archive');
  console.log('PASS: mobile navigation, news archives, and responsive layouts');
  if (errors.length) throw new Error(`Browser exceptions: ${errors.join('; ')}`);
  console.log('ALL CIVIC BROWSER CHECKS PASSED');
} catch (error) {
  const message = String(error instanceof Error ? error.message : error)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .slice(0, 1400);
  console.log(`::error title=Civic browser smoke failure::${message}`);
  throw error;
} finally {
  await browser.close();
}
