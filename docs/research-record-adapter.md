# Legacy research record adapter

Candidate adapter: scripts/lib/research-record-adapter.mjs. Run node --test tests/provenance/research-record-adapter.test.mjs after the corpus-contract commit is present.

This adapter preserves existing record IDs and exact published text, recomputes the published-text SHA-256, and rejects missing/mismatched hashes, unsafe publisher URLs and duplicate IDs. It maps the legacy camelCase representation to the initial shared contract without claiming new original-document retrieval or a complete corpus migration.

Date as stated is retained separately. Verified event_date, meeting_id and original_bytes_sha256 remain null; document_stage is unknown. Spans address the published excerpt in UTF-16 positions, not an original PDF page. Excerpt scope and source limitations stay visible.

Default access_class=restricted and publication_review=pending are conservative review states, not a change to the sharing of already committed legacy records. The caller must explicitly supply any public/approved attestation after review. These options are not authentication, independent evidence verification or a substitute for the external write approval gate. No files, sharing settings, website pages or indexes are changed merely by calling the adapter.

Two actual committed legacy text hashes were checked in local tests. This does not verify the original PDFs or the full application. The generated candidate manifest is not connected to the browser and is not automatically published. Next.js build, project lint/typecheck, deployed behavior and the outstanding CI failure were not validated by this test suite.
