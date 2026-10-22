import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { adaptResearchManifest, adaptResearchRecord } from "../../scripts/lib/research-record-adapter.mjs";
import { assertPublishable, validateCorpusRecord } from "../../scripts/lib/corpus-schema.mjs";
const text = "Synthetic test excerpt only. No municipal event or legal finding is asserted.";
const fixture = (changes = {}) => ({ id: "fixture-record", title: "Fixture", type: "agenda", text, textSha256: createHash("sha256").update(text).digest("hex"), contentScope: "Selected excerpt", sourceUrl: "https://example.org/record.pdf", date: "2026-01-26", originalSha256: "b".repeat(64), ...changes });
test("default conversion is pending/restricted and retains original text", () => { const r = adaptResearchRecord(fixture()); assert.equal(r.text, text); assert.equal(r.access_class, "restricted"); assert.equal(r.publication_review, "pending"); assert.throws(() => assertPublishable(r)); });
test("source date is not promoted to independently verified event date", () => { const r = adaptResearchRecord(fixture()); assert.equal(r.date_as_stated, "2026-01-26"); assert.equal(r.event_date, null); assert.equal(r.meeting_id, null); assert.equal(r.document_stage, "unknown"); });
test("unverified original hash is not promoted", () => assert.equal(adaptResearchRecord(fixture()).original_bytes_sha256, null));
test("representation remains partial with excerpt-relative, not PDF, anchors", () => { const r = adaptResearchRecord(fixture()); assert.equal(r.completeness, "partial"); assert.equal(r.representation_kind, "excerpt"); assert.equal(r.source_spans[0].end, text.length); assert.equal(r.source_spans[0].pdf_page, null); });
for (const changes of [{ text: text + " changed" }, { textSha256: undefined }, { sourceUrl: "javascript:alert(1)" }, { sourceUrl: "https://example.org/?token=secret" }, { id: "../../bad" }, { contentScope: "" }]) test(`reject bad legacy input: ${JSON.stringify(changes)}`, () => assert.throws(() => adaptResearchRecord(fixture(changes))));
test("explicit caller approval can pass metadata publication gate", () => assert.doesNotThrow(() => assertPublishable(adaptResearchRecord(fixture(), { accessClass: "public", publicationReview: "approved" }))));
test("duplicate identities fail without silent merge", () => assert.throws(() => adaptResearchManifest({ schemaVersion: 1, records: [fixture(), fixture()] })));
test("unsupported input schema fails", () => assert.throws(() => adaptResearchManifest({ schemaVersion: 2, records: [] })));
test("actual committed research records convert with matching hashes", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../src/data/research-records.json", import.meta.url), "utf8"));
  const converted = adaptResearchManifest(manifest);
  assert.equal(converted.records.length, manifest.records.length);
  for (const r of converted.records) { assert.deepEqual(validateCorpusRecord(r), []); assert.equal(r.event_date, null); assert.equal(r.original_bytes_sha256, null); assert.equal(r.publication_review, "pending"); }
});
