# Work order status: Civic Cheyenne / The Real Windy City

Observed 2026-11-14 04:00–04:35 UTC (evening of 2026-11-13, Mountain).
Checked against `TheReelWindyCity` at `2a741e6` and `bartimoussmith-oss/therealwindycity` at `714d0d1`.

Nothing has been pushed. I had no write access to GitHub from this session, so the remaining work is delivered as patches in `patches/`. Both patch sets apply cleanly to the current remote `main` of each repo.

## Status by task

| # | Work-order task | State when I looked | What I did |
|---|---|---|---|
| 1 | Unblock CI and Deploy | Deploy is green and live (run 43554203989, revision `2a741e6`). CI is red on one stale test. | Fixed the test. Patch 0001. |
| 2 | Sync the meetings index | Already done. Counts are computed and match (1,007 on `/meetings/` and on meeting pages). | Nothing to change. The Oct–Nov document gap is real and is not fixed (see below). |
| 3 | Text concatenation and WCAG | Mostly already done. One real defect on `/transcripts/`. | Fixed it and added a regression test. Patch 0002. |
| 4 | Harvester workflows | Broken, for different reasons than the audit lists. | Rewrote the harvester and both workflows. Patch 0003 (both repos). |
| 5 | `wyoming-verify` | Red since 2026-11-07. It is a policy conflict, not checksum drift. | Not changed. Needs your decision. |
| 6 | Streamlit hardening | Source already fixed by the other agent, but the live app is serving older code. | Not changed. Needs a reboot from the Streamlit dashboard. |
| – | Legacy repo README notices | Neither README mentions the Pages URL. | Text supplied below. |

## What the other agent had already done

- **Deploy to GitHub Pages** works. Commit `2a741e6` fixed the calendar gate that was failing it, and the live `status/deployment.json` reports that revision.
- **Static export config** was already correct in `next.config.ts` (export, trailing slash, unoptimized images, base path).
- **The PDF fixture** `public/sources/2026-01-26-minutes.pdf` is already tracked.
- **Meeting counts** are computed from the data, not hardcoded. The numbers 948, 726 and 2026-09-28 are no longer in the build.
- **Accessibility basics** were already present: `lang="en"`, a skip link, one `main`, one `h1`, labelled filter controls and named navigation.
- **Streamlit database bootstrap** exists (`remediation_runtime.initialize_databases()`), and the home page was made lazy in `ee2c628`.

## What I fixed

### Reel: CI (patch 0001)
- CI has failed since 2026-11-07 because `tests/wyoming-watch.test.mjs` looked up a workflow step by a display name that commit `a9b4cd7` renamed.
- The test now finds the step by id or command. It passes 9/9.
- I added `public/.nojekyll` as a guard; the deploy did not need it.

### Reel: `/transcripts/` and label separation (patch 0002)
- Each row on `/transcripts/` rendered as one run-on line. Rows now stack as title, date and details.
- Adjacent labels on the meetings, meeting, transcript and shell templates now have explicit whitespace, so text extractors no longer produce strings like `Official agendacheyennecity.org`.
- New `tests/text-separation.mjs` reports 59 findings on `2a741e6` and passes on the branch. It is wired into `package.json` and `ci.yml`.
- Layout moved by 1–8 px on the pages I touched. On `/mynewspace/` at phone width one paragraph wraps one line more.

### Both repos: Granicus harvester (patch 0003)
- **Root cause 1:** the recurring harvest had no time limit. It walked about 960 agendas per run and GitHub cancelled it at the six-hour limit, twice a day.
- **Root cause 2:** its publish step staged nothing, because one of the files in its single `git add` is untracked. No harvest has been committed since 2026-10-31.
- **Root cause 3:** the autonomous harvester (Reel only) crashed on missing PDF libraries and on two command-line options the script did not accept.
- **Root cause 4:** the same file under a second URL raised a uniqueness error and dropped the rest of that agenda.
- The harvester is now time-boxed, resumes where it stopped, and treats duplicates as aliases. The workflows commit first, then rebase and push with retries.
- Nine offline tests pass, including two consecutive runs on one database. A replay of the publish step against a scratch remote landed 0 commits with the old step and 1 with the new one.
- I left `ffmpeg` and `libmagic1` out of the apt install because the harvester does not use them.

## Verification

| Check | Result |
|---|---|
| Reel local replica of every CI step (lint, typecheck, 13 test scripts, build, SEO audit) | all pass |
| Reel browser smoke suite | 15/15 pass |
| Reel text-separation test | passes (59 findings before) |
| Harvester offline tests, both repos | 9/9 pass |
| Patches applied to a fresh checkout of each remote `main` | clean, identical tree |
| GitHub Actions run of these commits | **not run** (not pushed) |
| Harvester against the real Granicus site | **not run** |
| Deployment of any of this | **none** |

## Decisions for you

1. **`wyoming-verify` (backend repo).** Your commit `fcae4ea` ("Permanently use Chrome transport with five redirects") removed the robots.txt check and the redirect refusal from `engine/ingest.py`. `tools/test_wyoming_ingest_safety.py` still asserts both, so all six of its tests error. Every other step in that job passes (20/20, 16/16, selftest, 126 instances). Either restore the strict policy or rewrite the tests to the new one. I did not choose, because it decides whether the collector ignores robots.txt.
2. **Granicus robots.txt.** `cheyenne.granicus.com/robots.txt` disallows every agent except four named search crawlers. The harvester still records the result and fetches anyway, as it did before. `--respect-robots` is there if you want it to stop instead.
3. **Streamlit app is stale.** At 04:25 UTC the public app showed the old three-tab "Municipal Archive" home and 22 sidebar pages, without the Caption Transcript Library page. That is the code from before `ee2c628` (2026-11-12). It loads without errors, but it needs a reboot or redeploy from the Streamlit Cloud dashboard, which only the app owner can do. If the app is deployed from a branch other than `main`, that would also explain it.
4. **`packages.txt` and a `requests` pin.** I did not add them. Only the Scanner Live page imports `requests`, and no page runs OCR at runtime, so system OCR packages would lengthen the Streamlit build for nothing. The audit's claim that `sqlite3` is in `requirements.txt` is wrong.

## Not fixed

- **October–November documents.** Every meeting from 2026-09-21 onward shows 0 archived documents. None exist in the repositories to link, and I did not invent any. They should arrive once the repaired harvest runs and publishes.
- **Six leftover label joins** between separate buttons or tabs on `/hub/signals/`, `/hub/wyoming/` and `/mynewspace/`. A browser and a screen reader already separate these; only tag-stripping tools merge them.
- **The autonomous harvester workflow in the backend repo** is a different, review-only workflow and was left alone.

## How to apply

The repo's `READ-FIRST.md` asks for an active claim before touching `.github/` or `database/`. Each patch set ends with a work-log entry; add a claim first if you want the protocol followed to the letter.

```bash
# Frontend
git clone https://github.com/therealwindycity/TheReelWindyCity && cd TheReelWindyCity
git checkout -b fix/ci-a11y-harvest-2026-11-13
git am /path/to/patches/TheReelWindyCity/*.patch
git push origin fix/ci-a11y-harvest-2026-11-13     # then open a PR, or merge to main

# Backend
git clone https://github.com/bartimoussmith-oss/therealwindycity && cd therealwindycity
git checkout -b fix/harvest-2026-11-13
git am /path/to/patches/therealwindycity-backend/*.patch
git push origin fix/harvest-2026-11-13
```

After merging, the things to watch are the `CI` run on the frontend and the next `Promethean Recurring Harvest` run, which should finish in under 75 minutes and produce a commit.

## Legacy repo notice

For the top of `README.md` in `The-Real-Windy-City-` and `cheyenne-archives-2023-2024`:

```markdown
> **This repository is an archive.** The live site is
> https://therealwindycity.github.io/TheReelWindyCity/ and active development
> happens in https://github.com/therealwindycity/TheReelWindyCity.
```

## Audit claims that did not hold

- The site is not frozen in October, and Deploy is not failing.
- The CI failure is not the PDF fixture.
- Counts are not hardcoded and are already consistent.
- The `( ...` agenda truncation does not reproduce.
- `Source library726` and the brand-bar example appear only when tags are stripped, not in a browser.
- There is no `sha512_hash` column, no `next.config.mjs`, and no `promethean-harvest.yml`.
- The search-index trigger already handles nulls.
- `wyoming-verify` has no shard checksum manifest to regenerate.
