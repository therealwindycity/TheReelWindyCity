### Command: `npm run test:ecosystem`
```text

> test:ecosystem
> node --test tests/wyoming-ecosystem.test.mjs

TAP version 13
# Subtest: catalog covers every Wyoming county and incorporated municipality
ok 1 - catalog covers every Wyoming county and incorporated municipality
  ---
  duration_ms: 0.51773
  type: 'test'
  ...
# Subtest: every seat, county, and coordinate is a real reference in Wyoming
ok 2 - every seat, county, and coordinate is a real reference in Wyoming
  ---
  duration_ms: 0.774226
  type: 'test'
  ...
# Subtest: Cheyenne stays the only live Granicus watcher
ok 3 - Cheyenne stays the only live Granicus watcher
  ---
  duration_ms: 0.124627
  type: 'test'
  ...
# Subtest: generated site map matches the catalog
ok 4 - generated site map matches the catalog
  ---
  duration_ms: 26.293158
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 67.863785
```
### Command: `npm run test:wyoming-watch`
```text

> test:wyoming-watch
> node --test tests/wyoming-watch.test.mjs

TAP version 13
# Subtest: the roster covers every government and does not invent a URL
ok 1 - the roster covers every government and does not invent a URL
  ---
  duration_ms: 0.861456
  type: 'test'
  ...
# Subtest: Agenda Center hashing ignores viewstate and rejects a Granicus table
ok 2 - Agenda Center hashing ignores viewstate and rejects a Granicus table
  ---
  duration_ms: 5.616401
  type: 'test'
  ...
# Subtest: a packet folder ignores a Granicus invoice and a single PDF
ok 3 - a packet folder ignores a Granicus invoice and a single PDF
  ---
  duration_ms: 0.47885
  type: 'test'
  ...
# Subtest: the runner does not fetch uncalibrated governments or Cheyenne
ok 4 - the runner does not fetch uncalibrated governments or Cheyenne
  ---
  duration_ms: 6.289204
  type: 'test'
  ...
# Subtest: host drift is structural and does not parse the foreign page
ok 5 - host drift is structural and does not parse the foreign page
  ---
  duration_ms: 0.376106
  type: 'test'
  ...
# Subtest: the scheduled workflow does not call the Cheyenne sync
ok 6 - the scheduled workflow does not call the Cheyenne sync
  ---
  duration_ms: 69.75436
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 153.863583
```
### Command: `npm run test:places`
```text

> test:places
> node --test tests/place-archives.test.mjs

TAP version 13
# Subtest: every government has its own archive repo name
ok 1 - every government has its own archive repo name
  ---
  duration_ms: 1.004422
  type: 'test'
  ...
# Subtest: document copy stays on the pinned host
ok 2 - document copy stays on the pinned host
  ---
  duration_ms: 4.034852
  type: 'test'
  ...
# Subtest: a directory-only town is not given an invented harvest URL
ok 3 - a directory-only town is not given an invented harvest URL
  ---
  duration_ms: 0.141643
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 70.238298
```
### Command: `npm run test:sync`
```text

> test:sync
> node --test tests/sync/sync-pipeline.test.mjs

TAP version 13
# Subtest: OM1\#2 canonical field normalization
    # Subtest: normalizeUrl strips tracking params, keeps semantic ones, sorts the rest
    ok 1 - normalizeUrl strips tracking params, keeps semantic ones, sorts the rest
      ---
      duration_ms: 5.436901
      type: 'test'
      ...
    # Subtest: normalizeUrl handles relative garbage without throwing
    ok 2 - normalizeUrl handles relative garbage without throwing
      ---
      duration_ms: 0.134603
      type: 'test'
      ...
    # Subtest: date and time forms collapse to one canonical form each
    ok 3 - date and time forms collapse to one canonical form each
      ---
      duration_ms: 0.368074
      type: 'test'
      ...
    # Subtest: stableStringify ignores key order; contentHash ignores record order
    ok 4 - stableStringify ignores key order; contentHash ignores record order
      ---
      duration_ms: 0.539542
      type: 'test'
      ...
    1..4
ok 1 - OM1\#2 canonical field normalization
  ---
  duration_ms: 7.058803
  type: 'suite'
  ...
# Subtest: OM1\#2 upcoming-table extraction (semantic records, not markup)
    # Subtest: parses the Granicus upcoming table into normalized records
    ok 1 - parses the Granicus upcoming table into normalized records
      ---
      duration_ms: 5.511424
      type: 'test'
      ...
    # Subtest: markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash
    ok 2 - markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash
      ---
      duration_ms: 1.796634
      type: 'test'
      ...
    # Subtest: a real data change (moved time) DOES change the hash
    ok 3 - a real data change (moved time) DOES change the hash
      ---
      duration_ms: 0.944211
      type: 'test'
      ...
    # Subtest: a page without the expected table fails loudly (ENO_TABLE), never hashes nothing
    ok 4 - a page without the expected table fails loudly (ENO_TABLE), never hashes nothing
      ---
      duration_ms: 0.406902
      type: 'test'
      ...
    # Subtest: bodySlug maps Granicus names onto the site vocabulary
    ok 5 - bodySlug maps Granicus names onto the site vocabulary
      ---
      duration_ms: 0.144968
      type: 'test'
      ...
    1..5
ok 2 - OM1\#2 upcoming-table extraction (semantic records, not markup)
  ---
  duration_ms: 9.09039
  type: 'suite'
  ...
# Subtest: OM1\#2 watcher CLI — seed, detect, fail closed
    # Subtest: seed builds the baseline from the curated snapshot (no network)
    ok 1 - seed builds the baseline from the curated snapshot (no network)
      ---
      duration_ms: 52.109036
      type: 'test'
      ...
    # Subtest: day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED
    ok 2 - day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED
      ---
      duration_ms: 56.72973
      type: 'test'
      ...
    # Subtest: a semantic change is detected and pinpointed to the changed meeting
    ok 3 - a semantic change is detected and pinpointed to the changed meeting
      ---
      duration_ms: 55.926522
      type: 'test'
      ...
    # Subtest: a brand-new posted meeting is detected as changed
    ok 4 - a brand-new posted meeting is detected as changed
      ---
      duration_ms: 55.800311
      type: 'test'
      ...
    # Subtest: fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”
    ok 5 - fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”
      ---
      duration_ms: 47.760798
      type: 'test'
      ...
    # Subtest: a portal outage is recorded as source-unavailable, never as an unchanged table
    ok 6 - a portal outage is recorded as source-unavailable, never as an unchanged table
      ---
      duration_ms: 8071.071836
      type: 'test'
      ...
    # Subtest: a change that already failed to sync is reported but not re-attempted inside the window
    ok 7 - a change that already failed to sync is reported but not re-attempted inside the window
      ---
      duration_ms: 113.112715
      type: 'test'
      ...
    # Subtest: the retry window expires and the change is attempted again
    ok 8 - the retry window expires and the change is attempted again
      ---
      duration_ms: 57.303986
      type: 'test'
      ...
    # Subtest: a marker for a different hash never suppresses a new change
    ok 9 - a marker for a different hash never suppresses a new change
      ---
      duration_ms: 56.130635
      type: 'test'
      ...
    # Subtest: without the tolerance flag a portal outage still fails closed
    ok 10 - without the tolerance flag a portal outage still fails closed
      ---
      duration_ms: 8079.752807
      type: 'test'
      ...
    1..10
ok 3 - OM1\#2 watcher CLI — seed, detect, fail closed
  ---
  duration_ms: 16646.194754
  type: 'suite'
  ...
# Subtest: OM2\#1 layout-aware engine vs. column interleaving
    # Subtest: two columns with interleaved content streams are reconstructed as two columns
    ok 1 - two columns with interleaved content streams are reconstructed as two columns
      ---
      duration_ms: 131.216262
      type: 'test'
      ...
    # Subtest: scanned (no text layer) pages fail with NO_TEXT, not empty success
    ok 2 - scanned (no text layer) pages fail with NO_TEXT, not empty success
      ---
      duration_ms: 1.861859
      type: 'test'
      ...
    # Subtest: corrupt bytes fail with CORRUPT
    ok 3 - corrupt bytes fail with CORRUPT
      ---
      duration_ms: 0.821204
      type: 'test'
      ...
    # Subtest: zero-byte input fails with EMPTY_INPUT
    ok 4 - zero-byte input fails with EMPTY_INPUT
      ---
      duration_ms: 0.089805
      type: 'test'
      ...
    # Subtest: real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text
    not ok 5 - real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text
      ---
      duration_ms: 0.188193
      type: 'test'
      location: '/home/runner/work/TheReelWindyCity/TheReelWindyCity/tests/sync/sync-pipeline.test.mjs:343:3'
      failureType: 'testCodeFailure'
      error: "ENOENT: no such file or directory, open '/home/runner/work/TheReelWindyCity/TheReelWindyCity/public/sources/2026-01-26-minutes.pdf'"
      code: 'ENOENT'
      stack: |-
        Object.openSync (node:fs:560:18)
        readFileSync (node:fs:444:35)
        TestContext.<anonymous> (file:///home/runner/work/TheReelWindyCity/TheReelWindyCity/tests/sync/sync-pipeline.test.mjs:344:34)
        Test.runInAsyncScope (node:async_hooks:214:14)
        Test.run (node:internal/test_runner/test:1047:25)
        Suite.processPendingSubtests (node:internal/test_runner/test:744:18)
        Test.postRun (node:internal/test_runner/test:1173:19)
        Test.run (node:internal/test_runner/test:1101:12)
        async Suite.processPendingSubtests (node:internal/test_runner/test:744:7)
      ...
    1..5
not ok 4 - OM2\#1 layout-aware engine vs. column interleaving
  ---
  duration_ms: 134.34153
  type: 'suite'
  location: '/home/runner/work/TheReelWindyCity/TheReelWindyCity/tests/sync/sync-pipeline.test.mjs:287:1'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: OM2\#1 + OM3\#2 extractor CLI end-to-end
    # Subtest: extracts a faithful synthetic agenda into structured items with verbatim quotes
    ok 1 - extracts a faithful synthetic agenda into structured items with verbatim quotes
      ---
      duration_ms: 159.044506
      type: 'test'
      ...
    # Subtest: a scanned upload exits 1, writes nothing — the error cascade stops here
    ok 2 - a scanned upload exits 1, writes nothing — the error cascade stops here
      ---
      duration_ms: 132.732387
      type: 'test'
      ...
    # Subtest: a corrupt upload exits 1 with CORRUPT
    ok 3 - a corrupt upload exits 1 with CORRUPT
      ---
      duration_ms: 122.306948
      type: 'test'
      ...
    # Subtest: Granicus AgendaViewer chrome resolves to the underlying PDF link
    ok 4 - Granicus AgendaViewer chrome resolves to the underlying PDF link
      ---
      duration_ms: 2.881096
      type: 'test'
      ...
    # Subtest: normalizes protocol-relative Granicus GeneratedAgendaViewer URLs and passes full structural validation
    ok 5 - normalizes protocol-relative Granicus GeneratedAgendaViewer URLs and passes full structural validation
      ---
      duration_ms: 114.331482
      type: 'test'
      ...
    1..5
ok 5 - OM2\#1 + OM3\#2 extractor CLI end-to-end
  ---
  duration_ms: 531.592524
  type: 'suite'
  ...
# Subtest: OM2\#1 analyzer — deterministic, evidence-cited findings
    # Subtest: rules produce the expected findings, every quote verbatim in the source text
    ok 1 - rules produce the expected findings, every quote verbatim in the source text
      ---
      duration_ms: 28.468464
      type: 'test'
      ...
    # Subtest: analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)
    ok 2 - analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)
      ---
      duration_ms: 24.342319
      type: 'test'
      ...
    1..2
ok 6 - OM2\#1 analyzer — deterministic, evidence-cited findings
  ---
  duration_ms: 52.921199
  type: 'suite'
  ...
# Subtest: OM3\#2 validation gate — nothing unsound reaches git
    # Subtest: sound artifacts pass
    ok 1 - sound artifacts pass
      ---
      duration_ms: 25.118557
      type: 'test'
      ...
    # Subtest: a fabricated evidence quote in analysis.json is rejected
    ok 2 - a fabricated evidence quote in analysis.json is rejected
      ---
      duration_ms: 25.342846
      type: 'test'
      ...
    # Subtest: a tampered agenda item quote is rejected
    ok 3 - a tampered agenda item quote is rejected
      ---
      duration_ms: 26.147094
      type: 'test'
      ...
    # Subtest: a leftover .tmp write blocks the commit
    ok 4 - a leftover .tmp write blocks the commit
      ---
      duration_ms: 26.495574
      type: 'test'
      ...
    # Subtest: the gate passes again once the artifacts are restored
    ok 5 - the gate passes again once the artifacts are restored
      ---
      duration_ms: 26.523087
      type: 'test'
      ...
    1..5
ok 7 - OM3\#2 validation gate — nothing unsound reaches git
  ---
  duration_ms: 129.871597
  type: 'suite'
  ...
# Subtest: OM2\#2 objection drafter (mailto pivot)
    # Subtest: generates a pre-filled mailto draft for an action-severity item
    ok 1 - generates a pre-filled mailto draft for an action-severity item
      ---
      duration_ms: 27.547948
      type: 'test'
      ...
    # Subtest: no verified recipient ⇒ drafts skipped with a warning, pipeline survives
    ok 2 - no verified recipient ⇒ drafts skipped with a warning, pipeline survives
      ---
      duration_ms: 25.458264
      type: 'test'
      ...
    1..2
ok 8 - OM2\#2 objection drafter (mailto pivot)
  ---
  duration_ms: 53.11094
  type: 'suite'
  ...
# Subtest: OM3\#1 payload normalization (build-plan)
    # Subtest: flat client_payload keys build a plan
    ok 1 - flat client_payload keys build a plan
      ---
      duration_ms: 23.411663
      type: 'test'
      ...
    # Subtest: the deprecated nested client_payload.payload shape is tolerated with a warning
    ok 2 - the deprecated nested client_payload.payload shape is tolerated with a warning
      ---
      duration_ms: 21.742683
      type: 'test'
      ...
    # Subtest: an empty payload fails fast with the documented contract
    ok 3 - an empty payload fails fast with the documented contract
      ---
      duration_ms: 24.333074
      type: 'test'
      ...
    # Subtest: meeting id derivation from real Cheyenne document filenames
    ok 4 - meeting id derivation from real Cheyenne document filenames
      ---
      duration_ms: 0.723238
      type: 'test'
      ...
    1..4
ok 9 - OM3\#1 payload normalization (build-plan)
  ---
  duration_ms: 70.382067
  type: 'suite'
  ...
# Subtest: OM1\#1 + OM3\#1 workflow YAML hardening
    # Subtest: sync workflow: serialized concurrency group, no cancel-in-progress
    ok 1 - sync workflow: serialized concurrency group, no cancel-in-progress
      ---
      duration_ms: 7.616901
      type: 'test'
      ...
    # Subtest: sync workflow: payload paths are FLAT client_payload keys (OM3\#1 fix)
    ok 2 - sync workflow: payload paths are FLAT client_payload keys (OM3\#1 fix)
      ---
      duration_ms: 2.358469
      type: 'test'
      ...
    # Subtest: sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)
    ok 3 - sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)
      ---
      duration_ms: 1.844375
      type: 'test'
      ...
    # Subtest: sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps
    ok 4 - sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps
      ---
      duration_ms: 2.241663
      type: 'test'
      ...
    # Subtest: watch workflow: read-only detection lane, fails closed on structure, invokes the reusable sync
    ok 5 - watch workflow: read-only detection lane, fails closed on structure, invokes the reusable sync
      ---
      duration_ms: 2.843128
      type: 'test'
      ...
    # Subtest: the sync clears the blocked marker once it completes
    ok 6 - the sync clears the blocked marker once it completes
      ---
      duration_ms: 2.257858
      type: 'test'
      ...
    # Subtest: write lane stays serialized in the sync workflow it belongs to (OM1\#1)
    ok 7 - write lane stays serialized in the sync workflow it belongs to (OM1\#1)
      ---
      duration_ms: 1.64767
      type: 'test'
      ...
    1..7
ok 10 - OM1\#1 + OM3\#1 workflow YAML hardening
  ---
  duration_ms: 21.022554
  type: 'suite'
  ...
# Subtest: end-to-end sync chain (build-plan → extract → analyze → draft → validate)
    # Subtest: fetchDocument: HTTP fetch, PDF magic sniff, size guard
    ok 1 - fetchDocument: HTTP fetch, PDF magic sniff, size guard
      ---
      duration_ms: 54.571483
      type: 'test'
      ...
    # Subtest: the workflow's step sequence produces validated, committable artifacts
    ok 2 - the workflow's step sequence produces validated, committable artifacts
      ---
      duration_ms: 260.217852
      type: 'test'
      ...
    1..2
ok 11 - end-to-end sync chain (build-plan → extract → analyze → draft → validate)
  ---
  duration_ms: 314.896536
  type: 'suite'
  ...
1..11
# tests 51
# suites 11
# pass 50
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 18049.461274
