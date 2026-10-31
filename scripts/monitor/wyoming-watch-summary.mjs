#!/usr/bin/env node
// Render the watcher report without assuming that a failed fetch established a baseline.
import { readFileSync } from 'node:fs';

const markdown = (value) => String(value ?? '—').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
const annotation = (value) => String(value ?? '').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
export function summary(report) {
  const lines = ['## Live Wyoming Watch', '', '| Field | Value |', '| --- | --- |'];
  for (const [label, key] of [['Governments', 'governments'], ['Surfaces', 'surfaces'], ['Fetched', 'fetched'], ['Recorded, not fetched', 'recorded'], ['Delegated', 'delegated'], ['Content changed', 'changed'], ['Structural failures', 'structural']]) {
    lines.push(`| ${label} | ${markdown(report[key])} |`);
  }
  lines.push('', '### Municipal parse surfaces and other failures', '', '| Target | Mode | Result | Details |', '| --- | --- | --- | --- |');
  const relevant = report.results.filter((r) => r.mode === 'parse' || r.structural || r.reason === 'source-unavailable');
  for (const r of relevant) lines.push(`| ${markdown(r.name)} | ${markdown(r.mode)} | ${markdown(r.reason)} | ${markdown(r.error || (r.records != null ? `${r.records} records` : ''))} |`);
  if (!relevant.length) lines.push('| None | — | — | — |');
  lines.push('', 'This job does not promote meetings into the public snapshot.', '');
  return lines.join('\n');
}

if (process.argv[1]?.endsWith('/wyoming-watch-summary.mjs')) {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(summary(report));
  // Visible via the check-runs annotations API, even when artifact/log download is blocked.
  for (const r of report.results.filter((r) => r.mode === 'parse' || r.structural || r.reason === 'source-unavailable')) {
    console.error(`::notice title=Wyoming watch::${annotation(`${r.id}: ${r.reason}${r.error ? ` — ${r.error}` : ''}`)}`);
  }
}
