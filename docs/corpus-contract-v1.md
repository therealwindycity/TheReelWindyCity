# Corpus contract v1: initial validation slice

Status: candidate for coordinator/maintainer review; not a claim that the legacy data or all worker outputs have migrated. Use scripts/lib/corpus-schema.mjs and node --test tests/provenance/corpus-schema.test.mjs.

Required identity fields: schema_version=1, record_id, source_system, source_id, source_version, document_type. Identity is not a claim about whether two people, source URLs or files are the same real-world object.

Required scope fields: representation_kind (original-binary, connector-text, normalized-text, excerpt, summary), completeness (complete, partial, unknown), access_class (public, private, restricted), publication_review (pending, approved, blocked), original_bytes_sha256 (SHA-256 or explicit null), extracted_text_sha256 (SHA-256 or explicit null), event_date (ISO calendar date or explicit null), date_conflicts (array).

A known event_date needs date_evidence. Unresolved date conflicts require a null event_date. Partial records, excerpts and summaries need representation_note. A meeting_id requires relationship_review=verified; otherwise retain the candidate match outside the canonical meeting_id. An adopted document_stage requires stage_evidence. These checks require recorded evidence/attestation; they do not independently verify that evidence.

assertPublishable additionally requires public access class, explicit approval, known complete/partial scope, and the hash of the representation being published. It does not grant publication permission, inspect raw contents for secrets, validate original PDF bytes, prove legal adoption, or calculate source hashes. Privacy review and integrity checks against actual bytes/text are separate gates.

The current two Urban Farm records use the older src/data/research-records.json format. Add an adapter in the ingestion workstream; do not relabel them complete or fabricate original hashes/dates to satisfy validation. This slice does not replace every proposed v1 field: source spans, publisher URL validation, full version/duplicate handling, review identity/timestamps, hash recomputation and relationship-edge schema remain next tasks.

## Triage findings

Integration snapshot: 491612784a0f8ec626802209dd0c3f23759ee083; production snapshot: 6ec2509c0771e01cdd323afb2ed364d6f8fce182. All tasks were unclaimed when inspected. PRs #22 (agenda/pipeline), #6 (sync pipeline) and #5 (SEO) overlap future work; inspect their current diffs before duplicating or cherry-picking changes.

PR #22 reports a pre-existing scanner versus Citizen Connect seed-total mismatch. The current scanner test source independently confirms that its history-summary assertion compares per-year scanner seed logs to ccArtifact.totals.all. Current seed values were not independently recomputed, and this has NOT been established as the cause of PR #25's current build failure. Do not change totals, delete assertions or claim the build fixed on this evidence alone.

The current PR checks and build failed, with deployment skipped. This schema slice does not fix that CI failure or authorize deployment. Test results for this slice apply only to its synthetic validation fixtures, not the full project.
