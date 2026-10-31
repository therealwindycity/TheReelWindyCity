import test from 'node:test';
import assert from 'node:assert/strict';
import { summary } from '../scripts/monitor/wyoming-watch-summary.mjs';

test('summary distinguishes municipal baselines, structural failures and unavailable sources', () => {
  const text = summary({ governments: 3, surfaces: 3, fetched: 3, recorded: 0, delegated: 0, changed: false, structural: 1, results: [
    { name: 'Cody', mode: 'parse', reason: 'baseline-established', records: 2 },
    { name: 'Casper', mode: 'parse', reason: 'ENO_ROWS', structural: true, error: 'No | dated rows\nfound' },
    { name: 'Albany', mode: 'host-check', reason: 'source-unavailable', error: 'HTTP 503' },
  ] });
  assert.match(text, /Cody \| parse \| baseline-established \| 2 records/);
  assert.match(text, /Casper \| parse \| ENO_ROWS \| No \\\| dated rows found/);
  assert.match(text, /Albany \| host-check \| source-unavailable \| HTTP 503/);
});
