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
### Command: `npm run test:ecosystem`
```text

> test:ecosystem
> node --test tests/wyoming-ecosystem.test.mjs

TAP version 13
# Subtest: catalog covers every Wyoming county and incorporated municipality
ok 1 - catalog covers every Wyoming county and incorporated municipality
  ---
  duration_ms: 0.532532
  type: 'test'
  ...
# Subtest: every seat, county, and coordinate is a real reference in Wyoming
ok 2 - every seat, county, and coordinate is a real reference in Wyoming
  ---
  duration_ms: 0.779143
  type: 'test'
  ...
# Subtest: Cheyenne stays the only live Granicus watcher
ok 3 - Cheyenne stays the only live Granicus watcher
  ---
  duration_ms: 0.124478
  type: 'test'
  ...
# Subtest: generated site map matches the catalog
ok 4 - generated site map matches the catalog
  ---
  duration_ms: 28.286912
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
# duration_ms 72.835976
```
### Command: `npm run test:wyoming-watch`
```text

> test:wyoming-watch
> node --test tests/wyoming-watch.test.mjs

TAP version 13
# Subtest: the roster covers every government and does not invent a URL
ok 1 - the roster covers every government and does not invent a URL
  ---
  duration_ms: 0.925143
  type: 'test'
  ...
# Subtest: Agenda Center hashing ignores viewstate and rejects a Granicus table
ok 2 - Agenda Center hashing ignores viewstate and rejects a Granicus table
  ---
  duration_ms: 5.653199
  type: 'test'
  ...
# Subtest: a packet folder ignores a Granicus invoice and a single PDF
ok 3 - a packet folder ignores a Granicus invoice and a single PDF
  ---
  duration_ms: 0.483208
  type: 'test'
  ...
# Subtest: the runner does not fetch uncalibrated governments or Cheyenne
ok 4 - the runner does not fetch uncalibrated governments or Cheyenne
  ---
  duration_ms: 6.273673
  type: 'test'
  ...
# Subtest: host drift is structural and does not parse the foreign page
ok 5 - host drift is structural and does not parse the foreign page
  ---
  duration_ms: 0.363277
  type: 'test'
  ...
# Subtest: the scheduled workflow does not call the Cheyenne sync
ok 6 - the scheduled workflow does not call the Cheyenne sync
  ---
  duration_ms: 72.073694
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
# duration_ms 155.209328
```
### Command: `npm run test:places`
```text

> test:places
> node --test tests/place-archives.test.mjs

TAP version 13
# Subtest: every government has its own archive repo name
ok 1 - every government has its own archive repo name
  ---
  duration_ms: 0.991944
  type: 'test'
  ...
# Subtest: document copy stays on the pinned host
ok 2 - document copy stays on the pinned host
  ---
  duration_ms: 4.154433
  type: 'test'
  ...
# Subtest: a directory-only town is not given an invented harvest URL
ok 3 - a directory-only town is not given an invented harvest URL
  ---
  duration_ms: 0.149135
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
# duration_ms 67.302462
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
      duration_ms: 5.630335
      type: 'test'
      ...
    # Subtest: normalizeUrl handles relative garbage without throwing
    ok 2 - normalizeUrl handles relative garbage without throwing
      ---
      duration_ms: 0.154092
      type: 'test'
      ...
    # Subtest: date and time forms collapse to one canonical form each
    ok 3 - date and time forms collapse to one canonical form each
      ---
      duration_ms: 0.355946
      type: 'test'
      ...
    # Subtest: stableStringify ignores key order; contentHash ignores record order
    ok 4 - stableStringify ignores key order; contentHash ignores record order
      ---
      duration_ms: 0.601145
      type: 'test'
      ...
    1..4
ok 1 - OM1\#2 canonical field normalization
  ---
  duration_ms: 7.34155
  type: 'suite'
  ...
# Subtest: OM1\#2 upcoming-table extraction (semantic records, not markup)
    # Subtest: parses the Granicus upcoming table into normalized records
    ok 1 - parses the Granicus upcoming table into normalized records
      ---
      duration_ms: 5.630735
      type: 'test'
      ...
    # Subtest: markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash
    ok 2 - markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash
      ---
      duration_ms: 1.993491
      type: 'test'
      ...
    # Subtest: a real data change (moved time) DOES change the hash
    ok 3 - a real data change (moved time) DOES change the hash
      ---
      duration_ms: 0.940105
      type: 'test'
      ...
    # Subtest: a page without the expected table fails loudly (ENO_TABLE), never hashes nothing
    ok 4 - a page without the expected table fails loudly (ENO_TABLE), never hashes nothing
      ---
      duration_ms: 0.416838
      type: 'test'
      ...
    # Subtest: bodySlug maps Granicus names onto the site vocabulary
    ok 5 - bodySlug maps Granicus names onto the site vocabulary
      ---
      duration_ms: 0.144828
      type: 'test'
      ...
    1..5
ok 2 - OM1\#2 upcoming-table extraction (semantic records, not markup)
  ---
  duration_ms: 9.396273
  type: 'suite'
  ...
# Subtest: OM1\#2 watcher CLI — seed, detect, fail closed
    # Subtest: seed builds the baseline from the curated snapshot (no network)
    ok 1 - seed builds the baseline from the curated snapshot (no network)
      ---
      duration_ms: 54.243306
      type: 'test'
      ...
    # Subtest: day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED
    ok 2 - day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED
      ---
      duration_ms: 56.462416
      type: 'test'
      ...
    # Subtest: a semantic change is detected and pinpointed to the changed meeting
    ok 3 - a semantic change is detected and pinpointed to the changed meeting
      ---
      duration_ms: 57.970306
      type: 'test'
      ...
    # Subtest: a brand-new posted meeting is detected as changed
    ok 4 - a brand-new posted meeting is detected as changed
      ---
      duration_ms: 59.887251
      type: 'test'
      ...
    # Subtest: fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”
    ok 5 - fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”
      ---
      duration_ms: 49.299524
      type: 'test'
      ...
    # Subtest: a portal outage is recorded as source-unavailable, never as an unchanged table
    ok 6 - a portal outage is recorded as source-unavailable, never as an unchanged table
      ---
      duration_ms: 8073.194188
      type: 'test'
      ...
    # Subtest: a change that already failed to sync is reported but not re-attempted inside the window
    ok 7 - a change that already failed to sync is reported but not re-attempted inside the window
      ---
      duration_ms: 114.317529
      type: 'test'
      ...
    # Subtest: the retry window expires and the change is attempted again
    ok 8 - the retry window expires and the change is attempted again
      ---
      duration_ms: 61.299022
      type: 'test'
      ...
    # Subtest: a marker for a different hash never suppresses a new change
    ok 9 - a marker for a different hash never suppresses a new change
      ---
      duration_ms: 58.647023
      type: 'test'
      ...
    # Subtest: without the tolerance flag a portal outage still fails closed
    ok 10 - without the tolerance flag a portal outage still fails closed
      ---
      duration_ms: 8070.46617
      type: 'test'
      ...
    1..10
ok 3 - OM1\#2 watcher CLI — seed, detect, fail closed
  ---
  duration_ms: 16656.350403
  type: 'suite'
  ...
# Subtest: OM2\#1 layout-aware engine vs. column interleaving
    # Subtest: two columns with interleaved content streams are reconstructed as two columns
    ok 1 - two columns with interleaved content streams are reconstructed as two columns
      ---
      duration_ms: 675.239192
      type: 'test'
      ...
    # Subtest: scanned (no text layer) pages fail with NO_TEXT, not empty success
    ok 2 - scanned (no text layer) pages fail with NO_TEXT, not empty success
      ---
      duration_ms: 1.787101
      type: 'test'
      ...
    # Subtest: corrupt bytes fail with CORRUPT
    ok 3 - corrupt bytes fail with CORRUPT
      ---
      duration_ms: 0.827687
      type: 'test'
      ...
    # Subtest: zero-byte input fails with EMPTY_INPUT
    ok 4 - zero-byte input fails with EMPTY_INPUT
      ---
      duration_ms: 0.101573
      type: 'test'
      ...
    # Subtest: real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text
    not ok 5 - real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text
      ---
      duration_ms: 0.153591
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
  duration_ms: 678.272249
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
      duration_ms: 154.564714
      type: 'test'
      ...
    # Subtest: a scanned upload exits 1, writes nothing — the error cascade stops here
    ok 2 - a scanned upload exits 1, writes nothing — the error cascade stops here
      ---
      duration_ms: 124.620348
      type: 'test'
      ...
    # Subtest: a corrupt upload exits 1 with CORRUPT
    ok 3 - a corrupt upload exits 1 with CORRUPT
      ---
      duration_ms: 118.118351
      type: 'test'
      ...
    # Subtest: Granicus AgendaViewer chrome resolves to the underlying PDF link
    ok 4 - Granicus AgendaViewer chrome resolves to the underlying PDF link
      ---
      duration_ms: 4.221428
      type: 'test'
      ...
    # Subtest: normalizes protocol-relative Granicus GeneratedAgendaViewer URLs and passes full structural validation
    ok 5 - normalizes protocol-relative Granicus GeneratedAgendaViewer URLs and passes full structural validation
      ---
      duration_ms: 119.241738
      type: 'test'
      ...
    1..5
ok 5 - OM2\#1 + OM3\#2 extractor CLI end-to-end
  ---
  duration_ms: 521.105998
  type: 'suite'
  ...
# Subtest: OM2\#1 analyzer — deterministic, evidence-cited findings
    # Subtest: rules produce the expected findings, every quote verbatim in the source text
    ok 1 - rules produce the expected findings, every quote verbatim in the source text
      ---
      duration_ms: 30.629177
      type: 'test'
      ...
    # Subtest: analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)
    ok 2 - analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)
      ---
      duration_ms: 26.019746
      type: 'test'
      ...
    1..2
ok 6 - OM2\#1 analyzer — deterministic, evidence-cited findings
  ---
  duration_ms: 56.763965
  type: 'suite'
  ...
# Subtest: OM3\#2 validation gate — nothing unsound reaches git
    # Subtest: sound artifacts pass
    ok 1 - sound artifacts pass
      ---
      duration_ms: 28.57203
      type: 'test'
      ...
    # Subtest: a fabricated evidence quote in analysis.json is rejected
    ok 2 - a fabricated evidence quote in analysis.json is rejected
      ---
      duration_ms: 26.639158
      type: 'test'
      ...
    # Subtest: a tampered agenda item quote is rejected
    ok 3 - a tampered agenda item quote is rejected
      ---
      duration_ms: 27.633487
      type: 'test'
      ...
    # Subtest: a leftover .tmp write blocks the commit
    ok 4 - a leftover .tmp write blocks the commit
      ---
      duration_ms: 27.787482
      type: 'test'
      ...
    # Subtest: the gate passes again once the artifacts are restored
    ok 5 - the gate passes again once the artifacts are restored
      ---
      duration_ms: 29.229986
      type: 'test'
      ...
    1..5
ok 7 - OM3\#2 validation gate — nothing unsound reaches git
  ---
  duration_ms: 140.130206
  type: 'suite'
  ...
# Subtest: OM2\#2 objection drafter (mailto pivot)
    # Subtest: generates a pre-filled mailto draft for an action-severity item
    ok 1 - generates a pre-filled mailto draft for an action-severity item
      ---
      duration_ms: 27.424411
      type: 'test'
      ...
    # Subtest: no verified recipient ⇒ drafts skipped with a warning, pipeline survives
    ok 2 - no verified recipient ⇒ drafts skipped with a warning, pipeline survives
      ---
      duration_ms: 25.324198
      type: 'test'
      ...
    1..2
ok 8 - OM2\#2 objection drafter (mailto pivot)
  ---
  duration_ms: 52.86232
  type: 'suite'
  ...
# Subtest: OM3\#1 payload normalization (build-plan)
    # Subtest: flat client_payload keys build a plan
    ok 1 - flat client_payload keys build a plan
      ---
      duration_ms: 24.58144
      type: 'test'
      ...
    # Subtest: the deprecated nested client_payload.payload shape is tolerated with a warning
    ok 2 - the deprecated nested client_payload.payload shape is tolerated with a warning
      ---
      duration_ms: 22.724623
      type: 'test'
      ...
    # Subtest: an empty payload fails fast with the documented contract
    ok 3 - an empty payload fails fast with the documented contract
      ---
      duration_ms: 24.045011
      type: 'test'
      ...
    # Subtest: meeting id derivation from real Cheyenne document filenames
    ok 4 - meeting id derivation from real Cheyenne document filenames
      ---
      duration_ms: 0.621676
      type: 'test'
      ...
    1..4
ok 9 - OM3\#1 payload normalization (build-plan)
  ---
  duration_ms: 72.135817
  type: 'suite'
  ...
# Subtest: OM1\#1 + OM3\#1 workflow YAML hardening
    # Subtest: sync workflow: serialized concurrency group, no cancel-in-progress
    ok 1 - sync workflow: serialized concurrency group, no cancel-in-progress
      ---
      duration_ms: 7.678344
      type: 'test'
      ...
    # Subtest: sync workflow: payload paths are FLAT client_payload keys (OM3\#1 fix)
    ok 2 - sync workflow: payload paths are FLAT client_payload keys (OM3\#1 fix)
      ---
      duration_ms: 2.362928
      type: 'test'
      ...
    # Subtest: sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)
    ok 3 - sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)
      ---
      duration_ms: 1.881724
      type: 'test'
      ...
    # Subtest: sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps
    ok 4 - sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps
      ---
      duration_ms: 2.405383
      type: 'test'
      ...
    # Subtest: watch workflow: read-only detection lane, fails closed on structure, invokes the reusable sync
    ok 5 - watch workflow: read-only detection lane, fails closed on structure, invokes the reusable sync
      ---
      duration_ms: 2.9412
      type: 'test'
      ...
    # Subtest: the sync clears the blocked marker once it completes
    ok 6 - the sync clears the blocked marker once it completes
      ---
      duration_ms: 2.380014
      type: 'test'
      ...
    # Subtest: write lane stays serialized in the sync workflow it belongs to (OM1\#1)
    ok 7 - write lane stays serialized in the sync workflow it belongs to (OM1\#1)
      ---
      duration_ms: 2.553615
      type: 'test'
      ...
    1..7
ok 10 - OM1\#1 + OM3\#1 workflow YAML hardening
  ---
  duration_ms: 22.412644
  type: 'suite'
  ...
# Subtest: end-to-end sync chain (build-plan → extract → analyze → draft → validate)
    # Subtest: fetchDocument: HTTP fetch, PDF magic sniff, size guard
    ok 1 - fetchDocument: HTTP fetch, PDF magic sniff, size guard
      ---
      duration_ms: 52.989787
      type: 'test'
      ...
    # Subtest: the workflow's step sequence produces validated, committable artifacts
    ok 2 - the workflow's step sequence produces validated, committable artifacts
      ---
      duration_ms: 270.686117
      type: 'test'
      ...
    1..2
ok 11 - end-to-end sync chain (build-plan → extract → analyze → draft → validate)
  ---
  duration_ms: 323.787601
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
# duration_ms 18629.856332
### Command: `npm run test:ecosystem`
```text

> test:ecosystem
> node --test tests/wyoming-ecosystem.test.mjs

TAP version 13
# Subtest: catalog covers every Wyoming county and incorporated municipality
ok 1 - catalog covers every Wyoming county and incorporated municipality
  ---
  duration_ms: 0.682803
  type: 'test'
  ...
# Subtest: every seat, county, and coordinate is a real reference in Wyoming
ok 2 - every seat, county, and coordinate is a real reference in Wyoming
  ---
  duration_ms: 0.976049
  type: 'test'
  ...
# Subtest: Cheyenne stays the only live Granicus watcher
ok 3 - Cheyenne stays the only live Granicus watcher
  ---
  duration_ms: 0.165035
  type: 'test'
  ...
# Subtest: generated site map matches the catalog
ok 4 - generated site map matches the catalog
  ---
  duration_ms: 33.410591
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
# duration_ms 86.689603
```
### Command: `npm run test:wyoming-watch`
```text

> test:wyoming-watch
> node --test tests/wyoming-watch.test.mjs

TAP version 13
# Subtest: the roster covers every government and does not invent a URL
ok 1 - the roster covers every government and does not invent a URL
  ---
  duration_ms: 1.093613
  type: 'test'
  ...
# Subtest: Agenda Center hashing ignores viewstate and rejects a Granicus table
ok 2 - Agenda Center hashing ignores viewstate and rejects a Granicus table
  ---
  duration_ms: 7.029454
  type: 'test'
  ...
# Subtest: a packet folder ignores a Granicus invoice and a single PDF
ok 3 - a packet folder ignores a Granicus invoice and a single PDF
  ---
  duration_ms: 0.638358
  type: 'test'
  ...
# Subtest: the runner does not fetch uncalibrated governments or Cheyenne
ok 4 - the runner does not fetch uncalibrated governments or Cheyenne
  ---
  duration_ms: 8.630461
  type: 'test'
  ...
# Subtest: host drift is structural and does not parse the foreign page
ok 5 - host drift is structural and does not parse the foreign page
  ---
  duration_ms: 0.427725
  type: 'test'
  ...
# Subtest: the scheduled workflow does not call the Cheyenne sync
ok 6 - the scheduled workflow does not call the Cheyenne sync
  ---
  duration_ms: 92.931008
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
# duration_ms 193.845077
```
### Command: `npm run test:places`
```text

> test:places
> node --test tests/place-archives.test.mjs

TAP version 13
# Subtest: every government has its own archive repo name
ok 1 - every government has its own archive repo name
  ---
  duration_ms: 1.29385
  type: 'test'
  ...
# Subtest: document copy stays on the pinned host
ok 2 - document copy stays on the pinned host
  ---
  duration_ms: 5.15347
  type: 'test'
  ...
# Subtest: a directory-only town is not given an invented harvest URL
ok 3 - a directory-only town is not given an invented harvest URL
  ---
  duration_ms: 0.195981
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
# duration_ms 87.972277
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
      duration_ms: 6.900113
      type: 'test'
      ...
    # Subtest: normalizeUrl handles relative garbage without throwing
    ok 2 - normalizeUrl handles relative garbage without throwing
      ---
      duration_ms: 0.175301
      type: 'test'
      ...
    # Subtest: date and time forms collapse to one canonical form each
    ok 3 - date and time forms collapse to one canonical form each
      ---
      duration_ms: 0.515455
      type: 'test'
      ...
    # Subtest: stableStringify ignores key order; contentHash ignores record order
    ok 4 - stableStringify ignores key order; contentHash ignores record order
      ---
      duration_ms: 0.715852
      type: 'test'
      ...
    1..4
ok 1 - OM1\#2 canonical field normalization
  ---
  duration_ms: 9.081771
  type: 'suite'
  ...
# Subtest: OM1\#2 upcoming-table extraction (semantic records, not markup)
    # Subtest: parses the Granicus upcoming table into normalized records
    ok 1 - parses the Granicus upcoming table into normalized records
      ---
      duration_ms: 7.173398
      type: 'test'
      ...
    # Subtest: markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash
    ok 2 - markup churn (session ids, nonce attrs, tracking params, class renames) does NOT change the hash
      ---
      duration_ms: 2.353153
      type: 'test'
      ...
    # Subtest: a real data change (moved time) DOES change the hash
    ok 3 - a real data change (moved time) DOES change the hash
      ---
      duration_ms: 1.264177
      type: 'test'
      ...
    # Subtest: a page without the expected table fails loudly (ENO_TABLE), never hashes nothing
    ok 4 - a page without the expected table fails loudly (ENO_TABLE), never hashes nothing
      ---
      duration_ms: 0.492472
      type: 'test'
      ...
    # Subtest: bodySlug maps Granicus names onto the site vocabulary
    ok 5 - bodySlug maps Granicus names onto the site vocabulary
      ---
      duration_ms: 0.199506
      type: 'test'
      ...
    1..5
ok 2 - OM1\#2 upcoming-table extraction (semantic records, not markup)
  ---
  duration_ms: 11.858974
  type: 'suite'
  ...
# Subtest: OM1\#2 watcher CLI — seed, detect, fail closed
    # Subtest: seed builds the baseline from the curated snapshot (no network)
    ok 1 - seed builds the baseline from the curated snapshot (no network)
      ---
      duration_ms: 69.45813
      type: 'test'
      ...
    # Subtest: day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED
    ok 2 - day one is a zero-false-positive: live fixture matching the snapshot reads as UNCHANGED
      ---
      duration_ms: 72.627093
      type: 'test'
      ...
    # Subtest: a semantic change is detected and pinpointed to the changed meeting
    ok 3 - a semantic change is detected and pinpointed to the changed meeting
      ---
      duration_ms: 74.912877
      type: 'test'
      ...
    # Subtest: a brand-new posted meeting is detected as changed
    ok 4 - a brand-new posted meeting is detected as changed
      ---
      duration_ms: 73.150415
      type: 'test'
      ...
    # Subtest: fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”
    ok 5 - fetch/parse failure exits non-zero — a broken watcher never reads as “no changes”
      ---
      duration_ms: 61.579129
      type: 'test'
      ...
    # Subtest: a portal outage is recorded as source-unavailable, never as an unchanged table
    ok 6 - a portal outage is recorded as source-unavailable, never as an unchanged table
      ---
      duration_ms: 8091.570611
      type: 'test'
      ...
    # Subtest: a change that already failed to sync is reported but not re-attempted inside the window
    ok 7 - a change that already failed to sync is reported but not re-attempted inside the window
      ---
      duration_ms: 152.643034
      type: 'test'
      ...
    # Subtest: the retry window expires and the change is attempted again
    ok 8 - the retry window expires and the change is attempted again
      ---
      duration_ms: 76.25015
      type: 'test'
      ...
    # Subtest: a marker for a different hash never suppresses a new change
    ok 9 - a marker for a different hash never suppresses a new change
      ---
      duration_ms: 75.573746
      type: 'test'
      ...
    # Subtest: without the tolerance flag a portal outage still fails closed
    ok 10 - without the tolerance flag a portal outage still fails closed
      ---
      duration_ms: 8087.082698
      type: 'test'
      ...
    1..10
ok 3 - OM1\#2 watcher CLI — seed, detect, fail closed
  ---
  duration_ms: 16835.394875
  type: 'suite'
  ...
# Subtest: OM2\#1 layout-aware engine vs. column interleaving
    # Subtest: two columns with interleaved content streams are reconstructed as two columns
    ok 1 - two columns with interleaved content streams are reconstructed as two columns
      ---
      duration_ms: 144.10217
      type: 'test'
      ...
    # Subtest: scanned (no text layer) pages fail with NO_TEXT, not empty success
    ok 2 - scanned (no text layer) pages fail with NO_TEXT, not empty success
      ---
      duration_ms: 2.259381
      type: 'test'
      ...
    # Subtest: corrupt bytes fail with CORRUPT
    ok 3 - corrupt bytes fail with CORRUPT
      ---
      duration_ms: 1.049877
      type: 'test'
      ...
    # Subtest: zero-byte input fails with EMPTY_INPUT
    ok 4 - zero-byte input fails with EMPTY_INPUT
      ---
      duration_ms: 0.133879
      type: 'test'
      ...
    # Subtest: real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text
    ok 5 - real Cheyenne document (Jan 26 minutes) extracts as a single column with intact text
      ---
      duration_ms: 74.765556
      type: 'test'
      ...
    1..5
ok 4 - OM2\#1 layout-aware engine vs. column interleaving
  ---
  duration_ms: 222.551921
  type: 'suite'
  ...
# Subtest: OM2\#1 + OM3\#2 extractor CLI end-to-end
    # Subtest: extracts a faithful synthetic agenda into structured items with verbatim quotes
    ok 1 - extracts a faithful synthetic agenda into structured items with verbatim quotes
      ---
      duration_ms: 202.93253
      type: 'test'
      ...
    # Subtest: a scanned upload exits 1, writes nothing — the error cascade stops here
    ok 2 - a scanned upload exits 1, writes nothing — the error cascade stops here
      ---
      duration_ms: 159.270199
      type: 'test'
      ...
    # Subtest: a corrupt upload exits 1 with CORRUPT
    ok 3 - a corrupt upload exits 1 with CORRUPT
      ---
      duration_ms: 154.381075
      type: 'test'
      ...
    # Subtest: Granicus AgendaViewer chrome resolves to the underlying PDF link
    ok 4 - Granicus AgendaViewer chrome resolves to the underlying PDF link
      ---
      duration_ms: 3.563294
      type: 'test'
      ...
    # Subtest: normalizes protocol-relative Granicus GeneratedAgendaViewer URLs and passes full structural validation
    ok 5 - normalizes protocol-relative Granicus GeneratedAgendaViewer URLs and passes full structural validation
      ---
      duration_ms: 150.239101
      type: 'test'
      ...
    1..5
ok 5 - OM2\#1 + OM3\#2 extractor CLI end-to-end
  ---
  duration_ms: 670.677853
  type: 'suite'
  ...
# Subtest: OM2\#1 analyzer — deterministic, evidence-cited findings
    # Subtest: rules produce the expected findings, every quote verbatim in the source text
    ok 1 - rules produce the expected findings, every quote verbatim in the source text
      ---
      duration_ms: 37.548614
      type: 'test'
      ...
    # Subtest: analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)
    ok 2 - analyzer refuses to run against a meeting with no agenda.json (no silent no-ops)
      ---
      duration_ms: 32.64373
      type: 'test'
      ...
    1..2
ok 6 - OM2\#1 analyzer — deterministic, evidence-cited findings
  ---
  duration_ms: 70.35781
  type: 'suite'
  ...
# Subtest: OM3\#2 validation gate — nothing unsound reaches git
    # Subtest: sound artifacts pass
    ok 1 - sound artifacts pass
      ---
      duration_ms: 37.9032
      type: 'test'
      ...
    # Subtest: a fabricated evidence quote in analysis.json is rejected
    ok 2 - a fabricated evidence quote in analysis.json is rejected
      ---
      duration_ms: 36.335705
      type: 'test'
      ...
    # Subtest: a tampered agenda item quote is rejected
    ok 3 - a tampered agenda item quote is rejected
      ---
      duration_ms: 36.049921
      type: 'test'
      ...
    # Subtest: a leftover .tmp write blocks the commit
    ok 4 - a leftover .tmp write blocks the commit
      ---
      duration_ms: 34.612019
      type: 'test'
      ...
    # Subtest: the gate passes again once the artifacts are restored
    ok 5 - the gate passes again once the artifacts are restored
      ---
      duration_ms: 34.325374
      type: 'test'
      ...
    1..5
ok 7 - OM3\#2 validation gate — nothing unsound reaches git
  ---
  duration_ms: 179.547055
  type: 'suite'
  ...
# Subtest: OM2\#2 objection drafter (mailto pivot)
    # Subtest: generates a pre-filled mailto draft for an action-severity item
    ok 1 - generates a pre-filled mailto draft for an action-severity item
      ---
      duration_ms: 35.426227
      type: 'test'
      ...
    # Subtest: no verified recipient ⇒ drafts skipped with a warning, pipeline survives
    ok 2 - no verified recipient ⇒ drafts skipped with a warning, pipeline survives
      ---
      duration_ms: 33.062676
      type: 'test'
      ...
    1..2
ok 8 - OM2\#2 objection drafter (mailto pivot)
  ---
  duration_ms: 68.715229
  type: 'suite'
  ...
# Subtest: OM3\#1 payload normalization (build-plan)
    # Subtest: flat client_payload keys build a plan
    ok 1 - flat client_payload keys build a plan
      ---
      duration_ms: 30.44198
      type: 'test'
      ...
    # Subtest: the deprecated nested client_payload.payload shape is tolerated with a warning
    ok 2 - the deprecated nested client_payload.payload shape is tolerated with a warning
      ---
      duration_ms: 32.822966
      type: 'test'
      ...
    # Subtest: an empty payload fails fast with the documented contract
    ok 3 - an empty payload fails fast with the documented contract
      ---
      duration_ms: 28.539774
      type: 'test'
      ...
    # Subtest: meeting id derivation from real Cheyenne document filenames
    ok 4 - meeting id derivation from real Cheyenne document filenames
      ---
      duration_ms: 0.737914
      type: 'test'
      ...
    1..4
ok 9 - OM3\#1 payload normalization (build-plan)
  ---
  duration_ms: 92.797632
  type: 'suite'
  ...
# Subtest: OM1\#1 + OM3\#1 workflow YAML hardening
    # Subtest: sync workflow: serialized concurrency group, no cancel-in-progress
    ok 1 - sync workflow: serialized concurrency group, no cancel-in-progress
      ---
      duration_ms: 10.153818
      type: 'test'
      ...
    # Subtest: sync workflow: payload paths are FLAT client_payload keys (OM3\#1 fix)
    ok 2 - sync workflow: payload paths are FLAT client_payload keys (OM3\#1 fix)
      ---
      duration_ms: 3.095571
      type: 'test'
      ...
    # Subtest: sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)
    ok 3 - sync workflow: no workflow expressions are interpolated inside run: blocks (injection guard)
      ---
      duration_ms: 3.909458
      type: 'test'
      ...
    # Subtest: sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps
    ok 4 - sync workflow: validation gates the commit; extraction/analysis are separate fail-fast steps
      ---
      duration_ms: 3.860424
      type: 'test'
      ...
    # Subtest: watch workflow: read-only detection lane, fails closed on structure, invokes the reusable sync
    ok 5 - watch workflow: read-only detection lane, fails closed on structure, invokes the reusable sync
      ---
      duration_ms: 3.811822
      type: 'test'
      ...
    # Subtest: the sync clears the blocked marker once it completes
    ok 6 - the sync clears the blocked marker once it completes
      ---
      duration_ms: 3.121309
      type: 'test'
      ...
    # Subtest: write lane stays serialized in the sync workflow it belongs to (OM1\#1)
    ok 7 - write lane stays serialized in the sync workflow it belongs to (OM1\#1)
      ---
      duration_ms: 3.799054
      type: 'test'
      ...
    1..7
ok 10 - OM1\#1 + OM3\#1 workflow YAML hardening
  ---
  duration_ms: 32.031082
  type: 'suite'
  ...
# Subtest: end-to-end sync chain (build-plan → extract → analyze → draft → validate)
    # Subtest: fetchDocument: HTTP fetch, PDF magic sniff, size guard
    ok 1 - fetchDocument: HTTP fetch, PDF magic sniff, size guard
      ---
      duration_ms: 64.130625
      type: 'test'
      ...
    # Subtest: the workflow's step sequence produces validated, committable artifacts
    ok 2 - the workflow's step sequence produces validated, committable artifacts
      ---
      duration_ms: 342.245338
      type: 'test'
      ...
    1..2
ok 11 - end-to-end sync chain (build-plan → extract → analyze → draft → validate)
  ---
  duration_ms: 406.506777
  type: 'suite'
  ...
1..11
# tests 51
# suites 11
# pass 51
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 18707.329202
```
### Command: `npm run test:pulse`
```text

> test:pulse
> node --test tests/pulse-news.test.mjs

TAP version 13
# Subtest: parses RSS headlines, CDATA summaries, dates, and direct publisher links
ok 1 - parses RSS headlines, CDATA summaries, dates, and direct publisher links
  ---
  duration_ms: 6.883078
  type: 'test'
  ...
# Subtest: parses Atom link attributes and classifies public-safety headlines
ok 2 - parses Atom link attributes and classifies public-safety headlines
  ---
  duration_ms: 1.060252
  type: 'test'
  ...
# Subtest: loads only real, source-linked Wyoming seed stories for offline and failed-feed fallback
ok 3 - loads only real, source-linked Wyoming seed stories for offline and failed-feed fallback
  ---
  duration_ms: 5.469882
  type: 'test'
  ...
# Subtest: seed refresh accepts only verified, source-linked additions
ok 4 - seed refresh accepts only verified, source-linked additions
  ---
  duration_ms: 5.728395
  type: 'test'
  ...
# Subtest: a snapshot is published only when an agency or publisher feed returned stories
ok 5 - a snapshot is published only when an agency or publisher feed returned stories
  ---
  duration_ms: 0.285534
  type: 'test'
  ...
# Subtest: news classification routes environment, elections, and community stories
ok 6 - news classification routes environment, elections, and community stories
  ---
  duration_ms: 1.062155
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
# duration_ms 95.607183
```
### Command: `npm run test:filenames`
```text

> test:filenames
> node --test tests/filename-dates.test.mjs

TAP version 13
# Subtest: parses Granicus timestamp folders and ISO meeting folders as real calendar dates
ok 1 - parses Granicus timestamp folders and ISO meeting folders as real calendar dates
  ---
  duration_ms: 0.886484
  type: 'test'
  ...
# Subtest: parses ISO and filename-only municipal dates without truncating four-digit years
ok 2 - parses ISO and filename-only municipal dates without truncating four-digit years
  ---
  duration_ms: 0.678226
  type: 'test'
  ...
# Subtest: preserves sub-prefix body and special-meeting semantics
ok 3 - preserves sub-prefix body and special-meeting semantics
  ---
  duration_ms: 0.874526
  type: 'test'
  ...
# Subtest: build index retains filename-dated municipal records under their correct meeting IDs
ok 4 - build index retains filename-dated municipal records under their correct meeting IDs
  ---
  duration_ms: 1.231776
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
# duration_ms 68.268862
```
### Command: `npm run test:scanner-archive-links`
```text

> test:scanner-archive-links
> node --test tests/sync/scanner-archive-links.test.mjs

TAP version 13
# Subtest: wallTimeToUnix — America/Denver wall time to Unix
    # Subtest: summer (MDT, UTC-6): the Prosser/S Greeley welfare check
    ok 1 - summer (MDT, UTC-6): the Prosser/S Greeley welfare check
      ---
      duration_ms: 12.762707
      type: 'test'
      ...
    # Subtest: winter (MST, UTC-7) uses the other offset
    ok 2 - winter (MST, UTC-7) uses the other offset
      ---
      duration_ms: 0.140719
      type: 'test'
      ...
    # Subtest: unparseable input yields null, never a fabricated timestamp
    ok 3 - unparseable input yields null, never a fabricated timestamp
      ---
      duration_ms: 0.147118
      type: 'test'
      ...
    1..3
ok 1 - wallTimeToUnix — America/Denver wall time to Unix
  ---
  duration_ms: 13.745304
  type: 'suite'
  ...
# Subtest: dateInZone — Unix to Denver calendar date
    # Subtest: maps instants to the right local date
    ok 1 - maps instants to the right local date
      ---
      duration_ms: 0.200057
      type: 'test'
      ...
    1..1
ok 2 - dateInZone — Unix to Denver calendar date
  ---
  duration_ms: 0.341417
  type: 'suite'
  ...
# Subtest: normalizeSocrataRecord
    # Subtest: maps a details.json incident record to the link shape
    ok 1 - maps a details.json incident record to the link shape
      ---
      duration_ms: 0.24262
      type: 'test'
      ...
    # Subtest: keeps a record whose timestamp is unparseable (atUnix null) for honest reporting
    ok 2 - keeps a record whose timestamp is unparseable (atUnix null) for honest reporting
      ---
      duration_ms: 0.184474
      type: 'test'
      ...
    # Subtest: drops records with no identity or no timestamp
    ok 3 - drops records with no identity or no timestamp
      ---
      duration_ms: 0.199746
      type: 'test'
      ...
    1..3
ok 3 - normalizeSocrataRecord
  ---
  duration_ms: 0.801108
  type: 'suite'
  ...
# Subtest: normalizeArchiveBlock
    # Subtest: builds the block shape with download and page URLs
    ok 1 - builds the block shape with download and page URLs
      ---
      duration_ms: 0.198685
      type: 'test'
      ...
    # Subtest: rejects blocks with unusable bounds
    ok 2 - rejects blocks with unusable bounds
      ---
      duration_ms: 0.151575
      type: 'test'
      ...
    1..2
ok 4 - normalizeArchiveBlock
  ---
  duration_ms: 0.556976
  type: 'suite'
  ...
# Subtest: dedupeRecords
    # Subtest: a border record returned by two quadrants is counted once
    ok 1 - a border record returned by two quadrants is counted once
      ---
      duration_ms: 0.218955
      type: 'test'
      ...
    1..1
ok 5 - dedupeRecords
  ---
  duration_ms: 0.276821
  type: 'suite'
  ...
# Subtest: buildFeedIndex + findBlock
    # Subtest: merges dates into one sorted array and classifies empty dates
    ok 1 - merges dates into one sorted array and classifies empty dates
      ---
      duration_ms: 0.176301
      type: 'test'
      ...
    # Subtest: finds the block containing a timestamp (half-open interval)
    ok 2 - finds the block containing a timestamp (half-open interval)
      ---
      duration_ms: 0.10116
      type: 'test'
      ...
    # Subtest: endTs is exclusive and startTs is inclusive at block edges
    ok 3 - endTs is exclusive and startTs is inclusive at block edges
      ---
      duration_ms: 0.112016
      type: 'test'
      ...
    # Subtest: a gap between blocks yields null (feed restart)
    ok 4 - a gap between blocks yields null (feed restart)
      ---
      duration_ms: 0.059929
      type: 'test'
      ...
    # Subtest: before the first block or in an empty index yields null
    ok 5 - before the first block or in an empty index yields null
      ---
      duration_ms: 0.050765
      type: 'test'
      ...
    1..5
ok 6 - buildFeedIndex + findBlock
  ---
  duration_ms: 0.60001
  type: 'suite'
  ...
# Subtest: linkLog — every log gets a link or an explicit reason
    # Subtest: links a log to its block with the offset into the recording
    ok 1 - links a log to its block with the offset into the recording
      ---
      duration_ms: 0.22236
      type: 'test'
      ...
    # Subtest: a gap inside a listed day is outside_block_coverage
    ok 2 - a gap inside a listed day is outside_block_coverage
      ---
      duration_ms: 0.095702
      type: 'test'
      ...
    # Subtest: an empty listing (feed offline / retention expired) is archive_unavailable_for_date
    ok 3 - an empty listing (feed offline / retention expired) is archive_unavailable_for_date
      ---
      duration_ms: 0.09438
      type: 'test'
      ...
    # Subtest: a date with no listing at all is no_archive_listing
    ok 4 - a date with no listing at all is no_archive_listing
      ---
      duration_ms: 0.100669
      type: 'test'
      ...
    # Subtest: a log without a parseable timestamp is missing_timestamp
    ok 5 - a log without a parseable timestamp is missing_timestamp
      ---
      duration_ms: 0.069733
      type: 'test'
      ...
    # Subtest: with two feeds the first covering feed is primary and the rest are recorded
    ok 6 - with two feeds the first covering feed is primary and the rest are recorded
      ---
      duration_ms: 0.215349
      type: 'test'
      ...
    1..6
ok 7 - linkLog — every log gets a link or an explicit reason
  ---
  duration_ms: 0.952923
  type: 'suite'
  ...
# Subtest: orderedFeedsForAgency
    # Subtest: the feed whose catalog matches the agency leads
    ok 1 - the feed whose catalog matches the agency leads
      ---
      duration_ms: 0.831843
      type: 'test'
      ...
    1..1
ok 8 - orderedFeedsForAgency
  ---
  duration_ms: 0.891492
  type: 'suite'
  ...
# Subtest: summarizeLinks
    # Subtest: reconciles totals and accounts for every archive block
    ok 1 - reconciles totals and accounts for every archive block
      ---
      duration_ms: 0.555424
      type: 'test'
      ...
    1..1
ok 9 - summarizeLinks
  ---
  duration_ms: 0.633018
  type: 'suite'
  ...
# Subtest: historySummaryFromTrend
    # Subtest: rolls per-year totals and counts only archive-covered days as linkable
    ok 1 - rolls per-year totals and counts only archive-covered days as linkable
      ---
      duration_ms: 0.810572
      type: 'test'
      ...
    1..1
ok 10 - historySummaryFromTrend
  ---
  duration_ms: 0.909639
  type: 'suite'
  ...
# Subtest: URL builders
    # Subtest: archiveListUrl uses the MM/DD/YYYY listing format
    ok 1 - archiveListUrl uses the MM/DD/YYYY listing format
      ---
      duration_ms: 0.132636
      type: 'test'
      ...
    # Subtest: socrataDetailsUrl pins one day and the bounding box
    ok 2 - socrataDetailsUrl pins one day and the bounding box
      ---
      duration_ms: 0.258913
      type: 'test'
      ...
    1..2
ok 11 - URL builders
  ---
  duration_ms: 0.469496
  type: 'suite'
  ...
# Subtest: FEED_CATALOG
    # Subtest: the law-enforcement feed is active and matches both county agencies
    ok 1 - the law-enforcement feed is active and matches both county agencies
      ---
      duration_ms: 0.101962
      type: 'test'
      ...
    # Subtest: legacy feeds are documented as removed, not silently dropped
    ok 2 - legacy feeds are documented as removed, not silently dropped
      ---
      duration_ms: 0.129221
      type: 'test'
      ...
    1..2
ok 12 - FEED_CATALOG
  ---
  duration_ms: 0.30346
  type: 'suite'
  ...
# Subtest: bundled seed artifact
    # Subtest: exists and declares its schema, sources and window
    ok 1 - exists and declares its schema, sources and window
      ---
      duration_ms: 0.201589
      type: 'test'
      ...
    # Subtest: every log in the window is linked to the archive block containing it
    ok 2 - every log in the window is linked to the archive block containing it
      ---
      duration_ms: 0.236902
      type: 'test'
      ...
    # Subtest: the July 19 welfare check points at the exact block found by hand
    ok 3 - the July 19 welfare check points at the exact block found by hand
      ---
      duration_ms: 0.100198
      type: 'test'
      ...
    # Subtest: the July 18 welfare check points at its exact block
    ok 4 - the July 18 welfare check points at its exact block
      ---
      duration_ms: 0.088741
      type: 'test'
      ...
    # Subtest: summary accounts for every archive block loaded for the window
    ok 5 - summary accounts for every archive block loaded for the window
      ---
      duration_ms: 0.116483
      type: 'test'
      ...
    # Subtest: historySummary reconciles with the citizen-connect publisher totals
    ok 6 - historySummary reconciles with the citizen-connect publisher totals
      ---
      duration_ms: 0.363829
      type: 'test'
      ...
    1..6
ok 13 - bundled seed artifact
  ---
  duration_ms: 1.280589
  type: 'suite'
  ...
# Subtest: ingest fail-closed behaviour
    # Subtest: dry run needs no network and exits 0
    ok 1 - dry run needs no network and exits 0
      ---
      duration_ms: 33.050539
      type: 'test'
      ...
    # Subtest: an unreachable publisher exits non-zero and leaves the artifact byte-identical
    ok 2 - an unreachable publisher exits non-zero and leaves the artifact byte-identical
      ---
      duration_ms: 53.605431
      type: 'test'
      ...
    # Subtest: offline mode without a cached window exits non-zero and touches nothing
    ok 3 - offline mode without a cached window exits non-zero and touches nothing
      ---
      duration_ms: 34.370096
      type: 'test'
      ...
    # Subtest: offline mode rebuilds an artifact from a seeded cache alone
    ok 4 - offline mode rebuilds an artifact from a seeded cache alone
      ---
      duration_ms: 55.612712
      type: 'test'
      ...
    # Subtest: importing the sync module for helpers does not start a sync
    ok 5 - importing the sync module for helpers does not start a sync
      ---
      duration_ms: 30.802469
      type: 'test'
      ...
    1..5
ok 14 - ingest fail-closed behaviour
  ---
  duration_ms: 207.754402
  type: 'suite'
  ...
1..14
# tests 39
# suites 14
# pass 39
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 314.099044
```
### Command: `npm run test:transcripts`
```text

> test:transcripts
> node --test tests/transcript-harvest.test.mjs

TAP version 13
# Subtest: WebVTT import preserves timestamped source text and strips formatting
ok 1 - WebVTT import preserves timestamped source text and strips formatting
  ---
  duration_ms: 3.822579
  type: 'test'
  ...
# Subtest: invalid and empty caption payloads do not create transcript cues
ok 2 - invalid and empty caption payloads do not create transcript cues
  ---
  duration_ms: 0.304472
  type: 'test'
  ...
# Subtest: provider detection and YouTube ID parsing are restricted to recognized hosts
ok 3 - provider detection and YouTube ID parsing are restricted to recognized hosts
  ---
  duration_ms: 0.530347
  type: 'test'
  ...
# Subtest: worklist excludes transcripts already attached to meetings
ok 4 - worklist excludes transcripts already attached to meetings
  ---
  duration_ms: 6.710121
  type: 'test'
  ...
# Subtest: snapshot gap audit matches the committed meeting and caption coverage
ok 5 - snapshot gap audit matches the committed meeting and caption coverage
  ---
  duration_ms: 1.05873
  type: 'test'
  ...
# Subtest: transcript markdown round-trips timestamped text and carries provenance
ok 6 - transcript markdown round-trips timestamped text and carries provenance
  ---
  duration_ms: 0.896459
  type: 'test'
  ...
# Subtest: static meeting excerpts are sampled evenly without modifying source cues
ok 7 - static meeting excerpts are sampled evenly without modifying source cues
  ---
  duration_ms: 0.239575
  type: 'test'
  ...
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 85.33487
```
### Command: `npm run test:calendar`
```text

> test:calendar
> node --test tests/civic-calendar.test.mjs

TAP version 13
# note: rejected unvalidated agenda extraction in /home/runner/work/TheReelWindyCity/TheReelWindyCity/data/meetings/2026/city-council-2026-10-26: agenda.json missing required field "sourceUrl"
# Subtest: normalizes ISO and natural-language meeting dates, including weekday prefixes
ok 1 - normalizes ISO and natural-language meeting dates, including weekday prefixes
  ---
  duration_ms: 1.159049
  type: 'test'
  ...
# Subtest: parses every posted-time shape in the record, and refuses to guess invalid ones
ok 2 - parses every posted-time shape in the record, and refuses to guess invalid ones
  ---
  duration_ms: 0.301207
  type: 'test'
  ...
# Subtest: resolves November 1, 2026 America/Denver DST fall-back accurately (2:00 a.m. MDT -> 1:00 a.m. MST)
ok 3 - resolves November 1, 2026 America/Denver DST fall-back accurately (2:00 a.m. MDT -> 1:00 a.m. MST)
  ---
  duration_ms: 11.82053
  type: 'test'
  ...
# Subtest: known future start time sets an explicit validity boundary and transitions to start-time-passed without inferring held outcome
ok 4 - known future start time sets an explicit validity boundary and transitions to start-time-passed without inferring held outcome
  ---
  duration_ms: 1.118649
  type: 'test'
  ...
# Subtest: same-day records without a verified start time are never advertised as confirmed future meetings
ok 5 - same-day records without a verified start time are never advertised as confirmed future meetings
  ---
  duration_ms: 1.286818
  type: 'test'
  ...
# Subtest: cancelled, rescheduled, and minutes-linked records keep calendar status and outcome verification separate
ok 6 - cancelled, rescheduled, and minutes-linked records keep calendar status and outcome verification separate
  ---
  duration_ms: 0.295268
  type: 'test'
  ...
# Subtest: preserves raw notes verbatim while keeping snapshot, watcher, schedule-check, and blocked-sync timestamps distinct
not ok 7 - preserves raw notes verbatim while keeping snapshot, watcher, schedule-check, and blocked-sync timestamps distinct
  ---
  duration_ms: 240.628978
  type: 'test'
  location: '/home/runner/work/TheReelWindyCity/TheReelWindyCity/tests/civic-calendar.test.mjs:154:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + '2026-10-31T07:10:35Z'
    - '2026-10-30T02:03:04Z'
                ^
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '2026-10-30T02:03:04Z'
  actual: '2026-10-31T07:10:35Z'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///home/runner/work/TheReelWindyCity/TheReelWindyCity/tests/civic-calendar.test.mjs:187:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: rejects corrupt extracted directories under data/meetings without mutating last-known-good records
ok 8 - rejects corrupt extracted directories under data/meetings without mutating last-known-good records
  ---
  duration_ms: 447.641499
  type: 'test'
  ...
# Subtest: a missing capture timestamp yields no age rather than a fabricated one
ok 9 - a missing capture timestamp yields no age rather than a fabricated one
  ---
  duration_ms: 0.790713
  type: 'test'
  ...
# Subtest: latest transcript follows dated holdings, not the newest row or an empty catalog entry
ok 10 - latest transcript follows dated holdings, not the newest row or an empty catalog entry
  ---
  duration_ms: 0.386704
  type: 'test'
  ...
1..10
# tests 10
# suites 0
# pass 9
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 801.91757
