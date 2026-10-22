import test from "node:test";
import assert from "node:assert/strict";
import { validateCorpusRecord, assertPublishable } from "../../scripts/lib/corpus-schema.mjs";
const fixture = (changes = {}) => ({ schema_version: 1, record_id: "synthetic-only", source_system: "fixture", source_id: "fixture-1", source_version: "fixture-v1", document_type: "agenda", representation_kind: "excerpt", representation_note: "Synthetic excerpt, not a complete document", completeness: "partial", access_class: "public", publication_review: "approved", original_bytes_sha256: null, extracted_text_sha256: "a".repeat(64), event_date: null, date_conflicts: [], ...changes });
test("explicit unknown date and missing original bytes are allowed without fabrication", () => { const record = fixture(); assert.deepEqual(validateCorpusRecord(record), []); assert.equal(assertPublishable(record), record); });
for (const changes of [{ schema_version: 2 }, { source_id: "" }, { source_version: "" }, { representation_kind: "verbatim-probably" }, { original_bytes_sha256: "guess" }, { extracted_text_sha256: undefined }, { event_date: "2026-02-30", date_evidence: "fixture" }, { event_date: "2026-01-26" }, { event_date: "2026-01-26", date_evidence: "fixture", date_conflicts: ["different date"] }, { date_conflicts: null }, { representation_note: "" }, { meeting_id: "city-council-2026-01-26", relationship_review: "candidate" }, { document_stage: "adopted" }]) {
  test(`reject invalid record: ${JSON.stringify(changes)}`, () => assert.ok(validateCorpusRecord(fixture(changes)).length));
}
for (const changes of [{ access_class: "private" }, { access_class: "restricted" }, { publication_review: "pending" }, { publication_review: "blocked" }, { completeness: "unknown" }, { extracted_text_sha256: null }, { representation_kind: "original-binary", original_bytes_sha256: null }]) {
  test(`block public export: ${JSON.stringify(changes)}`, () => assert.throws(() => assertPublishable(fixture(changes))));
}
test("verified meeting attachment can pass", () => assert.deepEqual(validateCorpusRecord(fixture({ meeting_id: "city-council-2026-01-26", relationship_review: "verified" })), []));
test("dated records with evidence can pass", () => assert.deepEqual(validateCorpusRecord(fixture({ event_date: "2026-01-26", date_evidence: "Synthetic header" })), []));
