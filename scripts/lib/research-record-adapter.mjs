import { createHash } from "node:crypto";
import { validateCorpusRecord } from "./corpus-schema.mjs";
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
export function adaptResearchRecord(legacy, { accessClass = "restricted", publicationReview = "pending" } = {}) {
  if (!legacy || typeof legacy !== "object" || !/^[a-z0-9][a-z0-9-]*$/.test(legacy.id ?? "")) throw new Error("Valid legacy record ID required");
  for (const key of ["title", "type", "text", "contentScope"]) if (typeof legacy[key] !== "string" || !legacy[key].trim()) throw new Error(`${key} required`);
  let publisher;
  try { publisher = new URL(legacy.sourceUrl); } catch { throw new Error("Valid publisher URL required"); }
  if (publisher.protocol !== "https:" || publisher.username || publisher.password || /token|signature|password|secret|credential/i.test(publisher.search)) throw new Error("Unsafe publisher URL");
  const actualHash = sha256(legacy.text);
  if (legacy.textSha256 !== actualHash) throw new Error(`Published-text hash mismatch: ${legacy.id}`);
  const record = {
    schema_version: 1, record_id: legacy.id, title: legacy.title,
    source_system: "legacy-research-extract", source_id: legacy.id, source_version: actualHash,
    publisher_url: publisher.href, representation_kind: "excerpt", completeness: "partial",
    representation_note: legacy.contentScope, original_bytes_sha256: null,
    extracted_text_sha256: actualHash, extraction_method: "Adapter preserves committed excerpt text without normalization",
    text: legacy.text, date_as_stated: legacy.date ?? null, event_date: null, date_evidence: null,
    date_status: legacy.dateStatus ?? "Independent event-date verification not supplied",
    date_conflicts: [], captured_at: legacy.harvestedAt ?? null,
    document_type: legacy.type, document_stage: "unknown", stage_evidence: null,
    meeting_id: null, relationship_review: "unreviewed", access_class: accessClass,
    publication_review: publicationReview,
    source_spans: [{ start: 0, end: legacy.text.length, basis: "published-excerpt UTF-16 offsets", pdf_page: null }],
    source_container_label: legacy.extractedFrom ?? null,
    page_status: legacy.pageStatus ?? "Original page not verified",
    outcome_status: legacy.outcomeStatus ?? "Final action not verified",
    original_retrieval_verified: false,
  };
  const errors = validateCorpusRecord(record);
  if (errors.length) throw new Error(errors.join("; "));
  return record;
}
export function adaptResearchManifest(manifest, options) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.records)) throw new Error("Unsupported legacy manifest");
  const records = manifest.records.map((record) => adaptResearchRecord(record, options));
  if (new Set(records.map((record) => record.record_id)).size !== records.length) throw new Error("Duplicate record IDs require review");
  return { schema_version: 1, source_coverage_note: manifest.coverage ?? "Coverage unspecified", records };
}
