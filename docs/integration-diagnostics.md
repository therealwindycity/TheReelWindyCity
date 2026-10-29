# Integration diagnostics

Purpose: reveal controlled failure-stage/category labels in GitHub check names so the connected GitHub reader can inspect failures without requiring the user to fetch logs. GitHub job outputs feed the downstream report job name. No raw log text is put into check names.

This is additive diagnostics, not a replacement for required CI. It runs install, lint, typecheck, the existing listed regression suites, build and (only after a successful build) SEO. Browser tests are not run here. Controlled labels identify the first observed failure and a heuristic category; neither label alone proves root cause. Consult actual logs or reproduce the failing stage before changing assertions or data.

Only contents:read permission is requested. Checkout credentials are not persisted. There are no repository writes, Drive credentials, production environments or deployment steps. No secrets are referenced. Normal npm/build commands may contact dependency registries and public publisher feeds as existing project scripts do. Logs remain normal GitHub Actions logs; only fixed stage/category labels are emitted in job names.

Automatic trigger: pushes to arena/civic-build-center-2026-10-21 affecting workflow/code/test/config paths. A manual dispatch trigger is also defined. The probe has a 25-minute timeout and report a 2-minute timeout; standard checkout/setup failures or cancellation may yield incomplete/unknown. Runner quota/availability can still prevent execution. No paid upgrade is authorized.

Validation performed locally: YAML structure, Bash syntax and four mocked npm scenarios (all-pass, lockfile failure, scanner assertion failure, build memory failure). No real project install, build, GitHub workflow execution or CI repair is claimed by these tests. Progress stays at the current baseline until the actual diagnostic result is inspected.
