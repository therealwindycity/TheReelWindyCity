import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const data = JSON.parse(readFileSync(new URL("../src/data/legal-cross-references.json", import.meta.url), "utf8"));
function loadTs(path, overrides = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const localRequire = (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name);
  new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
  return mod.exports;
}
const lib = loadTs("../src/lib/legal-cross-reference.ts", { "@/data/legal-cross-references.json": data, "@/data/legal-audit-generated.json": { meetings: {} }, "@/data/legal-evidence-generated.json": { meetings: {}, sources: {} }, "@/data/legal-support-generated.json": { meetings: {} } });
const component = loadTs("../src/components/legal-cross-reference.tsx", {
  "@/lib/legal-cross-reference": lib, "./legal-cross-reference.module.css": { panel: "panel", content: "content", caution: "caution", requirement: "requirement" },
});
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function render(props) { return renderToStaticMarkup(React.createElement(component.default, props)); }

test("curated reviews use unique exact keys and evidence-backed statuses", () => {
  const keys = new Set();
  assert.equal(data.items.length, 7);
  for (const review of data.items) {
    const key = `${review.meetingId}:${review.itemNumber}`;
    assert(!keys.has(key), `duplicate ${key}`); keys.add(key);
    assert.match(review.reviewedAt, /^\d{4}-\d\d-\d\d$/);
    assert(review.match && review.authorities.length && review.requirements.length);
    for (const authority of review.authorities) assert.match(authority.url, /^https:\/\//);
    for (const r of review.requirements) {
      assert(r.law && r.requirement && r.finding && r.next);
      assert(["unverified", "partial", "supported", "conflicting", "not-applicable"].includes(r.status));
      if (["partial", "supported", "conflicting", "not-applicable"].includes(r.status)) assert(r.evidence.length > 0, `${key}/${r.id} lacks evidence`);
      for (const evidence of r.evidence) assert.match(evidence.url, /^https:\/\//);
    }
  }
});

test("exact meeting, number, and text are all required; no keyword-only cross-contamination", () => {
  for (const r of data.items) {
    assert.equal(lib.findLegalReview(r.meetingId, Number(r.itemNumber), r.match.toUpperCase())?.title, r.title);
    assert.equal(lib.findLegalReview("city-council-2026-02-09", r.itemNumber, r.match), undefined);
    assert.equal(lib.findLegalReview(r.meetingId, "999", r.match), undefined);
    assert.equal(lib.findLegalReview(r.meetingId, r.itemNumber, "another agenda item"), undefined);
  }
});

test("review renders sources, evidence, status and caution; unmatched items remain unresearched", () => {
  const html = render({ meetingId: "city-council-2026-01-26", itemNumber: 9, text: "Accessory Dwelling Units" });
  for (const text of ["Partial review", "15-1-115", "Not verified", "Partial evidence", "Planning hearing date discrepancy", "not a finding of compliance or illegality"]) assert(html.includes(text), text);
  assert(html.includes("https://wyoleg.gov/statutes/compress/title15.pdf"));
  const unknown = render({ meetingId: "some-other-meeting", itemNumber: "7(a)", text: "Accessory Dwelling Units" });
  assert(unknown.includes("Automated check · unverified"));
  assert(unknown.includes("no finding of compliance or illegality"));
  assert(!unknown.includes("Planning hearing date discrepancy"));
});

test("January 26 captured agenda and subitems have unique numbers and all seven reviews attach", () => {
  const agenda = JSON.parse(readFileSync(new URL("../src/data/jan-26-agenda-items.json", import.meta.url), "utf8"));
  assert.equal(agenda.length, 38);
  assert.equal(new Set(agenda.map((item) => item.number)).size, agenda.length);
  assert(agenda.some((item) => item.number === "18(a)"));
  assert(agenda.some((item) => item.number === "22(d)"));
  const matched = agenda.filter((item) => lib.findLegalReview("city-council-2026-01-26", item.number, item.text));
  assert.deepEqual(matched.map((item) => item.number), ["6", "7", "8", "9", "10", "11", "14"]);
});

test("automatic citation extraction is limited to explicit Wyoming citations", () => {
  assert.deepEqual(lib.citedWyomingStatutes("W.S. §§ 16-4-112 & 16-4-113."), ["16-4-112", "16-4-113"]);
  assert.deepEqual(lib.citedWyomingStatutes("Wyoming Statute §15-1-402"), ["15-1-402"]);
  assert.deepEqual(lib.citedWyomingStatutes("UDC section 15-1-402; 11-25-210"), []);
  const html = render({ meetingId: "city-council-2026-10-26", itemNumber: 16, kind: "Resolution", text: "Reappropriation under W.S. §§ 16-4-112 & 16-4-113.", sourceUrl: "https://cheyenne.granicus.com/test" });
  assert(html.includes("title16.pdf"));
  assert(html.includes("16-4-113"));
  assert(!html.includes("Candidate ordinance passage checks"));
  const ordinance = render({ meetingId: "city-council-2026-10-26", itemNumber: 6, kind: "Ordinance · 2nd reading", text: "Annexation" });
  assert(ordinance.includes("Candidate ordinance passage checks"));
  assert(!render({ meetingId: "finance-committee-2026-10-26", itemNumber: 6, kind: "Ordinance", text: "Annexation" }).includes("Candidate ordinance passage checks"));
});

test("timing conflicts are flagged for review, never treated as proven illegalities", () => {
  const evidence = [{reading:1,date:"2026-01-01",outcome:"not established"},{reading:3,date:"2026-01-09",outcome:"approval motion recorded as carried"}];
  assert.deepEqual(lib.potentialShortReadingInterval(evidence), {first:"2026-01-01",last:"2026-01-09",days:8});
  assert.equal(lib.potentialShortReadingInterval([{...evidence[0]}, {...evidence[1],date:"2026-01-11"}]),undefined);
  assert.equal(lib.potentialShortReadingInterval([{...evidence[0]}, {...evidence[1],outcome:"not established"}]),undefined);
});

test("matched evidence is guarded by exact agenda text and renders the source and caution", () => {
  const entry = {date:"2026-02-09",reading:3,outcome:"approval motion recorded as carried",excerpt:"Motion carried.",url:"https://cheyenne.granicus.com/minutes",transcription:null};
  const stub = { meetings:{"city-council-2026-01-26": {"99": {itemText:"ORDINANCE – text", evidence:[entry]}}},sources:{} };
  const withEvidence = loadTs("../src/lib/legal-cross-reference.ts", {"@/data/legal-cross-references.json":data,"@/data/legal-audit-generated.json":{meetings:{}},"@/data/legal-evidence-generated.json":stub,"@/data/legal-support-generated.json":{meetings:{}}});
  assert.equal(withEvidence.matchedMinutes("city-council-2026-01-26", 99, "different text").length,0);
  const view = loadTs("../src/components/legal-cross-reference.tsx", {"@/lib/legal-cross-reference":withEvidence,"./legal-cross-reference.module.css":{panel:"panel",content:"content",caution:"caution",requirement:"requirement"}});
  const html=renderToStaticMarkup(React.createElement(view.default,{meetingId:"city-council-2026-01-26",itemNumber:99,text:"ORDINANCE – text",kind:"Ordinance"}));
  assert(html.includes("https://cheyenne.granicus.com/minutes"));
  assert(html.includes("Possible text matches"));
  assert(html.includes("Motion carried"));
  assert(html.includes("vote threshold is not verified"));
});

test("supporting records require the original agenda text and display limitations and sources", () => {
  const doc={label:"Supporting Document",url:"https://cheyenne.granicus.com/MetaViewer.php?meta_id=123",origin:null,fetchedAt:"2026-01-26T00:00:00Z",lastAttempt:null,lastError:null,sha256:"abc",citations:["16-4-112"],snippets:[{topic:"notice",label:"Notice or service",excerpt:"Notice was not mailed."}]};
  const support={meetings:{"city-council-2026-10-26":{"99":{itemText:"Exact item",documents:[doc]}}}};
  const helper=loadTs("../src/lib/legal-cross-reference.ts",{"@/data/legal-cross-references.json":data,"@/data/legal-audit-generated.json":{meetings:{}},"@/data/legal-evidence-generated.json":{meetings:{},sources:{}},"@/data/legal-support-generated.json":support});
  assert.equal(helper.matchedSupportingRecords("city-council-2026-10-26",99,"different item").length,0);
  const view=loadTs("../src/components/legal-cross-reference.tsx",{"@/lib/legal-cross-reference":helper,"./legal-cross-reference.module.css":{panel:"panel",content:"content",caution:"caution",requirement:"requirement"}});
  const html=renderToStaticMarkup(React.createElement(view.default,{meetingId:"city-council-2026-10-26",itemNumber:99,text:"Exact item"}));
  assert(html.includes("Notice was not mailed."));
  assert(html.includes("not signed enactments or proof"));
  assert(html.includes("title16.pdf"));
});
test("budget review identifies an apparent rounded difference without asserting a violation", () => {
  const html=render({meetingId:"city-council-2026-01-26",itemNumber:11,text:"Re-appropriating the Fiscal Year 2026 Budget"});
  assert(html.includes("322,965,585") && html.includes("322,965,584"));
  assert(html.includes("does not establish an unlawful"));
  assert(html.includes("budget-officer-request branch"));
});
