# AGENT WORK ORDER: APPLY WINDY CITY REMEDIATION HANDOFF

This branch (`handoff/remediation-v2`) contains the verified remediation package (`windycity-remediation-handoff-v2.zip` and unpacked `unpacked/windycity-remediation-handoff/`).

## Owner Decisions (Authorized for Immediate Execution)
1. **Frontend (`therealwindycity/TheReelWindyCity`):**
   - Apply patches `0001`, `0002`, and `0003` from `unpacked/windycity-remediation-handoff/patches/TheReelWindyCity/` onto `origin/main` using `git am --3way`.
   - Append the `0004` work-log entry to `READ-FIRST.md` (resolve any append conflict by keeping both entries).
   - Add explicit `{" "}` spacing between the 6 leftover adjacent button/tab labels on `/hub/signals/`, `/hub/wyoming/`, and `/mynewspace/`.
   - Run `npm ci && npm run lint && npx tsc --noEmit && npm run test:wyoming-watch && NEXT_PUBLIC_BASE_PATH=/TheReelWindyCity npm run build && npm run test:seo && npm run test:text-separation && python3 -m unittest tests/test_granicus_harvester.py -v`.
   - Rebase onto `origin/main` and push directly to `main` (never force-push).

2. **Backend (`bartimoussmith-oss/therealwindycity`):**
   - Apply patch `0001` from `unpacked/windycity-remediation-handoff/patches/therealwindycity-backend/` onto `origin/main` using `git am --3way`.
   - Sync the hardened `.github/workflows/promethean_autoharvest.yml` from the frontend patch.
   - Fix `wyoming-verify`: keep commit `fcae4ea` (Chrome transport with 5 redirects) as default in `engine/ingest.py`, and align `tools/test_wyoming_ingest_safety.py` (or add optional `respect_robots`/`max_redirects` parameters) so all 6 tests in `python3 -m unittest tools/test_wyoming_ingest_safety.py -v` pass.
   - Append the `0002` work-log entry to `READ-FIRST.md`, rebase onto `origin/main`, and push directly to `main`.
