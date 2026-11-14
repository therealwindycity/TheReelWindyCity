# Resume here: Windy City remediation handoff

Packaged 2026-11-14 ~04:50 UTC (evening of 2026-11-13, Mountain).

This package holds finished, locally verified fixes that were never pushed, because the session that made them had no write access to GitHub. Upload this zip to a new session once GitHub access is available and ask for the patches to be applied and pushed.

## What is in the package

| Path | Contents |
|---|---|
| `REMEDIATION-REPORT.md` | Full status of the work order: what was already done, what was fixed, what is left, and decisions for the owner. Read this first. |
| `patches/TheReelWindyCity/` | 4 patches for `therealwindycity/TheReelWindyCity`. |
| `patches/therealwindycity-backend/` | 2 patches for `bartimoussmith-oss/therealwindycity`. |
| `bundles/` | The same commits as git bundles, which keep the exact commit hashes. |
| `evidence/` | Before/after screenshots, saved copies of the live pages, CI replica logs, and helper scripts. |
| `SHA256SUMS.txt` | Checksums of every file in the package. |

## Exact starting points

| Repo | Base commit on `main` | Branch | Tip after applying |
|---|---|---|---|
| `therealwindycity/TheReelWindyCity` | `2a741e662e6f1a7887207a7d76d35ab9eaa83e40` | `fix/ci-a11y-harvest-2026-11-13` | `7f6dbcf241fbe88a6754595fed4b17ff4ebf084a` |
| `bartimoussmith-oss/therealwindycity` | `714d0d1b73c1512dbda1c2049225cd2b82eece84` | `fix/harvest-2026-11-13` | `d2b72e4d36663ef8711d332744a2e5303165aa64` |

Commit author on all commits: `bartimoussmith-oss <bartimoussmith-oss@users.noreply.github.com>`, as the repos' `READ-FIRST.md` requires.

## Steps for whoever resumes

1. Check whether `main` has moved past the base commit in either repo. Both repos get automated commits several times a day, so it probably has.
2. Apply the patches on top of the current `main`:
   ```bash
   git checkout -b fix/ci-a11y-harvest-2026-11-13 origin/main
   git am --3way /path/to/patches/TheReelWindyCity/*.patch
   ```
   Use the matching branch name and patch folder for the backend repo. To get the original commit hashes instead, run `git fetch /path/to/bundles/<repo>.bundle '<branch>:<branch>'` and rebase that branch onto `main`.
3. If a patch conflicts, the likely files are `READ-FIRST.md` (append-only work log; keep both sides) and the workflow files under `.github/workflows/`.
4. Re-run the checks before pushing.
   - Frontend: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run test:wyoming-watch`, `NEXT_PUBLIC_BASE_PATH=/TheReelWindyCity npm run build`, `npm run test:seo`, `npm run test:text-separation`, `python3 -m unittest tests/test_granicus_harvester.py`.
   - Backend: `python3 -m unittest tests/test_granicus_harvester.py`.
5. Follow `READ-FIRST.md` in each repo: add an active claim naming `.github/` and `database/` before pushing, pull with rebase first, and never force-push.
6. Push the branch and open a pull request, or merge to `main` if the owner says so.
7. After merge, confirm on GitHub that the `CI` workflow passes on the frontend and that the next `Promethean Recurring Harvest` run finishes within 75 minutes and produces a commit.

## Not included in the patches

These need the owner's decision or action. Details are in `REMEDIATION-REPORT.md`.

- `wyoming-verify` in the backend repo still fails: commit `fcae4ea` removed the robots.txt check and redirect refusal from `engine/ingest.py`, and `tools/test_wyoming_ingest_safety.py` still asserts both.
- Whether the harvester should obey the Granicus `robots.txt`, which disallows it. The `--respect-robots` flag exists; it is off by default.
- The public Streamlit app was serving code from before 2026-11-12 and needs a reboot from the Streamlit Cloud dashboard.
- Meetings from 2026-09-21 onward have no archived documents. Nothing was backfilled.
- The two legacy repos have no README notice pointing to the live site.

## What was not verified

- No GitHub Actions run of these commits.
- No run of the harvester against the real Granicus site.
- No deployment.
