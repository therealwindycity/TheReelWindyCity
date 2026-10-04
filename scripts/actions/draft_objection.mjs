#!/usr/bin/env node
/**
 * Phase 3 — citizen objection drafts, via mailto: ONLY.
 *
 * Red-team context (Order of Magnitude 2, finding 2 — "The Form-Submission API
 * Trap"): automated POSTs into OpenGov/Granicus intake endpoints walk straight
 * into Cloudflare walls, CSRF token checks and reCAPTCHA v3 scoring — the source
 * IP gets flagged as a spam/DDoS vector and the whole project's outreach ability
 * dies with it.
 *
 * The pivot implemented here: generate a pre-formatted RFC 6068 mailto: link plus
 * a copy-paste draft. One click opens the *citizen's own* mail client with the
 * recipient, subject and body filled in; the send action stays under organic
 * human control. This script performs ZERO network calls.
 *
 * Anti-fabrication: it does not invent recipient addresses. The recipient comes
 * from --to or data/contacts.json (which you fill with an address verified on
 * cheyennecity.org). No verified recipient ⇒ drafts are skipped with a warning,
 * never silently addressed to a guessed mailbox.
 *
 * Usage:
 *   node scripts/actions/draft_objection.mjs --plan .sync/plan.json [--to clerk@…]
 *   node scripts/actions/draft_objection.mjs --meeting data/meetings/2026/<id> [--item 15 …] [--to …]
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { collapseWhitespace } from "../lib/canonical.mjs";
import { atomicWrite } from "../lib/atomic.mjs";
import { loadPlan, meetingDirectory } from "../sync/plan.mjs";
import { runIfMain } from "../lib/cli.mjs";

const CONTACTS_FILE = path.join("data", "contacts.json");
const OFFICIAL_PAGE = "https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas";

function resolveRecipient(flagTo) {
  if (flagTo) return { email: flagTo, source: "--to" };
  if (existsSync(CONTACTS_FILE)) {
    try {
      const contacts = JSON.parse(readFileSync(CONTACTS_FILE, "utf8"));
      if (contacts.defaultRecipient && /.+@.+\..+/.test(contacts.defaultRecipient)) {
        return { email: contacts.defaultRecipient, source: "data/contacts.json" };
      }
    } catch {
      console.warn("::warning::data/contacts.json is not valid JSON — ignoring it.");
    }
  }
  return null;
}

function percentEncode(value) {
  return encodeURIComponent(value).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/!/g, "%21");
}

/** RFC 6068 mailto link with subject + body. Body kept short; the .md carries the full text. */
export function buildMailto(recipient, subject, body) {
  const params = [`subject=${percentEncode(subject)}`, `body=${percentEncode(body)}`];
  return `mailto:${recipient}?${params.join("&")}`;
}

function buildDraft({ agenda, analysis, item, recipient }) {
  const findings = (analysis?.findings || []).filter((finding) => finding.itemNumbers?.includes(item.number));
  const act = findings.filter((finding) => finding.severity === "act");
  const watch = findings.filter((finding) => finding.severity !== "act");

  const subject = `Public comment — ${agenda.meetingId}, Item ${item.number}: ${item.text.slice(0, 70)}`.replace(/\s+/g, " ").trim();

  const bodyLines = [
    "To the members of the governing body,",
    "",
    `I am writing about item ${item.number} of the posted ${agenda.meetingId} agenda:`,
    "",
    `    “${collapseWhitespace(item.text).slice(0, 400)}”`,
    "",
    act.length ? "Because this item is time-sensitive, I ask that it be:" : "I ask that this item be:",
    "",
    "  - discussed individually (not enacted as part of a bundled motion), and",
    "  - continued to a future meeting so residents have adequate time to review it.",
    "",
    act.length || watch.length ? "Points I would like addressed:" : "",
    ...(act.concat(watch)).map((finding) => `  - ${finding.title} (${finding.id})`),
    "",
    "Thank you for your public service and for recording my comment.",
    "",
    "[Your name / ward / contact — the sender fills this in]",
    "",
    `— Draft prepared with Civic Cheyenne from the posted agenda (${agenda.sourceUrl}). Verify wording against the official record before sending.`,
  ].filter((line) => line !== "");

  const body = bodyLines.join("\r\n"); // CRLF: safest across mail clients
  return { subject, body, mailto: buildMailto(recipient, subject, body), findings };
}

function renderMarkdown(agenda, item, draft, findings) {
  const lines = [
    `# Objection draft — Item ${item.number} · ${agenda.meetingId}`,
    "",
    `**One-click open in your mail client** (nothing is sent automatically — you stay in control):`,
    "",
    `[✉ Open draft in mail client](${draft.mailto})`,
    "",
    "If your mail client does not handle the link, copy the fields below.",
    "",
    "## To", "", `Recipient: *configure via data/contacts.json or --to (verified on ${OFFICIAL_PAGE})*`,
    "", "## Subject", "", "```", draft.subject, "```",
    "", "## Body", "", "```", draft.body, "```",
  ];
  if (findings.length) {
    lines.push("", "## Why this draft flags the item", "");
    for (const finding of findings) {
      lines.push(`- **[${finding.severity.toUpperCase()}] ${finding.title}** (${finding.generatedBy}) — ${finding.detail}`);
      for (const entry of finding.evidence) lines.push(`  > (p${entry.page}) “${entry.quote}”`);
    }
  }
  lines.push(
    "",
    "---",
    "Draft generated locally by `scripts/actions/draft_objection.mjs` — no network submission, no portal automation.",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const items = args.flatMap((arg, index) => (arg === "--item" ? [args[index + 1]] : []));
  const recipient = resolveRecipient(flag("--to"));

  let dirs = [];
  if (flag("--plan")) {
    const plan = loadPlan(flag("--plan"));
    dirs = plan.meetings.map((meeting) => meeting.dir || (meeting.meetingId ? meetingDirectory(meeting.meetingId) : null)).filter(Boolean);
  } else {
    const meeting = flag("--meeting");
    if (!meeting) {
      console.error("usage: draft_objection.mjs (--plan <p> | --meeting <dir>) [--item <n> …] [--to <email>]");
      process.exit(2);
    }
    dirs = [meeting];
  }
  if (!dirs.length) {
    console.error("No meeting directories resolved — nothing to draft.");
    process.exit(1);
  }
  if (!recipient) {
    console.warn(
      `::warning::No verified recipient configured — objection drafts SKIPPED (this is intentional: the project does not guess municipal addresses). ` +
        `Set data/contacts.json "defaultRecipient" (verify on ${OFFICIAL_PAGE}) or pass --to. The sync continues; only drafts are omitted.`,
    );
    return;
  }
  console.log(`Recipient resolved from ${recipient.source}: ${recipient.email}`);

  for (const dir of dirs) {
    const agendaPath = path.join(dir, "agenda.json");
    const analysisPath = path.join(dir, "analysis.json");
    if (!existsSync(agendaPath)) {
      console.error(`✗ missing ${agendaPath} — extraction must run first`);
      process.exit(1);
    }
    const agenda = JSON.parse(readFileSync(agendaPath, "utf8"));
    const analysis = existsSync(analysisPath) ? JSON.parse(readFileSync(analysisPath, "utf8")) : null;

    // Default: draft for every item carrying an "act" finding; --item overrides.
    const targets = items.length
      ? agenda.items.filter((item) => items.includes(String(item.number)))
      : agenda.items.filter((item) => (analysis?.findings || []).some((finding) => finding.severity === "act" && finding.itemNumbers?.includes(item.number)));

    if (!targets.length) {
      console.log(`· ${agenda.meetingId}: no action-severity items — no objection drafts (nothing skipped silently).`);
      continue;
    }
    for (const item of targets) {
      const draft = buildDraft({ agenda, analysis, item, recipient: recipient.email });
      atomicWrite(path.join(dir, "objections", `item-${item.number}.md`), renderMarkdown(agenda, item, draft, draft.findings));
      console.log(`✓ ${agenda.meetingId} item ${item.number}: mailto draft → ${path.join(dir, "objections", `item-${item.number}.md`)}`);
    }
  }
}

runIfMain(import.meta.url, main);
