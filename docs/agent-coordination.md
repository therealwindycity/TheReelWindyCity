# Parallel integration operating plan

## Handoff state: verify before editing
Repository: therealwindycity/TheReelWindyCity. Integration branch: arena/civic-build-center-2026-10-21. Baseline commit: a070cd3c9fe21a56d7604505a839e4d35dcaa1cc. Draft PR #25 adds five changes: two Urban Farm excerpts, research index/detail pages, a client explorer, and an Explore link. It is not a complete ingestion or intelligence platform.

On the latest observed checks for this baseline, checks jobs 119605036050 and 119604668960 failed, build 119604669338 failed, and deploy 119606990006 was skipped. Failure logs were not retrieved in the prior session; do not assume a cause. CI owner should obtain job logs/annotations using its authorized tools or reproduce locally. Do not ask the user to retrieve logs before exhausting agent-side capabilities.

The direct-Drive two-document batch and import-engine patches were prepared but not committed at this handoff. No notebook has been committed. Locally reported 21 import-engine tests do not validate the current PR. No full-corpus or deployed-site validation is complete.

## Claim and handoff protocol
The user or maintainer designates one coordinator/integrator. All task owners initially are unassigned. Consult coordination/tasks.json and current task issues/PRs before claiming. Coordinator acknowledges exactly one owner per task and overlapping path set. Do not assume first-comment-wins is atomic. If two agents claim the same work, stop conflicting edits until the coordinator resolves ownership. Registry updates belong to the coordinator; do not have every agent rewrite the same JSON.

Each worker uses agent/<agent-id>/<task-id> from an agreed integration SHA. Distinct worktrees; no shared index or working-directory mutations. Read shared inputs freely. Keep outputs in the task's paths; propose out-of-scope edits in a handoff rather than touching another owner's files. New dependencies, package-lock.json changes, schema changes and central index generation require coordination. Task PRs target the integration branch, not main. Integration merges remain subject to the maintainer's authorization and platform approval rules.

Handoff file: coordination/handoffs/<task-id>/<agent-id>.json. Include task_id, agent_id, base_sha, input_refs_and_hashes, changed_paths, output_commit, record_counts_by_stage, tests_run_with_results, unresolved_errors, privacy_review, next_dependencies and PR URL. Use source references, not private source content or credentials. Mark blocked promptly with exact missing capability and attempted alternatives. Do not invent a test result.

## Parallel workstreams and exclusive paths
- T00 coordinator/schema: AGENTS.md, this guide, coordination/tasks.json, schemas/corpus-v1.json and scripts/lib/corpus-schema.mjs. Ratify v1, allocate owners and serialize aggregate publication. Own shared dependency/lock updates after consultation.
- T01 CI/build: .github/workflows/, eslint.config.mjs, next.config.ts, tsconfig.json and reproduction fixtures under tests/ci/. Diagnose existing failures, then minimal fixes. Coordinate package.json/lock edits through T00. Never disable security or provenance gates.
- T02 inventory: scripts/inventory/, catalog/inventory/ and tests/inventory/. Enumerate authorized relevant Drive holdings with pagination and all eight known project repositories with pinned tree SHAs and truncation checks. Produce identities, duplicates, byte sizes, availability and provenance, not content-publication guesses. No private inventory in public paths.
- T03 ingestion: scripts/ingest/, catalog/batches/<batch-id>/, public/corpus/<batch-id>/ and tests/ingest/. Retrieve through available direct connectors, preserve actual extraction scope, handle formats/OCR where supported, record rejected and partial records, and prepare approved batches. Do not re-download another agent's completed source/version without a reason. Original binary unavailability must be explicit.
- T04 retrieval: scripts/index/, src/lib/search/, src/lib/vectorSearch.ts and tests/search/. Build partitioned lexical/semantic indexes over approved complete text, not silently sampled passages. Preserve exact source spans and index/source-version manifests. Report omissions and index age; rank scores are not factual confidence.
- T05 interface: src/app/research/, src/components/research-explorer.tsx and new research components/styles. Replace hardcoded two-record diagrams with data-driven source-backed views. Integrate search, graph and timeline; add maps only with verified geography. Provide empty/error/loading states and keyboard access. Do not edit central metadata/sitemap.
- T06 publication/SEO: src/app/sitemap.ts, src/app/robots.ts, root metadata changes coordinated with T00, and tests/seo-integration/. Canonical readable document pages, internal links, sitemap coverage, machine-readable text and build-size budgets. Crawlable does not mean indexed. No private data in browser JSON, vectors or downloads.
- T07 independent QA/provenance: tests/integration/, tests/provenance/ and coordination/reviews/. Cross-check source/version identities, date conflicts, caption overlap, duplicate counts, draft/adopted stages, access controls, generated assets and publication claims. Review worker outputs independently; do not own their implementation files.

## Shared resources and contract v1 proposal
Existing external sources: The-Real-Windy-City- plus cheyenne-archives-2008-2013, cheyenne-archives-2014-2017, cheyenne-archives-2018-2021, cheyenne-archives-2022, cheyenne-archives-2023-2024 and cheyenne-archives-2025-2026; owner therealwindycity. Keep these archives intact. Preserve local IDs with an adapter; do not pretend the current src/data/research-records.json already satisfies the proposed general schema.

T00 must ratify schema before workers produce final compatible outputs. Proposed fields: schema_version, record_id, source_system, source_id, publisher_url, source_version, original_bytes_sha256 (nullable), representation_kind, extracted_text_sha256, extraction_method/version, completeness, source_spans, document_type/stage, body_id, date_as_stated, event_date (nullable), date_evidence, date_conflicts, captured_at, meeting_id (nullable), relationship_review, duplicate_of, version_of, publication_review, access_class and public_paths. Source URL identity and content/version identity are separate. A normalized-text checksum is not an original-PDF checksum.

Relationships need edge_id, typed endpoints, predicate, evidence_record/version/span, method and review_status. Do not infer causation, guilt or a person's identity from co-occurrence. Do not treat filename attachment numbers as years. An unknown meeting match stays unresolved. Proposal text does not establish adoption; committee recommendations are not council decisions. Keep both event and harvest times.

Share immutable approved batches identified by source/version/hash, not a mutable mega-file or credentials. Agents publish their own task outputs; T00 assembles aggregate indexes once. Cache keys include source ID, source version and extractor version. Artifact retention and repository/site budgets must be explicit; avoid committing multi-gigabyte working databases or every intermediate embedding. A shared resource reference is not blanket publication approval.

## Sequence to reduce waiting
Wave 1 runs T00, T01, T02 and T07 fixture/review design concurrently. T03 can test extraction on already identified sources; T04/T05/T06 may build against clearly synthetic fixtures while awaiting the schema and real batches. Never publish fixtures as real records.

Wave 2: after T00 ratifies v1 and T02 supplies exact source identities, T03 delivers one reviewed real batch. T04 indexes that same batch, T05 consumes its relationships, T06 exposes its public pages, and T07 cross-checks all three in parallel. Prove one end-to-end slice before expensive corpus-wide extraction.

Wave 3: expand by disjoint repository/year/source batches; measure discovered, unique, extracted, approved, indexed and publicly reachable counts separately. Continue unresolved/rejected queues. Integrator rebuilds shared outputs only from accepted batch versions.

## Definition of done and release gate
Each task needs reproducible commands, input versions, outputs, tests and exclusions. Full integration needs traceable original/source references, readable approved text, consistent search/graph/timeline results, provenance and privacy checks, working failure states and measured export size.

CI owner runs npm ci, npm run lint, npm run typecheck, applicable test suites from package.json, npm run build, npm run test:seo and browser smoke tests with the actual GitHub Pages base path. Include schema/hash validation, empty/truncated extraction rejection, date-conflict cases, caption-overlap cases, duplicate/version counts, internal-link/base-path checks and tests that private records never reach public artifacts. Record exact test results and commit SHAs. Distinguish pre-existing failures from regressions by reproducing the baseline; do not guess.

No main merge or production deployment until all required checks pass on the integration candidate, independent provenance/privacy review completes, and the maintainer explicitly approves release. Verify deployed commit, public text, links and assets after deployment. Search Console evidence is needed before claiming Google indexing. This document does not launch agents, assign real accounts, create issues, implement locks or authorize paid infrastructure.
