#!/usr/bin/env node
/**
 * Phase 2b — red-team analysis of a posted municipal agenda.
 *
 * Red-team fixes implemented here:
 *   OM2#1 (Layout Blindness → hallucination): the analyzer consumes the
 *     *structured* agenda.json (items with verbatim quotes and page numbers),
 *     never a raw text blob. Its default mode is a deterministic rules engine —
 *     zero hallucination surface. An optional `--llm` pass (OpenAI-compatible)
 *     is quarantined behind the same evidence gate as the rules: every finding
 *     must cite a quote that literally exists in the agenda text or it is
 *     dropped before it can reach a commit.
 *   OM3#2 (Error Cascades): a missing/invalid agenda.json fails this step (and
 *     therefore the whole sync job) instead of "analyzing" nothing.
 *
 * Usage:
 *   node scripts/analysis/red_team_analyzer.mjs --plan .sync/plan.json [--llm]
 *   node scripts/analysis/red_team_analyzer.mjs --meeting data/meetings/2026/<id> [--llm]
 *
 * Environment (only used with --llm):
 *   OPENAI_API_KEY (or LLM_API_KEY) — absent key ⇒ rules-only, with a notice.
 *   OPENAI_BASE_URL (default https://api.openai.com/v1), OPENAI_MODEL (default gpt-4o-mini).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { collapseWhitespace } from "../lib/canonical.mjs";
import { atomicWrite } from "../lib/atomic.mjs";
import { loadPlan, meetingDirectory } from "../sync/plan.mjs";
import { runIfMain } from "../lib/cli.mjs";

/* ------------------------------------------------------------------ */
/* Deterministic rules engine                                          */
/* ------------------------------------------------------------------ */

const RULES_VERSION = "rules-v1";

/**
 * Each rule sees one agenda item plus the whole-document context and returns
 * findings. Evidence quotes are always substrings of the item's own verbatim
 * quote — the validator re-checks them against the source text before commit.
 */
const RULES = [
  {
    id: "consent-bundling",
    severity: "act",
    title: "Substantive item bundled on the consent agenda",
    detail:
      "This item is designated for the consent agenda, meaning it is enacted by a single motion with no separate discussion unless a governing-body member pulls it (with two supporting members). Substantive policy can pass with essentially zero deliberation — request removal from consent if you want it discussed.",
    when: (item, context) =>
      item.consent &&
      (/ordinance|resolution/i.test(item.kind) || /re-?appropriat|annex|zoning|contract|agreement/i.test(item.text)),
    evidence: (item, context) => evidenceFor(item, context, [item.text, context.consentBoilerplate]),
  },
  {
    id: "final-reading",
    severity: "act",
    title: "Ordinance on final (3rd) reading — last scheduled opportunity for input",
    detail:
      "Third reading is typically the passage vote. Public comment after this point is drastically less effective; this is the last agenda step where input can change the outcome.",
    when: (item) => /ordinance/i.test(item.kind) && /3rd reading/i.test(item.kind),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "second-reading",
    severity: "watch",
    title: "Ordinance on 2nd reading — text can still be amended",
    detail: "Second reading is where amendments are still routine; track the final language here.",
    when: (item) => /ordinance/i.test(item.kind) && /2nd reading/i.test(item.kind),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "annexation",
    severity: "watch",
    title: "Territorial annexation",
    detail:
      "Annexation moves land into city jurisdiction and usually precedes zoning/service decisions with long-term effects. Verify the associated zoning-map and service-commitment items posted alongside it.",
    when: (item) => /\bannex(ing|ation)\b/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "zoning-map-amendment",
    severity: "watch",
    title: "Official Zoning Map amendment",
    detail:
      "Changes the zoning classification of specific land. Check whether notice to affected owners was published and whether the parcel is near you (see the site's impact map for prior examples).",
    when: (item) => /official zoning map/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "emergency-enactment",
    severity: "act",
    title: "Emergency clause / immediate effectiveness",
    detail:
      "Emergency clauses bypass the normal reading schedule and make the ordinance effective immediately upon passage. Ask why the emergency procedure is justified.",
    when: (item) => /emergency (clause|enactment|measure)/i.test(item.text) || /become(?:s)? effective (?:upon|immediately)/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "rules-waiver",
    severity: "act",
    title: "Waiver of council rules",
    detail: "Waiving rules (e.g., reading an ordinance on the same day it is introduced) compresses the public's window to react.",
    when: (item) => /waiv(e|er|ing)\s+(of\s+)?(the\s+)?rules/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "budget-reappropriation",
    severity: "watch",
    title: "Budget re-appropriation",
    detail: "Moves previously appropriated funds between purposes; check which program loses the money.",
    when: (item) => /re-?appropriat/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "sole-source-award",
    severity: "watch",
    title: "Possibly non-competitive contract award",
    detail: "Sole-source / no-bid language deserves scrutiny: ask what justified skipping competitive procurement.",
    when: (item) => /sole source|single source|without competitive bid|non-?competitive/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "search-or-inspection-authority",
    severity: "watch",
    title: "Administrative search / inspection authority",
    detail: "Creates or exercises government inspection powers — compare against constitutional warrant requirements and existing code chapters.",
    when: (item) => /inspection warrant|administrative (search|inspection)/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
  {
    id: "tax-or-fee-change",
    severity: "watch",
    title: "Tax or fee change",
    detail: "Creates or adjusts a municipal revenue instrument (special-purpose tax, fee schedule, rate change).",
    when: (item) => /specific purpose (sales and use )?tax|fee schedule|excise tax|increas\w+ (?:the )?fees?/i.test(item.text),
    evidence: (item, context) => evidenceFor(item, context, [item.text]),
  },
];

/** Build evidence entries whose quotes are guaranteed substrings of the source. */
function evidenceFor(item, context, candidates) {
  const evidence = [{ quote: clip(item.quote || item.text), page: item.page }];
  for (const candidate of candidates.slice(1)) {
    if (!candidate) continue;
    const quote = clip(candidate);
    if (quote && !evidence.some((entry) => entry.quote === quote)) evidence.push({ quote, page: item.page });
  }
  return evidence;
}

/**
 * Clip a quote for evidence use. IMPORTANT: no ellipsis or any other decoration —
 * the clipped string must remain a verbatim substring of the agenda text, because
 * the evidence gate (validator + analyzer self-check) tests `text.includes(quote)`.
 */
function clip(text, max = 220) {
  const collapsed = collapseWhitespace(text);
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

function runRules(agenda) {
  const context = {
    consentBoilerplate: /All agenda items listed with the designation of \[CA\][^.]*\./i.exec(agenda.text)?.[0] || null,
  };
  const findings = [];
  for (const rule of RULES) {
    for (const item of agenda.items) {
      if (!rule.when(item, context)) continue;
      findings.push({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        detail: rule.detail,
        itemNumbers: [item.number],
        kind: item.kind,
        evidence: rule.evidence(item, context),
        citation: `Posted ${agenda.meetingId} agenda, item ${item.number}, page ${item.page}`,
        generatedBy: RULES_VERSION,
      });
    }
  }
  return mergeByRule(findings);
}

/** Merge per-item findings of the same rule into one finding with all item numbers. */
function mergeByRule(findings) {
  const merged = [];
  for (const finding of findings) {
    const existing = merged.find((candidate) => candidate.id === finding.id);
    if (existing) {
      existing.itemNumbers.push(...finding.itemNumbers);
      existing.evidence.push(...finding.evidence.filter((entry) => !existing.evidence.some((e) => e.quote === entry.quote)));
      existing.citation = `Posted agenda, item(s) ${existing.itemNumbers.join(", ")}`;
    } else {
      merged.push({ ...finding, itemNumbers: [...finding.itemNumbers] });
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* Optional LLM pass — quarantined behind the same evidence gate        */
/* ------------------------------------------------------------------ */

async function runLlm(agenda) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log("No LLM API key configured — deterministic rules-only analysis (recommended default).");
    return [];
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const digest = agenda.items.map((item) => `p${item.page} #${item.number} [${item.kind}${item.consent ? " CA" : ""}] ${clip(item.text, 500)}`).join("\n");
  const system =
    "You audit municipal agendas for regulatory-process risks (bundled consent items, fast-tracking, " +
    "scope creep, procurement concerns). Respond ONLY with JSON: {\"findings\":[{\"id\":\"kebab-case-id\"," +
    "\"severity\":\"act|watch|info\",\"title\":\"…\",\"detail\":\"…\",\"itemNumbers\":[\"…\"]," +
    "\"evidence\":[{\"quote\":\"verbatim from the agenda\",\"page\":1}]}]}. Every evidence quote MUST be " +
    "copied character-for-character from the agenda text below and be at most 200 characters. If you are " +
    "not certain a quote is verbatim, omit the finding. Do not invent items, dates, names or citations.";
  const user = `Agenda ${agenda.meetingId} (${agenda.pages} pages):\n\n${digest}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    const allText = collapseWhitespace(agenda.text);

    const accepted = [];
    for (const finding of parsed.findings || []) {
      if (!finding?.id || !finding.title || !["act", "watch", "info"].includes(finding.severity)) continue;
      const evidence = (finding.evidence || [])
        .map((entry) => ({ quote: clip(entry.quote || "", 200), page: Number(entry.page) || 1 }))
        .filter((entry) => entry.quote && allText.includes(entry.quote));
      if (!evidence.length) {
        console.warn(`::warning::LLM finding "${finding.id}" dropped — no verbatim evidence found in the agenda text.`);
        continue;
      }
      accepted.push({ ...finding, evidence, generatedBy: "llm-v1", itemNumbers: (finding.itemNumbers || []).map(String) });
    }
    console.log(`LLM pass: ${accepted.length} finding(s) survived the evidence gate (of ${ (parsed.findings || []).length } proposed).`);
    return accepted;
  } catch (error) {
    // An LLM outage must never take the deterministic pipeline down.
    console.warn(`::warning::LLM pass skipped (${error.message}) — committing rules-only analysis.`);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Driver                                                              */
/* ------------------------------------------------------------------ */

function analyzeMeeting(dir) {
  const agendaPath = path.join(dir, "agenda.json");
  if (!existsSync(agendaPath)) {
    throw new Error(`missing ${agendaPath} — extraction must run first (refusing to analyze nothing)`);
  }
  let agenda;
  try {
    agenda = JSON.parse(readFileSync(agendaPath, "utf8"));
  } catch (error) {
    throw new Error(`agenda.json is not valid JSON (${error.message}) — re-run extraction`);
  }
  if (!Array.isArray(agenda.items) || !agenda.items.length) {
    throw new Error(`agenda.json has no items (${dir}) — refusing to publish an empty analysis`);
  }
  return agenda;
}

function renderMarkdown(agenda, findings) {
  const order = { act: 0, watch: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  const counts = { act: 0, watch: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  const lines = [
    `# Red-team analysis — ${agenda.meetingId}`,
    "",
    `Source: ${agenda.sourceUrl} — sha256 \`${agenda.sourceSha256?.slice(0, 12) ?? "?"}…\`, extracted ${agenda.fetchedAt}.`,
    `Findings: **${counts.act} act** · ${counts.watch} watch · ${counts.info} info. Generated by ${[...new Set(findings.map((f) => f.generatedBy))].join(", ")}.`,
    "",
    "> Machine-assisted screening of the *posted agenda*. Items are proposals, not decisions — verify against the official record before acting.",
    "",
  ];
  for (const finding of sorted) {
    lines.push(`## [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push("");
    lines.push(`Item(s): ${finding.itemNumbers.join(", ")} · rule \`${finding.id}\` · ${finding.generatedBy}`);
    lines.push("");
    lines.push(finding.detail);
    lines.push("");
    for (const entry of finding.evidence) lines.push(`> (p${entry.page}) “${entry.quote}”`);
    lines.push("");
  }
  if (!sorted.length) lines.push("No rules matched. Nothing here means the agenda is clean — only that no known pattern fired.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const useLlm = args.includes("--llm");

  let dirs = [];
  if (flag("--plan")) {
    const plan = loadPlan(flag("--plan"));
    // The extractor writes resolved ids/dirs back into the plan; prefer those so
    // analysis targets exactly what was extracted.
    dirs = plan.meetings
      .map((meeting) => meeting.dir || (meeting.meetingId ? meetingDirectory(meeting.meetingId) : null))
      .filter(Boolean);
    if (dirs.length !== plan.meetings.length) {
      console.error("Plan contains meetings without resolved directories — extraction must run first.");
      process.exit(1);
    }
  } else {
    const meeting = flag("--meeting");
    if (!meeting) {
      console.error("usage: red_team_analyzer.mjs (--plan <p> | --meeting <dir>) [--llm]");
      process.exit(2);
    }
    dirs = [meeting];
  }
  if (!dirs.length) {
    console.error("No meeting directories resolved from plan (missing --meeting-id in payload?). Nothing analyzed.");
    process.exit(1);
  }

  for (const dir of dirs) {
    let agenda;
    try {
      agenda = analyzeMeeting(dir);
    } catch (error) {
      console.error(`✗ ${dir}: ${error.message}`);
      process.exit(1);
    }
    const findings = [...runRules(agenda), ...(useLlm ? await runLlm(agenda) : [])];
    const analysis = {
      meetingId: agenda.meetingId,
      generatedAt: new Date().toISOString(),
      generatedBy: useLlm ? [RULES_VERSION, "llm-v1"] : [RULES_VERSION],
      summary: {
        items: agenda.items.length,
        findings: findings.length,
        bySeverity: { act: findings.filter((f) => f.severity === "act").length, watch: findings.filter((f) => f.severity === "watch").length, info: findings.filter((f) => f.severity === "info").length },
      },
      findings,
    };
    atomicWrite(path.join(dir, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);
    atomicWrite(path.join(dir, "analysis.md"), renderMarkdown(agenda, findings));
    console.log(`✓ ${agenda.meetingId}: ${findings.length} finding(s) → ${path.join(dir, "analysis.json")}`);
  }
}

runIfMain(import.meta.url, main);
