#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { contentHash } from '../lib/canonical.mjs';
import { atomicWrite } from '../lib/atomic.mjs';
import { runIfMain } from '../lib/cli.mjs';
import { COUNTIES, MUNICIPALITIES } from '../data/wyoming-ecosystem-catalog.mjs';
import { STRUCTURAL_CODES, emptyState, fail, parseSurface, siteHost, watchTargets } from '../lib/wyoming-adapters.mjs';

const DEFAULT_STATE = path.join('data', 'wyoming-sync-state.json');
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1',
};
function flag(name) { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; }
function loadState(file) {
  if (!existsSync(file)) return emptyState(watchTargets(COUNTIES, MUNICIPALITIES));
  const state = JSON.parse(readFileSync(file, 'utf8'));
  if (!state || state.version !== 1 || !state.targets) throw new Error(`${file} is not a Wyoming watch baseline`);
  return state;
}
function judge(previous, next) {
  if (!next) return { changed: null, reason: 'not-hashed' };
  if (!previous) return { changed: false, reason: 'baseline-established' };
  return { changed: previous !== next, reason: previous !== next ? 'content-changed' : 'unchanged' };
}
async function fetchPinned(initial, fetchImpl) {
  let url = initial;
  let referer = new URL(initial).origin + '/';
  const signal = AbortSignal.timeout(30000);
  const redirects = [];
  for (let hop = 0; hop <= 5; hop += 1) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw fail('ENO_HOST', 'Invalid web redirect destination');
    const response = await fetchImpl(url, { redirect: 'manual', signal, headers: { ...HEADERS, Referer: referer } });
    const status = response.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.get('location');
      if (response.body?.cancel) await response.body.cancel();
      if (!location) throw fail('ENO_HOST', `Redirect from ${url} had no Location`);
      if (hop === 5) throw fail('ENO_HOST', `Exceeded five redirects from ${initial}`);
      const next = new URL(location, url);
      if (parsed.protocol === 'https:' && next.protocol !== 'https:') throw fail('ENO_HOST', 'HTTPS downgrade refused');
      redirects.push({ from: url, to: next.toString(), status });
      referer = parsed.origin + '/';
      url = next.toString();
      continue;
    }
    if (status < 200 || status >= 300) {
      if (response.body?.cancel) await response.body.cancel();
      const error = new Error(`HTTP ${status} from ${url}`);
      error.status = status;
      error.finalUrl = url;
      throw error;
    }
    let body = '';
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 20_000_000) throw new Error('Response exceeds 20 MB limit');
          chunks.push(Buffer.from(value));
        }
        body = Buffer.concat(chunks).toString('utf8');
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
    } else if (typeof response.text === 'function') { body = await response.text(); }
    return { status, finalUrl: response.url || url, body, redirects, contentType: response.headers.get('content-type') || '' };
  }
  throw new Error('Redirect loop');
}
async function readFixture(dir, target) {
  const html = path.join(dir, `${target.id}.html`);
  const json = path.join(dir, `${target.id}.json`);
  if (existsSync(html)) return { status: 200, finalUrl: target.url, body: readFileSync(html, 'utf8'), contentType: 'text/html' };
  if (existsSync(json)) return JSON.parse(readFileSync(json, 'utf8'));
  throw new Error(`No fixture for ${target.id} in ${dir}`);
}
function idle(target) {
  return { ...target, fetched: false, changed: false, structural: false, reason: target.reason || (target.mode === 'delegate' ? 'owned-by-municipal-watch' : 'no-calibrated-surface'), contentHash: null };
}
function hostHash(url, status) {
  const klass = status >= 200 && status < 300 ? '2xx' : String(status);
  return contentHash([{ body: 'clerk-host', date: '', time: '', agendaUrl: `${siteHost(url)}|${klass}` }]);
}
async function watchOne(target, previous, source) {
  const base = { ...target, fetched: true };
  try {
    const fetched = await source(target);
    const previousHash = previous?.url === target.url && previous?.architectureId === target.architectureId ? previous.contentHash : null;
    const metadata = { status: fetched.status, finalUrl: fetched.finalUrl || target.url, redirects: fetched.redirects || [] };
    if (target.mode === 'host-check') {
      if (fetched.hostDrift) throw fail('ENO_HOST', fetched.error || 'host drift');
      const hash = hostHash(metadata.finalUrl, fetched.status);
      return { ...base, ...metadata, ...judge(previousHash, hash), structural: false, contentHash: hash };
    }
    if (/pdf/i.test(fetched.contentType || '') || String(fetched.body || '').startsWith('%PDF')) throw fail('ENO_SURFACE', 'Expected an HTML listing and received a PDF');
    const records = parseSurface(target.architectureId, fetched.body, metadata.finalUrl);
    const hash = contentHash(records);
    return { ...base, ...metadata, ...judge(previousHash, hash), structural: false, contentHash: hash, records: records.length };
  } catch (error) {
    console.warn(`[Wyoming Watch] ${target.name}: ${error.message}`);
    const structural = STRUCTURAL_CODES.has(error.code);
    return { ...base, changed: null, structural, reason: structural ? error.code : 'source-unavailable', error: error.message, status: error.status ?? null, finalUrl: error.finalUrl ?? null, contentHash: null };
  }
}
export async function runWatch({ targets, state, fetchImpl, fixtureDir, delayMs = 0 }) {
  const results = [];
  let network = 0;
  for (const target of targets) {
    if (target.mode === 'record' || target.mode === 'delegate') { results.push(idle(target)); continue; }
    if (network > 0 && delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    network += 1;
    const source = fixtureDir ? () => readFixture(fixtureDir, target) : () => fetchPinned(target.url, fetchImpl);
    results.push(await watchOne(target, state.targets?.[target.id], source));
  }
  return { checkedAt: new Date().toISOString(), governments: new Set(results.map(item => `${item.layer}:${item.governmentId}`)).size, surfaces: results.length, fetched: results.filter(item => item.fetched).length, succeeded: results.filter(item => item.contentHash).length, warnings: results.filter(item => item.error).length, recorded: results.filter(item => item.mode === 'record').length, delegated: results.filter(item => item.mode === 'delegate').length, changed: results.some(item => item.changed === true), structural: results.filter(item => item.structural).length, results };
}
export function nextState(previous, report) {
  const targets = { ...previous.targets };
  for (const result of report.results) {
    if (!result.contentHash || result.structural) continue;
    targets[result.id] = { architectureId: result.architectureId, mode: result.mode, url: result.url, contentHash: result.contentHash, checkedAt: report.checkedAt };
  }
  return { version: 1, updatedAt: report.checkedAt, targets };
}
async function main() {
  const statePath = flag('--state') || DEFAULT_STATE;
  const targets = watchTargets(COUNTIES, MUNICIPALITIES);
  if (process.argv.includes('--seed')) { atomicWrite(statePath, `${JSON.stringify(emptyState(targets), null, 2)}\n`); return; }
  if (!process.argv.includes('--check')) { console.error('Use --seed or --check'); process.exitCode = 2; return; }
  const state = loadState(statePath);
  const report = await runWatch({ targets, state, fetchImpl: globalThis.fetch, fixtureDir: flag('--from-dir'), delayMs: flag('--from-dir') ? 0 : Number(flag('--delay') ?? 1500) });
  const out = flag('--out');
  if (out) atomicWrite(out, `${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes('--update-state')) atomicWrite(statePath, `${JSON.stringify(nextState(state, report), null, 2)}\n`);
  console.log(JSON.stringify({ governments: report.governments, surfaces: report.surfaces, fetched: report.fetched, succeeded: report.succeeded, warnings: report.warnings, changed: report.changed, structural: report.structural }));
  if (report.fetched > 0 && report.succeeded === 0) process.exitCode = 1;
}
runIfMain(import.meta.url, main);
