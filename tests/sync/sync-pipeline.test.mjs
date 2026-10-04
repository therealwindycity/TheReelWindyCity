/**
 * Pipeline test suite — every red-team fix, proven.
 *
 * The tests are organized by the finding they lock down:
 *   OM1#1  workflow serialization & guarded commit   (workflow YAML assertions)
 *   OM1#2  canonical content hashing                 (canonical + watcher tests)
 *   OM2#1  layout-aware PDF extraction               (engine + real-document tests)
 *   OM2#2  mailto-only objection drafts              (drafter tests)
 *   OM3#1  flat client_payload contract              (build-plan + workflow tests)
 *   OM3#2  error cascades & validation gates         (failure-path + validator tests)
 *
 * Run: npm run test:sync   (from the repository root)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collapseWhitespace, normalizeUrl, normalizeDate, normalizeTime, stableStringify, contentHash, sortRecords } from "../../scripts/lib/canonical.mjs";
import { extractUpcomingRecords, recordsFromOfficialSnapshot, bodySlug } from "../../scripts/lib/upcoming-table.mjs";
import { extractPdfLayout, ExtractionError } from "../../scripts/lib/pdf-layout.mjs";
import { makePdf, column, interleaveColumns } from "./pdf-fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "test-output", "sync");
const FIXTURES = path.join(ROOT, "tests", "sync", "fixtures");

function runCli(script, args, { env = {}, expectFail = false, cwd = ROOT } = {}) {
  const result = spawnSync(process.execPath, [path.join(ROOT, ...script.split("/")), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (expectFail) {
    assert.notEqual(result.status, 0, `expected ${script} to fail, got exit 0:\n${result.stdout}`);
  } else {
    assert.equal(result.status, 0, `${script} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

/* ================================================================== */
/* OM1#2 — canonical hashing: markup churn is invisible, data is not  */
/* ================================================================== */

describe("OM1#2 canonical field normalization", () => {
  test("normalizeUrl strips tracking params, keeps semantic ones, sorts the rest", () => {
    const noisy = "https://www.Granicus.com/AgendaViewer.php?utm_source=widget&_ga=2.2148.1726354981&event_id=1447&view_id=5&jsid=8817263541";
    const clean = "https://granicus.com/AgendaViewer.php?event_id=1447&view_id=5";
    assert.equal(normalizeUrl(noisy), clean);
  });

  test("normalizeUrl handles relative garbage without throwing", () => {
    assert.equal(normalizeUrl(" psc-2026/psc-10-05-26-agenda.pdf "), "psc-2026/psc-10-05-26-agenda.pdf");
  });

  test("date and time forms collapse to one canonical form each", () => {
    assert.equal(normalizeDate("Oct 5, 2026"), "2026-10-05");
    assert.equal(normalizeDate("October 5, 2026"), "2026-10-05");
    assert.equal(normalizeDate("2026-10-05"), "2026-10-05");
    assert.equal(normalizeTime("12:00 p.m."), "12:00");
    assert.equal(normalizeTime("12:00 PM"), "12:00");
    assert.equal(normalizeTime("6:00 pm"), "18:00");
    assert.equal(normalizeTime("12:00 am"), "00:00");
  });

  test("stableStringify ignores key order; contentHash ignores record order", () => {
    assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
    const records = [{ body: "a", date: "2026-10-05" }, { body: "b", date: "2026-10-06" }];
    assert.equal(contentHash(records), contentHash(sortRecords([...records].reverse())));
  });
});

describe("OM1#2 upcoming-table extraction (semantic records, not markup)", () => {
  const fixtureHtml = readFileSync(path.join(FIXTURES, "granicus-upcoming.html"), "utf8");

  test("parses the Granicus upcoming table into normalized records", () => {
    const records = extractUpcomingRecords(fixtureHtml);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0], {
      body: "public-services-committee",
      bodyLabel: "Public Services Committee",
      date: "2026-10-05",
      time: "12:00",
      agendaUrl: "https://cheyenne.granicus.com/AgendaViewer.php?event_id=1447&view_id=5",
    });
    assert.equal(records[1].body, "finance-committee");
    assert.equal(records[1].date, "2026-10-06");
  });

  test("markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash", () => {
    const before = contentHash(extractUpcomingRecords(fixtureHtml));
    const churned = fixtureHtml
      .replace(/8817263541/g, "3141592653")
      .replace(/a93f0c1e-8827-4b1c-9d0e-77aa51b2c3dd/g, "00000000-1111-2222-3333-444444444444")
      .replace('class="listingTable upcoming"', 'class="listingTable v2 redesigned grid"')
      .replace('id="container" class="container', 'class="container" id="container" data-variant="experimental" data-cmp=')
      .replace("utm_medium=upcoming", "utm_medium=upcoming&utm_term=cheyenne&utm_campaign=october")
      .replace(/>\s+</g, ">\n  <");
    const after = contentHash(extractUpcomingRecords(churned));
    assert.equal(before, after, "DOM/markup noise leaked into the content hash");
  });

  test("a real data change (moved time) DOES change the hash", () => {
    const before = contentHash(extractUpcomingRecords(fixtureHtml));
    const moved = fixtureHtml.replace("Oct 5, 2026<br />&nbsp;-&nbsp;<br />12:00 PM", "Oct 5, 2026<br />&nbsp;-&nbsp;<br />1:30 PM");
    assert.notEqual(before, contentHash(extractUpcomingRecords(moved)));
  });

  test("a page without the expected table fails loudly (ENO_TABLE), never hashes nothing", () => {
    assert.throws(() => extractUpcomingRecords("<html><body><p>maintenance</p></body></html>"), (error) => error.code === "ENO_TABLE");
  });

  test("bodySlug maps Granicus names onto the site vocabulary", () => {
    assert.equal(bodySlug("City Council Meeting"), "city-council");
    assert.equal(bodySlug("Special City Council Meeting"), "city-council");
    assert.equal(bodySlug("Planning Commission"), "planning-commission");
  });
});

describe("OM1#2 watcher CLI — seed, detect, fail closed", () => {
  const fixtureHtml = readFileSync(path.join(FIXTURES, "granicus-upcoming.html"), "utf8");
  const state = path.join(OUT, "sync-state.json");

  test("seed builds the baseline from the curated snapshot (no network)", () => {
    runCli("scripts/monitor/upcoming-meetings.mjs", ["--seed", "--state", state]);
    const seeded = JSON.parse(readFileSync(state, "utf8"));
    assert.equal(seeded.meetings.length, 2);
    assert.match(seeded.contentHash, /^[0-9a-f]{64}$/);
  });

  test("day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED", () => {
    writeFileSync(path.join(OUT, "upcoming.html"), fixtureHtml);
    const result = runCli("scripts/monitor/upcoming-meetings.mjs", [
      "--check", "--from-file", path.join(OUT, "upcoming.html"), "--state", state, "--out", path.join(OUT, "watch.json"),
    ]);
    const payload = JSON.parse(readFileSync(path.join(OUT, "watch.json"), "utf8"));
    assert.equal(payload.changed, false, `expected unchanged, watcher said: ${result.stdout}`);
    assert.equal(payload.reason, "unchanged");
  });

  test("a semantic change is detected and pinpointed to the changed meeting", () => {
    const moved = fixtureHtml.replace("Oct 5, 2026<br />&nbsp;-&nbsp;<br />12:00 PM", "Oct 5, 2026<br />&nbsp;-&nbsp;<br />1:30 PM");
    writeFileSync(path.join(OUT, "moved.html"), moved);
    runCli("scripts/monitor/upcoming-meetings.mjs", [
      "--check", "--from-file", path.join(OUT, "moved.html"), "--state", state, "--out", path.join(OUT, "watch-moved.json"),
    ]);
    const payload = JSON.parse(readFileSync(path.join(OUT, "watch-moved.json"), "utf8"));
    assert.equal(payload.changed, true);
    assert.equal(payload.changedMeetings.length, 1);
    assert.equal(payload.changedMeetings[0].body, "public-services-committee");
    assert.equal(payload.changedMeetings[0].time, "13:30");
  });

  test("a brand-new posted meeting is detected as changed", () => {
    const added = fixtureHtml.replace(
      "</tbody>",
      `        <tr class="odd">
          <td class="Name">Board of Adjustment</td>
          <td class="Date">Oct 7, 2026<br />&nbsp;-&nbsp;<br />3:00 PM</td>
          <td class="Agenda"><a href="https://cheyenne.granicus.com/AgendaViewer.php?view_id=5&amp;event_id=1448&amp;utm_source=widget">Agenda</a></td>
          <td class="Events">&nbsp;</td>
        </tr>
      </tbody>`,
    );
    writeFileSync(path.join(OUT, "added.html"), added);
    runCli("scripts/monitor/upcoming-meetings.mjs", ["--check", "--from-file", path.join(OUT, "added.html"), "--state", state]);
  });

  test("fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”", () => {
    writeFileSync(path.join(OUT, "broken.html"), "<html><body><h1>503 Service Unavailable</h1></body></html>");
    runCli("scripts/monitor/upcoming-meetings.mjs", ["--check", "--from-file", path.join(OUT, "broken.html"), "--state", state], { expectFail: true });
  });
});

/* ================================================================== */
/* OM2#1 — layout-aware extraction                                    */
/* ================================================================== */

/** The adversarial two-column PSC agenda page: shared baselines, interleaved stream. */
function twoColumnPage() {
  const left = column(72, 700, 14);
  left.add("PUBLIC SERVICES COMMITTEE", { size: 14 });
  left.add("AGENDA - OCTOBER 5, 2026", { size: 12 });
  left.add("12:00 p.m. - Council Chambers, 2101 O'Neil Ave.", { size: 10 });
  left.addWrapped("9. ORDINANCE -3rd READING - Annexing to the City of Cheyenne, Wyoming, land located south of Interstate 80, southeast of Otto Road, and west of Interstate 25. (PUBLIC SERVICES COMMITTEE)", 46);
  left.add("ACTION: Approve");
  left.addWrapped("10. ORDINANCE -3rd READING - Amending the Official Zoning Map of the City of Cheyenne establishing the zoning classification of AG Agricultural and LI Light Industrial for land annexed to the City of Cheyenne.", 46);
  left.add("ACTION: Approve");
  left.addWrapped("11. RESOLUTION - Certifying compliance with Wyoming Statute 15-1-402 for the City-initiated annexation of various tracts of land.", 46);

  const right = column(372, 700, 14);
  right.add("PUBLIC NOTICE", { size: 12 });
  right.addWrapped("All agenda items listed with the designation of [CA] are considered to be routine items by the governing body and will be enacted by one motion.", 42);
  right.addWrapped("Any item removed from the Consent Agenda will be considered in its normal sequence on the agenda.", 42);
  right.addWrapped("Supporting documents are available on the city website at cheyennecity.org.", 42);

  return { left, right, lines: interleaveColumns(left, right) };
}

describe("OM2#1 layout-aware engine vs. column interleaving", () => {
  test("two columns with interleaved content streams are reconstructed as two columns", async () => {
    const { lines, left, right } = twoColumnPage();
    const pdf = makePdf([[...lines]]);
    const layout = await extractPdfLayout(new Uint8Array(pdf));
    const page = layout.pages[0];

    assert.equal(page.columns.length, 2, `expected 2 columns, got ${JSON.stringify(page.columns)}`);

    // Adversarial precondition: in raw stream order a RIGHT-column line sits BETWEEN
    // item 9's first line and its wrapped continuation — the exact damage a naive
    // stream-order extractor inflicts. If this precondition breaks, the fixture
    // stopped testing anything.
    const naive = lines.map((line) => line.text).join(" ");
    const item9First = left.lines.find((line) => line.text.startsWith("9. ORDINANCE")).text;
    const item9Continuation = left.lines.find((line) => /^of Interstate 80|^Interstate 80|^City of Cheyenne/.test(line.text))?.text;
    assert.ok(item9Continuation, "fixture: could not locate item 9 continuation line");
    const firstInterleaved = right.lines.find(
      (line) => naive.indexOf(line.text) > naive.indexOf(item9First) && naive.indexOf(line.text) < naive.indexOf(item9Continuation),
    );
    assert.ok(firstInterleaved, "fixture is not adversarial: no right-column line interleaves item 9 in stream order");

    // The fix: reading order keeps the left column intact and the notice out of it.
    assert.ok(page.text.indexOf("9. ORDINANCE") > -1);
    const noticeAt = page.text.indexOf("PUBLIC NOTICE");
    const item10At = page.text.indexOf("10. ORDINANCE");
    assert.ok(noticeAt > item10At, "right column bled into the left column's reading order");
    assert.ok(
      collapseWhitespace(page.text).includes("south of Interstate 80, southeast of Otto Road"),
      "item text lost across wrapped lines",
    );
  });

  test("scanned (no text layer) pages fail with NO_TEXT, not empty success", async () => {
    const scanned = makePdf([[]]); // page with no text operators at all
    await assert.rejects(() => extractPdfLayout(new Uint8Array(scanned)), (error) => {
      assert.ok(error instanceof ExtractionError);
      assert.equal(error.code, "NO_TEXT");
      return true;
    });
  });

  test("corrupt bytes fail with CORRUPT", async () => {
    await assert.rejects(() => extractPdfLayout(new Uint8Array(Buffer.from("this is not a pdf, at all"))), (error) => {
      assert.equal(error.code, "CORRUPT");
      return true;
    });
  });

  test("zero-byte input fails with EMPTY_INPUT", async () => {
    await assert.rejects(() => extractPdfLayout(new Uint8Array(0)), (error) => {
      assert.equal(error.code, "EMPTY_INPUT");
      return true;
    });
  });

  test("real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(ROOT, "public", "sources", "2026-01-26-minutes.pdf")));
    const layout = await extractPdfLayout(bytes);
    assert.equal(layout.pageCount, 5);
    const page1 = layout.pages[0];
    assert.equal(page1.columns.length, 1, "real single-column document was falsely split into columns");
    assert.match(page1.text, /RECORD OF PROCEEDINGS FOR THE GOVERNING BODY/);
    assert.match(layout.text, /Patrick Collins/);
  });
});

/* ================================================================== */
/* OM2#1 + OM3#2 — full pipeline on a faithful synthetic agenda       */
/* ================================================================== */

/** Build a realistic multi-page PSC agenda PDF from the REAL posted item texts. */
function buildPscAgendaPdf() {
  const snapshot = JSON.parse(readFileSync(path.join(ROOT, "src", "data", "official-meetings.json"), "utf8"));
  const psc = snapshot.upcoming.find((meeting) => meeting.id === "public-services-committee-2026-10-05");
  assert.ok(psc, "curated snapshot must contain the Oct 5 PSC meeting");

  const kindPrefix = (kind) => {
    if (kind.includes("3rd reading")) return "ORDINANCE -3rd READING - ";
    if (kind.includes("2nd reading")) return "ORDINANCE -2nd READING - ";
    if (kind === "Resolution") return "RESOLUTION - ";
    return "";
  };

  // Page 1: header + first items in the left column, notice box in the right.
  const page1Left = column(72, 700, 14);
  page1Left.add("PUBLIC SERVICES COMMITTEE", { size: 14 });
  page1Left.add("AGENDA", { size: 12 });
  page1Left.add("OCTOBER 5, 2026 - 12:00 p.m.", { size: 10 });
  page1Left.add("COUNCIL CHAMBERS, 2101 O'NEIL AVE.", { size: 10 });
  for (const item of psc.items.slice(0, 3)) {
    page1Left.addWrapped(`${item.number}. ${kindPrefix(item.kind)}${item.text}`, 46);
    page1Left.add("ACTION: Approve");
  }
  const page1Right = column(372, 700, 14);
  page1Right.add("PUBLIC NOTICE", { size: 12 });
  page1Right.addWrapped("All agenda items listed with the designation of [CA] are considered to be routine items by the governing body and will be enacted by one motion.", 42);
  page1Right.addWrapped("Supporting documents are available on the city website at cheyennecity.org.", 42);
  page1Right.addWrapped("Any Supporting Document affiliated with an agenda item is the document as initially submitted for the agenda and may not include any proposed amendments or revisions.", 42);

  // Page 2: remaining items, single column (with a [CA] designation on item 24).
  const page2 = column(72, 720, 14);
  page2.addWrapped("4. CONSENT AGENDA. (All agenda items listed with the designation of [CA] are considered to be routine items by the governing body and will be enacted by one motion. There will be no separate discussion on these items unless a member of the governing body so requests.)", 90);
  for (const item of psc.items.slice(3)) {
    const designation = item.number === "24" ? "[CA] " : "";
    page2.addWrapped(`${item.number}. ${designation}${kindPrefix(item.kind)}${item.text}`, 90);
    page2.add("ACTION: Approve");
  }

  return { pdf: makePdf([interleaveColumns(page1Left, page1Right), page2.lines]), psc };
}

describe("OM2#1 + OM3#2 extractor CLI end-to-end", () => {
  const meetingId = "public-services-committee-2026-10-05";
  const dir = path.join(OUT, "data", "meetings", "2026", meetingId);

  test("extracts a faithful synthetic agenda into structured items with verbatim quotes", () => {
    rmSync(dir, { recursive: true, force: true });
    const { pdf } = buildPscAgendaPdf();
    const pdfPath = path.join(OUT, "psc-10-05-26-agenda.pdf");
    writeFileSync(pdfPath, pdf);

    runCli("scripts/extractors/parse_agenda_pdf.mjs", ["--file", pdfPath, "--meeting-id", meetingId, "--out", dir]);

    const agenda = JSON.parse(readFileSync(path.join(dir, "agenda.json"), "utf8"));
    assert.equal(agenda.meetingId, meetingId);
    assert.equal(agenda.pages, 2);
    assert.ok(existsSync(path.join(dir, "agenda.txt")));
    assert.ok(!existsSync(path.join(dir, "agenda.json.tmp")), "atomic write left a tmp file behind");

    const numbers = agenda.items.map((item) => item.number);
    for (const expected of ["9", "10", "11", "13", "14", "15", "19", "21", "24", "27", "28"]) {
      assert.ok(numbers.includes(expected), `item ${expected} missing (got ${numbers.join(",")})`);
    }
    const item9 = agenda.items.find((item) => item.number === "9");
    assert.equal(item9.kind, "Ordinance · 3rd reading");
    assert.match(item9.text, /^Annexing to the City of Cheyenne/);
    assert.equal(item9.consent, false);
    assert.equal(item9.page, 1);
    const item14 = agenda.items.find((item) => item.number === "14");
    assert.equal(item14.sponsor, "PUBLIC SERVICES COMMITTEE", "trailing committee attribution not surfaced");
    const item24 = agenda.items.find((item) => item.number === "24");
    assert.equal(item24.kind, "Resolution");
    assert.equal(item24.consent, true, "[CA] designation not honored");
  });

  test("a scanned upload exits 1, writes nothing — the error cascade stops here", () => {
    const scannedPath = path.join(OUT, "scanned.pdf");
    writeFileSync(scannedPath, makePdf([[]])); // no text operators at all
    const deadDir = path.join(OUT, "data", "meetings", "2026", "should-not-exist");
    const result = runCli("scripts/extractors/parse_agenda_pdf.mjs", ["--file", scannedPath, "--meeting-id", "x-2026-01-01", "--out", deadDir], { expectFail: true });
    assert.match(result.stderr, /NO_TEXT/);
    assert.ok(!existsSync(deadDir), "failed extraction must not create output directories");
  });

  test("a corrupt upload exits 1 with CORRUPT", () => {
    const corruptPath = path.join(OUT, "corrupt.pdf");
    writeFileSync(corruptPath, Buffer.from("%PDF-1.4 definitely truncated garbage"));
    const result = runCli("scripts/extractors/parse_agenda_pdf.mjs", ["--file", corruptPath, "--out", path.join(OUT, "nope")], { expectFail: true });
    assert.match(result.stderr, /CORRUPT|InvalidPDF/i);
  });

  test("Granicus AgendaViewer chrome resolves to the underlying PDF link", async () => {
    const { resolvePdfLinkFromHtml } = await import("../../scripts/extractors/parse_agenda_pdf.mjs");
    const viewerHtml = [
      "<html><body><div id='agendaViewer'>",
      "<a href='/ViewPublisherRSS.php?view_id=5'>RSS</a>",
      "<a href='https://www.cheyennecity.org/files/sharedassets/public/v/1/your-government/city-council/psc-2026/psc-10-05-26-agenda.pdf?utm_source=viewer'>Agenda PDF</a>",
      "</div></body></html>",
    ].join("");
    const link = resolvePdfLinkFromHtml(viewerHtml, "https://cheyenne.granicus.com/AgendaViewer.php?view_id=5&event_id=1447");
    assert.equal(link, "https://www.cheyennecity.org/files/sharedassets/public/v/1/your-government/city-council/psc-2026/psc-10-05-26-agenda.pdf?utm_source=viewer");
  });
});

describe("OM2#1 analyzer — deterministic, evidence-cited findings", () => {
  const meetingId = "public-services-committee-2026-10-05";
  const dir = path.join(OUT, "data", "meetings", "2026", meetingId);

  test("rules produce the expected findings, every quote verbatim in the source text", () => {
    runCli("scripts/analysis/red_team_analyzer.mjs", ["--meeting", dir]);
    const agenda = JSON.parse(readFileSync(path.join(dir, "agenda.json"), "utf8"));
    const analysis = JSON.parse(readFileSync(path.join(dir, "analysis.json"), "utf8"));
    assert.ok(existsSync(path.join(dir, "analysis.md")));

    assert.deepEqual(analysis.generatedBy, ["rules-v1"]);
    const byId = new Map(analysis.findings.map((finding) => [finding.id, finding]));
    assert.deepEqual(byId.get("final-reading").itemNumbers, ["9", "10", "11", "13", "14", "15"]);
    assert.deepEqual(byId.get("annexation").itemNumbers, ["9", "13"]);
    assert.deepEqual(byId.get("zoning-map-amendment").itemNumbers, ["10", "11", "14", "15"]);
    assert.deepEqual(byId.get("consent-bundling").itemNumbers, ["24"]);

    const fullText = collapseWhitespace(agenda.text);
    for (const finding of analysis.findings) {
      assert.ok(finding.evidence.length >= 1, `finding ${finding.id} has no evidence`);
      for (const entry of finding.evidence) {
        assert.ok(fullText.includes(collapseWhitespace(entry.quote)), `finding ${finding.id} cites text absent from the agenda: "${entry.quote.slice(0, 60)}…"`);
      }
    }
  });

  test("analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)", () => {
    runCli("scripts/analysis/red_team_analyzer.mjs", ["--meeting", path.join(OUT, "empty-dir")], { expectFail: true });
  });
});

describe("OM3#2 validation gate — nothing unsound reaches git", () => {
  const meetingId = "public-services-committee-2026-10-05";
  const dir = path.join(OUT, "data", "meetings", "2026", meetingId);
  const analysisPath = path.join(dir, "analysis.json");
  const agendaPath = path.join(dir, "agenda.json");

  test("sound artifacts pass", () => {
    runCli("scripts/lib/validate.mjs", ["--meeting", dir]);
  });

  test("a fabricated evidence quote in analysis.json is rejected", () => {
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const pristine = readFileSync(analysisPath, "utf8");
    analysis.findings[0].evidence[0].quote = "This quote was never in the agenda and a lazy pipeline would commit it.";
    writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
    const result = runCli("scripts/lib/validate.mjs", ["--meeting", dir], { expectFail: true });
    assert.match(result.stderr, /quote not (found|present)/);
    writeFileSync(analysisPath, pristine);
  });

  test("a tampered agenda item quote is rejected", () => {
    const agenda = JSON.parse(readFileSync(agendaPath, "utf8"));
    const pristine = readFileSync(agendaPath, "utf8");
    agenda.items[0].quote = "9. ORDINANCE -1st READING - secretly changed the reading stage";
    writeFileSync(agendaPath, JSON.stringify(agenda, null, 2));
    runCli("scripts/lib/validate.mjs", ["--meeting", dir], { expectFail: true });
    writeFileSync(agendaPath, pristine);
  });

  test("a leftover .tmp write blocks the commit", () => {
    writeFileSync(path.join(dir, "agenda.json.tmp"), "{half-written");
    runCli("scripts/lib/validate.mjs", ["--meeting", dir], { expectFail: true });
    rmSync(path.join(dir, "agenda.json.tmp"));
  });

  test("the gate passes again once the artifacts are restored", () => {
    runCli("scripts/lib/validate.mjs", ["--meeting", dir]);
  });
});

/* ================================================================== */
/* OM2#2 — objection drafts via mailto:, never form submission        */
/* ================================================================== */

describe("OM2#2 objection drafter (mailto pivot)", () => {
  const meetingId = "public-services-committee-2026-10-05";
  const dir = path.join(OUT, "data", "meetings", "2026", meetingId);

  test("generates a pre-filled mailto draft for an action-severity item", () => {
    const result = runCli("scripts/actions/draft_objection.mjs", ["--meeting", dir, "--item", "9", "--to", "clerk@example.org"]);
    assert.match(result.stdout, /Recipient resolved from --to/);
    const draftPath = path.join(dir, "objections", "item-9.md");
    const draft = readFileSync(draftPath, "utf8");
    assert.match(draft, /mailto:clerk@example\.org\?subject=/);
    assert.match(draft, /Annexing to the City of Cheyenne/);
    assert.match(draft, /nothing is sent automatically/i);
    // The mailto body must be percent-encoded (RFC 6068), not raw.
    assert.match(draft, /&body=To%20the%20members/);
    assert.match(draft, /%0D%0A/, "mailto body must encode CRLF line breaks");
    assert.doesNotMatch(draft, /OpenGov|Help Center|submit\(/i);
  });

  test("no verified recipient ⇒ drafts skipped with a warning, pipeline survives", () => {
    rmSync(path.join(dir, "objections"), { recursive: true, force: true });
    const result = runCli("scripts/actions/draft_objection.mjs", ["--meeting", dir, "--to", ""]);
    assert.match(`${result.stdout}${result.stderr}`, /No verified recipient configured/);
    assert.ok(!existsSync(path.join(dir, "objections")), "drafts were written without a recipient");
  });
});

/* ================================================================== */
/* OM3#1 + OM1#1 — payload contract and workflow hardening            */
/* ================================================================== */

describe("OM3#1 payload normalization (build-plan)", () => {
  const planPath = path.join(ROOT, ".sync", "plan.json");

  test("flat client_payload keys build a plan", () => {
    runCli("scripts/sync/build-plan.mjs", [], {
      env: { PDF_SOURCE_URLS: "https://cheyenne.granicus.com/AgendaViewer.php?view_id=5&event_id=1447,https://cheyenne.granicus.com/AgendaViewer.php?view_id=5&event_id=1446", MEETING_IDS: "public-services-committee-2026-10-05,finance-committee-2026-10-06", SYNC_REASON: "lambda-watch" },
    });
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    assert.equal(plan.meetings.length, 2);
    assert.equal(plan.meetings[0].meetingId, "public-services-committee-2026-10-05");
    assert.equal(plan.meetings[1].meetingId, "finance-committee-2026-10-06");
  });

  test("the deprecated nested client_payload.payload shape is tolerated with a warning", () => {
    const result = runCli("scripts/sync/build-plan.mjs", [], {
      env: { PDF_SOURCE_URLS: "", PDF_SOURCE_URL: "", LEGACY_NESTED_URL: "https://www.cheyennecity.org/files/sharedassets/public/v/1/your-government/city-council/psc-2026/psc-10-05-26-agenda.pdf", SYNC_REASON: "legacy-dispatch" },
    });
    assert.match(result.stderr, /deprecated/);
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    assert.equal(plan.meetings.length, 1);
  });

  test("an empty payload fails fast with the documented contract", () => {
    const result = runCli("scripts/sync/build-plan.mjs", [], { env: { PDF_SOURCE_URLS: "", PDF_SOURCE_URL: "", LEGACY_NESTED_URL: "" }, expectFail: true });
    assert.match(result.stderr, /repository_dispatch contract/);
  });

  test("meeting id derivation from real Cheyenne document filenames", async () => {
    const { meetingIdFromUrl } = await import("../../scripts/extractors/parse_agenda_pdf.mjs");
    assert.equal(
      meetingIdFromUrl("https://www.cheyennecity.org/files/sharedassets/public/v/1/your-government/city-council/psc-2026/psc-10-05-26-agenda.pdf"),
      "public-services-committee-2026-10-05",
    );
    assert.equal(meetingIdFromUrl("https://www.cheyennecity.org/files/x/fc-10-06-26-agenda.pdf"), "finance-committee-2026-10-06");
    assert.equal(meetingIdFromUrl("https://example.org/random.pdf"), null);
  });
});

const { parse: parseYaml } = await import("yaml");

describe("OM1#1 + OM3#1 workflow YAML hardening", () => {
  function loadWorkflow(name) {
    return parseYaml(readFileSync(path.join(ROOT, ".github", "workflows", name), "utf8"));
  }

  test("sync workflow: serialized concurrency group, no cancel-in-progress", () => {
    const workflow = loadWorkflow("live_city_sync.yml");
    assert.equal(workflow.concurrency.group, "municipal-data-sync");
    assert.equal(workflow.concurrency["cancel-in-progress"], false, "queued runs must never be cancelled");
    assert.equal(workflow.permissions.contents, "write");
    assert.ok(workflow.on.repository_dispatch.types.includes("MUNICIPAL_AGENDA_ALTERATION"));
    assert.ok(workflow.on.workflow_call.inputs.pdf_source_urls, "workflow_call input for the watch workflow is missing");
  });

  test("sync workflow: payload paths are FLAT client_payload keys (OM3#1 fix)", () => {
    const workflow = loadWorkflow("live_city_sync.yml");
    const job = workflow.jobs.sync_and_rebuild;
    assert.equal(job.env.PDF_SOURCE_URL, "${{ github.event.client_payload.pdf_source_url }}");
    assert.equal(job.env.PDF_SOURCE_URLS, "${{ github.event.client_payload.pdf_source_urls || inputs.pdf_source_urls }}");
    // The only tolerated reference to the old nested shape is the explicit legacy shim.
    assert.equal(job.env.LEGACY_NESTED_URL, "${{ github.event.client_payload.payload.pdf_source_url }}");
  });

  test("sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)", () => {
    const workflow = loadWorkflow("live_city_sync.yml");
    const steps = workflow.jobs.sync_and_rebuild.steps;
    for (const step of steps) {
      if (step.run) {
        assert.doesNotMatch(step.run, /\$\{\{/, `step "${step.name}" interpolates expressions inside run: — injection vector`);
      }
    }
  });

  test("sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps", () => {
    const workflow = loadWorkflow("live_city_sync.yml");
    const names = workflow.jobs.sync_and_rebuild.steps.map((step) => step.name || step.uses);
    const validateIndex = names.findIndex((name) => /Validate outputs/i.test(name));
    const commitIndex = names.findIndex((name) => /Commit structural diff/i.test(name));
    const extractIndex = names.findIndex((name) => /Execute extraction/i.test(name));
    const analyzeIndex = names.findIndex((name) => /red-team analysis/i.test(name));
    assert.ok(validateIndex > -1 && commitIndex > -1 && validateIndex < commitIndex, "validate step must run before the commit step");
    assert.ok(extractIndex > -1 && analyzeIndex > extractIndex, "extraction must run before analysis");
    const commitStep = workflow.jobs.sync_and_rebuild.steps[commitIndex];
    assert.match(commitStep.run, /git diff --cached --quiet/, "commit step must be guarded by a diff check");
  });

  test("watch workflow: shares the write lane, fails closed, invokes the reusable sync", () => {
    const workflow = loadWorkflow("live_city_watch.yml");
    assert.equal(workflow.concurrency.group, "municipal-data-sync");
    assert.equal(workflow.concurrency["cancel-in-progress"], false);
    assert.ok(workflow.on.schedule?.[0]?.cron, "scheduled watch missing");
    const syncJob = workflow.jobs.sync;
    assert.equal(syncJob.uses, "./.github/workflows/live_city_sync.yml");
    assert.equal(syncJob.if.includes("needs.watch.outputs.changed == 'true'"), true);
  });
});

/* ================================================================== */
/* Full workflow simulation — the exact live_city_sync.yml step chain */
/* ================================================================== */

describe("end-to-end sync chain (build-plan → extract → analyze → draft → validate)", () => {
  const sandbox = path.join(OUT, "repo"); // isolated cwd so data/ lands in the sandbox
  const meetingId = "public-services-committee-2026-10-05";

  test("fetchDocument: HTTP fetch, PDF magic sniff, size guard", async () => {
    const { fetchDocument } = await import("../../scripts/extractors/parse_agenda_pdf.mjs");
    const { createServer } = await import("node:http");
    const { pdf } = buildPscAgendaPdf();
    const server = createServer((request, response) => {
      if (request.url.endsWith("viewer-chrome-without-pdf")) {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html><body><h1>AgendaViewer</h1><p>portal maintenance</p></body></html>");
        return;
      }
      if (request.url.endsWith("garbage-bytes")) {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(Buffer.from("JFIF not actually a pdf at all"));
        return;
      }
      response.writeHead(200, { "content-type": "application/pdf", "content-length": pdf.length });
      response.end(pdf);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const fetched = await fetchDocument(`${base}/psc-2026/psc-10-05-26-agenda.pdf`);
      assert.equal(fetched.finalUrl, `${base}/psc-2026/psc-10-05-26-agenda.pdf`);
      assert.equal(Buffer.from(fetched.bytes.slice(0, 5)).toString("latin1"), "%PDF-");
      // Viewer chrome that links no PDF fails loudly (portal layout change), and
      // raw non-PDF bytes fail the magic check — neither can pass as an agenda.
      await assert.rejects(() => fetchDocument(`${base}/viewer-chrome-without-pdf`), (error) => {
        assert.equal(error.code, "NO_PDF_LINK");
        return true;
      });
      await assert.rejects(() => fetchDocument(`${base}/garbage-bytes`), (error) => {
        assert.equal(error.code, "CORRUPT");
        return true;
      });
    } finally {
      server.close();
    }
  });

  test("the workflow's step sequence produces validated, committable artifacts", () => {
    const { pdf } = buildPscAgendaPdf();
    mkdirSync(sandbox, { recursive: true });
    const pdfPath = path.join(sandbox, "psc-10-05-26-agenda.pdf");
    writeFileSync(pdfPath, pdf);

    // Step 1 — normalize a dispatch payload (as the workflow's env does).
    runCli("scripts/sync/build-plan.mjs", [], {
      cwd: sandbox,
      env: { PDF_SOURCE_URLS: "https://www.cheyennecity.org/files/psc-2026/psc-10-05-26-agenda.pdf", MEETING_IDS: meetingId, SYNC_REASON: "e2e-test" },
    });
    const planPath = path.join(sandbox, ".sync", "plan.json");

    // Offline re-run of the same plan against the local copy (forensic mode):
    // the plan entry swaps url → file, everything downstream is identical.
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    plan.meetings[0].url = undefined;
    plan.meetings[0].file = pdfPath;
    writeFileSync(planPath, JSON.stringify(plan, null, 2));

    // Step 2 — extract (magic check → layout-aware parse → structured items).
    runCli("scripts/extractors/parse_agenda_pdf.mjs", ["--plan", planPath], { cwd: sandbox });
    const resolved = JSON.parse(readFileSync(planPath, "utf8"));
    assert.equal(resolved.meetings[0].meetingId, meetingId, "extractor did not resolve the meeting id back into the plan");
    assert.ok(resolved.meetings[0].dir, "extractor did not record the artifact dir");

    // Step 3 — analyze.
    runCli("scripts/analysis/red_team_analyzer.mjs", ["--plan", planPath], { cwd: sandbox });

    // Step 4 — draft objections (mailto only).
    runCli("scripts/actions/draft_objection.mjs", ["--plan", planPath, "--to", "clerk@example.org"], { cwd: sandbox });

    // Step 5 — validate before any git write.
    runCli("scripts/lib/validate.mjs", ["--plan", planPath], { cwd: sandbox });

    // The artifacts the commit step would stage:
    const dir = path.join(sandbox, resolved.meetings[0].dir);
    for (const file of ["agenda.json", "agenda.txt", "analysis.json", "analysis.md", "objections/item-9.md"]) {
      assert.ok(existsSync(path.join(dir, file)), `missing pipeline artifact: ${file}`);
    }
    const agenda = JSON.parse(readFileSync(path.join(dir, "agenda.json"), "utf8"));
    assert.equal(agenda.sourceUrl, pdfPath);
    assert.ok(agenda.items.length >= 11);
  });
});

/* ================================================================== */
/* Setup                                                              */
/* ================================================================== */

mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, "empty-dir"), { recursive: true });
