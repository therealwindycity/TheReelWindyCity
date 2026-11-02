# Civic pipeline — adversarial audit and executed verification

## 1. Scope and acceptance criteria

This audit hardens the existing municipal evidence pipeline. It does not turn
unverified allegations into findings, solve provider authentication by assertion,
or replace unavailable target footage with unrelated recordings.

Acceptance criteria:

1. Rerunning a database with existing source inspections and votes must not
   delete parent records or violate foreign keys.
2. Failed network or media operations must not expose stale files as fresh results.
3. Every downloaded source must have a current-run ledger entry and SHA-256.
4. Source inspection must isolate malformed, empty, encrypted and unsupported PDFs.
5. Source dates and document roles must be checked independently of supplied labels.
6. Named votes must come from explicit source wording, not expanded aggregate prose.
7. Missing stages, mixed run IDs, changed files and contradictory ledgers must fail.
8. Every completed montage must have all requested segments, expected durations,
   a valid output hash and a complete decoding check.
9. Evidence artifacts must survive a failed quality gate; that gate must remain red.
10. Known sign-in/403 barriers must not be retried on every routine source-code push.

## 2. Dependencies and state transitions

```text
validated targets
    -> exclusive retrieval workspace lock
    -> SQLite case/source UPSERT + bounded public-source retrieval
    -> atomic run_report.json with new run_id
    -> independent PDF hash/type/date/role inspection
    -> source_inspections + explicitly named vote records
    -> optional official-media discovery and clipping (explicit request only)
    -> completion gate: run IDs + SQLite + raw bytes + extracted text + media
    -> completion_report.json + evidence manifest
    -> always-upload Actions artifact
    -> nonzero final job status if gate failed
```

Retrieval success does not imply successful PDF inspection. PDF inspection does
not validate every factual proposition. A matching SHA-256 establishes byte
identity, not authenticity of the document's statements. Named-vote extraction
records what the retrieved minutes say; it is not independent audio verification.
Rendered footage does not establish the supplied case association or allegation.
Editorial publication readiness remains false in the automated reports.

Independent CLI writers are excluded only during the retrieval command. GitHub
jobs use isolated workspaces and branch-level concurrency. Independently invoked
local downstream commands must use separate workspaces or external coordination.
Crash-left lock files require inspection; the program does not automatically
steal a possibly active writer's lock.

## 3. Findings and implemented repairs

| Finding | Failure consequence | Implemented repair | Verification |
|---|---|---|---|
| Case REPLACE semantics | Existing source/vote children could break a rerun | Case UPSERT updates in place | Foreign-key preservation test |
| Source REPLACE semantics | Newly added inspection child records could break the next retrieval | Source UPSERT updates in place | Inspect twice, then retrieve again with children present |
| Stale source bytes | A previous successful response could appear current after a failed request | Clear current role file/partial and ledger path/hash on failure | Failed/empty retrieval tests |
| Stale montage files | Previous or partially concatenated output could appear successful | Remove current final before inputs; remove partial final on failure | Missing inputs, concat failure and short-clip tests |
| Unchecked source paths | A modified ledger could direct inspection outside sources | Resolve path and require workspace-source containment | Escaping-path test |
| Unchecked file identity | Modified bytes could be mistaken for retrieved evidence | Compare ledger, run report and current bytes | Source tamper and ledger disagreement tests |
| Unchecked extracted text | Altered excerpts could retain the appearance of provenance | Store and compare extracted-text SHA-256 | Extracted-text tamper test |
| Single PDF failure aborted batch | Later sources/votes could disappear from results | Per-source structured failure and continued processing | Corrupt source beside successful vote extraction |
| Incorrect source labels | Purchasing memos or wrong-year minutes appeared valid | First-page proceedings/memo classification and date comparison | Memo/date tests and live hosted source checks |
| Named votes existed only in a one-off export | Hosted SQLite omitted the documented explicit yes votes | Narrow, idempotent PDF extraction rule with page/hash locators | Correct/wrong date/context/action and rerun tests |
| Arbitrary media candidates | HTML could nominate an unrelated media host | HTTPS, exact official host, no credentials/unapproved port | Host, scheme, credentials and port tests |
| Short or audio-less clips | Incomplete footage could enter a montage | Audio mapping and duration checks before concat | Missing audio and short-duration tests |
| Final file merely existed | Concat/decode failure could go undetected | Final duration, complete decode and output hash | Positive mocked render chain and concat failure tests |
| Oversized annotations | GitHub could truncate a JSON notice into invalid data | Bounded valid-JSON notice fallback | Oversized Unicode notice test |
| Too many notices per step | Media notices could exceed GitHub's per-step limit | Eight source notices plus one discovery summary | Workflow/source structure review |
| Artifact upload made job green | Incomplete work looked successful | Final gate after artifact upload | Hosted run fails visibly on three associations |
| Routine media retry loops | Every push repeated known blocked requests | Boolean workflow_dispatch opt-in; pushes skip media | Workflow validation and hosted skipped-step verification |
| Draft claimed votes table stayed empty | Later inspection populated votes but text remained inaccurate | Explain stage-specific named-vote extraction instead | Draft disclaimer regression test |

## 4. Input and resource boundaries

- Target IDs: unique ASCII letters, numbers, underscore or hyphen; 1–96 characters.
- Dates: exact `YYYY-MM-DD` syntax and valid calendar date.
- Cue timestamps: ASCII `HH:MM:SS`; minutes and seconds below 60.
- Segment duration: integer 1–300 seconds; booleans and fractional values rejected.
- Supplied source URLs: HTTPS Cheyenne Granicus documents and HTTPS YouTube video
  hosts; URL credentials and nonstandard ports rejected.
- Advertised official media: HTTPS `archive-stream.granicus.com`, default/443 port,
  no URL credentials/fragment, MP4 or M3U8 path.
- Document response read: at most 25 MiB, 15-second request timeout.
- Player response read: at most 2 MiB, 15-second request timeout.
- PDF inspection: at most 300 pages and 20,971,520 extracted characters.
  These limits do not guarantee a fixed RAM ceiling for pathological compressed PDFs.
- External command timeout: 600 seconds per render/download invocation.
- Stream I/O timeout for official FFmpeg attempts: 20 seconds.
- FFprobe timeout: 30 seconds; duration must be finite, positive and below one day.
- Normalized footage: 1280×720, 30 fps, H.264/yuv420p, AAC, 48 kHz stereo.
- Rendered segment duration tolerance: two seconds; final montage duration is
  compared with component/requested duration, then completely decoded.
- Workflow timeout: 50 minutes; artifact retention: 14 days; repository token:
  read-only contents permission.

Redirect behavior, PDF parser resource usage, provider behavior and every
possible malformed PDF are not exhaustively proven safe by this suite. Claims
of universal edge-case coverage or production certification would be unsupported.

## 5. Local verification

Latest local suite: **57 tests, zero failures, zero errors, zero skipped**.
Network/media tests use explicit synthetic fixtures and mocks; they are not
measurements of remote provider access or recordings of actual meetings.

Coverage of the four audited modules:

| Module | Combined statement/branch coverage |
|---|---:|
| civic_engine.py | 90% |
| civic_run_status.py | 82% |
| inspect_civic_sources.py | 95% |
| official_civic_montage.py | 91% |
| Combined | 90% |

Exact combined measurement before the final constant-name-only cleanup:
549/593 statements covered and 162/196 branches covered. Combined fraction:
`(549 + 162) / (593 + 196) = 90.11406844106465%`.
The suite is not 100% path coverage. Full test names/output and machine-readable
coverage are saved in the ignored export workspace.

```sh
.venv/bin/python -m unittest discover -s tools -p 'test_civic*.py' -v
COVERAGE_FILE=arena_workspace/civic-coverage.sqlite3 .venv/bin/python -m coverage run \
  --branch --source=civic_engine,inspect_civic_sources,official_civic_montage,civic_run_status \
  -m unittest discover -s tools -p 'test_civic*.py'
COVERAGE_FILE=arena_workspace/civic-coverage.sqlite3 .venv/bin/python -m coverage report
```

## 6. Hosted verification

[Run 41438889283](https://github.com/therealwindycity/TheReelWindyCity/actions/runs/41438889283)
ran the hardened document-only path against public sources.

| Stage | Observed outcome |
|---|---|
| Regression tests at that commit | 56 passed; final local suite subsequently added one draft-text test |
| Full committed linked-corpus search | Completed |
| Public document retrieval | Eight responses retrieved |
| Independent PDF/source inspection | Eight sources inspected with matching hashes |
| Explicit named votes | Two imported into hosted SQLite |
| Optional media installation and requests | Skipped, as configured |
| Artifact upload | Completed; 2,169,265-byte artifact reported by GitHub API |
| Final quality gate | Failed deliberately on three source role/date issues |

The gate's structured report explicitly states `documents_complete=true`,
`source_associations_valid=false`, `named_votes_imported=2`,
`media_complete=false`, `publication_ready=false`, `objective_complete=false`
and `execution_gate_passed=false`.

The three live-source issues were:

1. Fleet “minutes” URL: a purchasing **memo dated May 6, 2026**.
2. Highlands minutes URL: proceedings dated **July 14, 2025**, not July 13, 2026.
3. Stormwater minutes URL: proceedings dated **March 23, 2026**, not October 26.

The original supplied registry is retained as provenance; the pipeline does not
silently relabel those sources to manufacture a passing gate.

## 7. Remaining constraints

- The earlier hosted media run observed sign-in/bot challenges for all four
  YouTube requests and HTTP 403 for all four public Granicus streams. The
  hardening run did not retry them and makes no new media-access claim.
- Authentic target footage and authenticated cue context remain unavailable.
- The larger Drive JSON was not downloaded. The separately identified compressed
  repository copy was searched, but it is not byte-identical to that Drive file.
- Source-content/legal interpretation, original speaker attribution and a full
  independently checked roll call remain outside the automatic extraction rule.
- PR #34 remains open on the fixed session branch. No merge to main, automatic
  posting, private Drive upload or media publication was performed.
