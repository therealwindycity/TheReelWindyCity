# Repository audit: alleged divergence matrix and historical financial analytics

## Conclusion

The asserted **“Watchdog Efficacy & Text-to-Action Divergence Matrix” is not
substantiated as an implemented system by this audit**. Related research tools
and storage schemas exist, but they must not be conflated with automatic
speaker authentication, complete roll-call reconciliation, financial tracing,
or verified misconduct findings.

This was ordinary read-only access to public repository content, not a bypass
of authentication or an exploit of a hidden system.

## 1. Repository, scope and reproducibility

Audited repository: `bartimoussmith-oss/therealwindycity` at immutable reference
[`74edf0adbc9f4539f8af5fc5aaf51b33878c8955`](https://github.com/bartimoussmith-oss/therealwindycity/tree/74edf0adbc9f4539f8af5fc5aaf51b33878c8955).
The returned recursive tree contained 7,398 entries and was not truncated.

The content audit inspected **1,368 selected files**:

- 182 files with the explicitly selected code/configuration extensions,
  including all 142 `.py` files in that tree;
- 1,183 non-scanner JSON files, including the 33,313,552-byte public linked
  meeting database;
- three additional selected explanatory documents. The selected fourth document,
  the Drive-import manifest, is already included among the JSON files.

Every inspected blob was matched against its Git object SHA. Local files were
used only if their Git blob hash matched the upstream object; otherwise the
immutable object was fetched through the GitHub API. Four SQLite databases
were profiled read-only from verified snapshots. Python seed scripts were not
executed to populate evidence.

Scope exclusions: 405 scanner-result JSON files, binary/audio/video analysis,
most prose-only files, all-branch history, renamed historical paths, inaccessible
or private repositories, and records not present in the inspected sources.
No claim is made that a differently named feature could never have existed.
A GitHub code-search query returned `incomplete_results=true`; its empty result
was not used as the basis for negative findings. Blob-content inspection was.

The reproducible auditor is `tools/audit_repository_claims.py`. Its 21 offline
regression tests cover Git hashing, path validation, explicit selection, array
and scalar JSON handling, literal-key versus semantic interpretation, exact
marker offsets, modified local files, corrupted cache/downloads, size bounds,
concurrent identical-object writes and read-only SQLite snapshots.

## 2. Claimed names and fields: observed results

| Claimed mechanism or field | Result in selected content |
|---|---|
| Watchdog Efficacy | No matching identifier/phrase found |
| Text-to-Action Divergence | No matching identifier/phrase found |
| Ghost Quorum | No matching identifier/phrase found |
| Consultant Absorption Ratio | No matching identifier/phrase found |
| `reserve_drawdown` | No matching identifier or JSON key found |
| `spet_transfer` | No matching identifier or JSON key found |
| `transcript_linked` | No matching identifier or JSON key found |
| `action_items` | No matching identifier or JSON key found |
| `voiceprint` / `voice_print` | No matching identifier found |
| `sentiment` substring | 57 lexical occurrences, limited to tokenizer vocabulary and transcript text; not evidence of a sentiment-to-vote pipeline |

The only counted JSON keys named `amount`, `attendance` and `vendor` were in
model-tokenizer vocabulary, not a municipal transaction or attendance schema.
This is an important false-positive boundary: dictionary-key presence is not
proof of a domain data model.

## 3. What actually exists

### 3.1 Rhetorical/voting storage schema — not a populated divergence engine

The real [rhetorical profiling SQL schema](https://github.com/bartimoussmith-oss/therealwindycity/blob/74edf0adbc9f4539f8af5fc5aaf51b33878c8955/database/schema_rhetorical_profiling.sql)
defines these relevant fields:

- `officials`: `official_id`, `full_name`, `role_title`, `jurisdiction`,
  `ward_or_district`, `active_status`, `rhetorical_baseline_json`, `updated_at`.
- `governance_items`: `item_id`, `granicus_clip_id`, `meeting_date`,
  `committee_or_body`, `ordinance_or_res_num`, `title`, `category`,
  `attachment_sha256`, `local_pdf_path`, `source_url`, `extracted_text`, `created_at`.
- `voting_record`: `vote_id`, `item_id`, `official_id`, `vote_cast`,
  `motion_role`, `stated_rationale`, `timestamp_offset`.
- `veracity_audit`: `audit_id`, `official_id`, `item_id`, `statement_date`,
  `public_claim`, `statutory_fact`, `contradiction_type`, `severity_score`,
  `rhetorical_tactic`, `evidence_citation`, `created_at`.

`vote_cast` allows `AYE`, `NAY`, `ABSTAIN`, `ABSENT`, `EXCUSED`.
`motion_role` allows `MOVED`, `SECONDED`, `AMENDED`, `NONE`.
`severity_score` is a stored integer constrained to 1–10; that constraint is
not an algorithm computing a validated risk score. The reviewed triggers copy
inserted records into FTS; they do not implement voice recognition or compare
political sentiment with votes.

The verified upstream `database/promethean_evidence.db` snapshot contained:

| Table | Rows |
|---|---:|
| officials | 0 |
| governance_items | 14 |
| voting_record | 0 |
| veracity_audit | 0 |
| entity_edges | 0 |
| document_tamper_log | 0 |

One of the 14 governance items had nonempty extracted text. These counts do not
support the asserted operational official-to-statement-to-vote reconciliation
in that database. Schema capability is not populated analytic coverage.

### 3.2 Watchdog tables — authored records, not automatic financial reconstruction

The [watchdog vault script](https://github.com/bartimoussmith-oss/therealwindycity/blob/74edf0adbc9f4539f8af5fc5aaf51b33878c8955/cheyenne_watchdog_vault.py)
contains literal Python seed lists for public-comment cases, contradictions,
vouchers and environmental-zone assertions.

Its verified upstream database contains 7 `public_comment_battles`,
5 `veracity_contradictions`, 6 `voucher_forensics` and 4 `environmental_zones`
rows. Stored labels such as `CONFIRMED EXACT` are authored assertions, not
proof of independent verification by the ingestion code.

The exact existing voucher-table definition is:

```sql
CREATE TABLE voucher_forensics (
    item_id TEXT PRIMARY KEY,
    check_date DATE,
    vendor TEXT,
    amount REAL,
    department TEXT,
    description TEXT,
    miller_claim TEXT,
    audit_status TEXT
);
```

This is not a reconstructed SPET allocation ledger. It lacks ballot measure,
restricted fund, appropriation, project, contract/amendment, invoice/payment,
receipt, transfer and project-lifecycle foreign keys. No existing SPET-specific
allocation schema or Consultant Absorption Ratio implementation was established.

### 3.3 Municipal text database — useful document evidence, not complete finance

The matching upstream `civic.db` contains 51 meetings, 1,310 documents,
17,619 pages, 16,078 extracted facts and 1,800 agenda items.

Its extracted-fact table uses `id`, `doc_id`, `page`, `kind`, `key`, `value`,
`span`. Agenda items use `id`, `meeting_id`, `item_no`, `title`, `action`,
`sponsor`, `consent`. These support source-linked document review but are not
an authenticated payment ledger, biometric speaker registry or normalized
historic roll-call table.

The other inspected upstream `data/engine.db` contained 280 monitored documents,
1,313 versions and 1,109 alerts. Counts of monitoring versions/alerts must not
be relabeled as substantiated financial violations or independent meetings.
Full table/column inventories are in `schema_inventory.json` in the audit bundle.

### 3.4 Public transcript-comparison tool — real, but explicitly candidate-only

The actual [estoppel-effect algorithm](https://github.com/bartimoussmith-oss/therealwindycity/blob/74edf0adbc9f4539f8af5fc5aaf51b33878c8955/tools/estoppel_effect.py)
and its [documented parameters](https://github.com/bartimoussmith-oss/therealwindycity/blob/74edf0adbc9f4539f8af5fc5aaf51b33878c8955/tools/ESTOPPEL_EFFECT_ALGORITHM.md)
use deterministic phrase patterns, source locators, deduplication, lexical
similarity and human review fields. They do not infer an official's stance from
sentiment or establish a contradiction/causal/legal effect automatically.

The feature is openly represented by
[`pages/23_Estoppel_Effect.py`](https://github.com/bartimoussmith-oss/therealwindycity/blob/74edf0adbc9f4539f8af5fc5aaf51b33878c8955/pages/23_Estoppel_Effect.py)
and linked in the Streamlit entrypoint; it is not established as a secret
frontend-bypassing tracking mechanism.

Executed default configuration:

| Parameter | Value |
|---|---:|
| Minimum cue alignment score | 0.80 |
| General shared-issue-term setting | 2 |
| Cross-meeting normal floor without later chronology marker | At least 3 shared terms |
| Minimum lexical TF-IDF cosine | 0.08 |
| Retained pairs per Miller anchor event | 3 |
| Maximum cross-meeting gap | 3,650 days |
| Cross-body comparisons | Disabled by default |
| Nearby-pattern cluster gap | 70 words |
| Maximum clustered span | 130 words |
| Excerpt context | Up to 45 words before and 65 after |

The executed run produced 926 source records, 7,678 pattern events and
479 comparison candidates: 200 cross-meeting chronology, 8 same-meeting sequence
and 271 source cross-check candidates. Those are not 479 verified contradictions.
The 926 source records combine cues and meeting text, not 926 independent
meetings. Review fields remain `unreviewed`/`unassessed`; the score is not a
probability, severity or confidence measure.

## 4. Historical inventory: document counts are not roll-call joins

I executed the existing [archive cataloger](https://github.com/bartimoussmith-oss/therealwindycity/blob/74edf0adbc9f4539f8af5fc5aaf51b33878c8955/tools/archive_index.py)
against six public archive repositories. All six tree responses were reported
as untruncated. The November 2 snapshot returned:

- **5,140 blobs**, 6,970,150,704 bytes;
- **4,935 `.pdf`-suffixed paths**, 187 `.bin` files and 18 Markdown files;
- **5,116 date-parsed records**, 24 undated/unparsed records;
- 818 distinct parsed dates, from May 27, 2008 through June 8, 2026;
- 215 ambiguous dates, 431 two-digit-year records and 7 date conflicts.

The `cheyenne-archives-2008-2013` repository alone has **1,006 blobs**:
**1,003 `.pdf` paths and 3 Markdown files**, not 1,006 `.json` files.
That count offers a plausible source for a numerical conflation, not proof of
how the claim originated. The asserted 5,118 roll-call-checked documents was not
reproduced. Catalog enumeration/date parsing does not authenticate document
contents, extract votes, identify voices or prove quorum anomalies.

## 5. The supplied extraction script does not match the inspected data

The inspected 1,183 non-scanner JSON files had 1,172 object roots and 11 array
roots. None had an `action_items`, `reserve_drawdown`, `spet_transfer` or
`transcript_linked` JSON key. The public linked meeting JSON is a 720-element
array with record fields:

```text
id, title, filename, date, category, turns, raw_text_length,
agendas, minutes, supporting_documents
```

Consequences for the supplied script:

1. Calling `.get()` on an array-root file raises `AttributeError`.
2. Examined object-root files without `action_items` are skipped rather than
   yielding evidence of a working fiscal-mutation detector.
3. Key presence is not a financial event: `reserve_drawdown: false` or a zero
   amount would still pass the supplied membership test.
4. Falsy metadata does not establish a concealed action; it may indicate an
   unlinked, unavailable, differently indexed or unsupported transcript.
5. A string value such as `"false"` is truthy in Python and defeats the intended
   boolean test. A boolean tag is not authentication of a transcript link.
6. Null/non-list action collections and string/non-object items cause additional
   type errors. Invalid JSON or inaccessible files stop the walk without
   per-file failure reporting.
7. There are no source hashes, motion/version joins, speaker verification,
   actual vote records, amount validation, provenance checks or deduplication.
8. The label “high risk” is not justified by those conditions. At most, a valid
   implementation of such a check would identify a documentation-gap candidate.

The delivered auditor safely handles object/array/scalar roots and preserves
provenance; it deliberately does not invent financial anomalies from the absent
schema or assign risk scores to missing transcript links.

## 6. Assessment of the three proposed vectors

### A. Attendance/speaker discrepancy candidates

A credible implementation needs meeting ID, motion/version ID, official ID,
attendance intervals, remote-participation/arrival/departure times, an explicit
roll-call source and authenticated speaker context for the same time interval.
A caption speaker tag is not a biometric voiceprint. Initial absence followed by
arrival, a remote connection, a quotation or a mislabeled speaker can explain
apparent disagreement. Attendance discrepancies also do not themselves establish
that legal quorum was absent.

The reviewed voting table is empty, no voiceprint mechanism was found in the
selected code, and the catalog does not perform the asserted reconciliation.
This vector is **not demonstrated as implemented** by the evidence examined.

### B. SPET ballot-to-expenditure comparison

Necessary joins are ballot measure/version → restricted fund → appropriation
and amendment → project → contract and amendments → invoice → actual payment
and credits → project milestone/status as of a stated cutoff. Award value,
encumbrance and actual paid expenditure are different amounts and must not be
mixed. Vendor identities and related entities require independent resolution.

A proposed accounting indicator, **not an existing metric found here**, could be
`net consultant payments / net total project expenditures` over the same project
and date window, with an undefined result when the denominator is nonpositive.
Refunds and adjustments can make simple ratios unstable; do not silently clamp
or label an exceptional value as fraud. A high design share during feasibility,
permitting or a legitimately canceled project is not evidence of laundering.

A proposed semantic distance, also **not established as implemented**, could be
`1 - cosine(ballot_embedding, contract_embedding)` with a recorded model/version,
normalization, chunking, document scope and reviewed threshold. For general
real-valued embeddings its mathematical range is [0,2], not necessarily [0,1];
zero-norm vectors are undefined. Broad ballot language and narrow supporting
service descriptions can differ legitimately. Similarity does not decide legal
scope or compliance.

The six authored voucher rows do not supply this lifecycle or denominator.
The asserted laundering-pattern or firm-specific risk inference is unsupported.

### C. Intergovernmental pass-through timing

A valid timing analysis needs the award and restrictions, receipt/recognition
and legally available dates, authorized payment schedule, beneficiary/program
obligations, disbursements, fund-level journals, bank/investment reconciliations,
and interest allocation. A lag should use the legally relevant availability
clock—not automatically the date a deposit appeared in a pooled account.
Negative or missing intervals require reconciliation rather than forced zeros.

Cash pooling or a long lag alone does not establish improper diversion. The
applicable grant terms and accounting transactions determine whether balances,
interest and uses were permissible. No joined receipt-to-outlay/escrow tracing
model was established in the inspected schemas, keys or code. The asserted
use of grant cash to cover deficits therefore remains unsubstantiated.

## 7. Commit history: what was and was not removed

I queried the pinned main ancestry for four current paths, with a 100-entry
per-path bound. Returned counts were 1, 2, 1 and 1; none reached that bound.
This is not an all-branch, rename-following or unreachable-commit investigation.
The local checkout is shallow, so it cannot independently establish a complete
historical absence claim.

| Path | Observed history evidence |
|---|---|
| `database/schema_rhetorical_profiling.sql` | Added October 31, 2026 in [`0d49222d6f30`](https://github.com/bartimoussmith-oss/therealwindycity/commit/0d49222d6f30a7ad36c98c4a42fd0c29a42f7a69) |
| `tools/estoppel_effect.py` | Added October 18, 2026 in [`53e261e6fe2a`](https://github.com/bartimoussmith-oss/therealwindycity/commit/53e261e6fe2a5b13527aebd7235a2ae4ca2359eb) |
| `tools/archive_index.py` | Added October 28, 2026 in [`169b3550220f`](https://github.com/bartimoussmith-oss/therealwindycity/commit/169b3550220f22c8ce37a64545b5d1944f1ff433) |
| `cheyenne_watchdog_vault.py` | Two returned events, September 10 and October 25. The inspected October 25 [`fdaff9b806b5`](https://github.com/bartimoussmith-oss/therealwindycity/commit/fdaff9b806b53157a8eae7cd58606e6c347718ce) diff makes the DB path repository-relative, removes a duplicate voucher literal and normalizes formatting. It does not demonstrate removal of the alleged matrix. |

The repeated voucher literal used the same primary key under `INSERT OR REPLACE`;
removing that duplicate literal does not itself show loss of a distinct stored
voucher row. No reviewed diff establishes that a voice/vote/SPET/grant tracking
feature was quietly stripped. Even an actual deletion would require evidence
before attributing a concealment motive.

## 8. Deliverables, tests and exact commands

Generated audit outputs, kept out of Git:

- `repository_claims_audit.json`: per-file Git hashes, acquisition provenance,
  exact marker locations, JSON profiles and database schemas/counts;
- `schema_inventory.json`: complete table/column/DDL profiles of the four
  verified public database snapshots;
- `repository_history_review.json`: bounded path history and inspected patches;
- `archive-index/catalog.json`: all enumerated records and date caveats;
- `estoppel_execution_summary.json`: input hashes, thresholds and run counts;
- full candidate JSON/CSV, explicitly unreviewed, included in the audit bundle.

Executed tests: **21 auditor tests**, **7 existing estoppel-effect tests**,
**53 archive-index tests**, and **57 civic-pipeline regression tests** passed.
Those tests validate tooling behavior, not the truth of financial allegations.

Reproduce the content audit:

```sh
mkdir -p arena_workspace/repository-audit
gh api 'repos/bartimoussmith-oss/therealwindycity/git/trees/74edf0adbc9f4539f8af5fc5aaf51b33878c8955?recursive=1' \
  > arena_workspace/repository-audit/upstream_tree.json
.venv/bin/python tools/audit_repository_claims.py \
  --tree arena_workspace/repository-audit/upstream_tree.json
.venv/bin/python -m unittest discover -s tools -p 'test_repository_claims.py' -v
```

Reproduce the real existing candidate and inventory tools:

```sh
.venv/bin/python tools/archive_index.py catalog \
  --out arena_workspace/repository-audit/archive-index
.venv/bin/python tools/estoppel_effect.py \
  --out arena_workspace/repository-audit/estoppel_candidates.json \
  --review-csv arena_workspace/repository-audit/estoppel_candidates.csv
```

Archive catalog enumeration uses the repositories' heads at fetch time; it can
change on a later run. The content audit instead pins the upstream reference.
No original records, application code, database seed lists or source schemas
were edited by this audit. No fund movements, legal violations, hidden motives
or verified speech-to-vote contradictions are established by these results.
