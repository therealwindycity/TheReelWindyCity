const HASH = /^[a-f0-9]{64}$/;
const KINDS = ["original-binary", "connector-text", "normalized-text", "excerpt", "summary"];
export function validateCorpusRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record must be an object"];
  if (record.schema_version !== 1) errors.push("schema_version must be 1");
  for (const key of ["record_id", "source_system", "source_id", "source_version", "document_type"]) {
    if (typeof record[key] !== "string" || !record[key].trim()) errors.push(`${key} is required`);
  }
  if (!KINDS.includes(record.representation_kind)) errors.push("invalid representation_kind");
  if (!["complete", "partial", "unknown"].includes(record.completeness)) errors.push("invalid completeness");
  if (!["public", "private", "restricted"].includes(record.access_class)) errors.push("invalid access_class");
  if (!["pending", "approved", "blocked"].includes(record.publication_review)) errors.push("invalid publication_review");
  for (const key of ["original_bytes_sha256", "extracted_text_sha256"]) {
    if (record[key] !== null && (typeof record[key] !== "string" || !HASH.test(record[key]))) errors.push(`${key} must be a SHA-256 or null`);
  }
  if (!Object.hasOwn(record, "event_date")) errors.push("event_date must be explicit, including null when unknown");
  if (record.event_date !== null && record.event_date !== undefined) {
    const value = record.event_date;
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) errors.push("invalid event_date");
    if (typeof record.date_evidence !== "string" || !record.date_evidence.trim()) errors.push("dated records need date_evidence");
  }
  if (!Array.isArray(record.date_conflicts)) errors.push("date_conflicts must be an array");
  else if (record.date_conflicts.length && record.event_date !== null) errors.push("unresolved date conflicts require null event_date");
  if ((record.completeness === "partial" || ["excerpt", "summary"].includes(record.representation_kind)) && (typeof record.representation_note !== "string" || !record.representation_note.trim())) errors.push("partial or derived records need representation_note");
  if (record.meeting_id != null && record.relationship_review !== "verified") errors.push("meeting attachment must be verified");
  if (record.document_stage === "adopted" && (typeof record.stage_evidence !== "string" || !record.stage_evidence.trim())) errors.push("adopted stage needs stage_evidence");
  return errors;
}
export function assertPublishable(record) {
  const errors = validateCorpusRecord(record);
  if (record?.access_class !== "public") errors.push("public export excludes private/restricted records");
  if (record?.publication_review !== "approved") errors.push("publication approval required");
  if (record?.completeness === "unknown") errors.push("publication needs explicit complete/partial scope");
  const key = record?.representation_kind === "original-binary" ? "original_bytes_sha256" : "extracted_text_sha256";
  if (!record?.[key]) errors.push(`publication requires ${key}`);
  if (errors.length) throw new Error(errors.join("; "));
  return record;
}
