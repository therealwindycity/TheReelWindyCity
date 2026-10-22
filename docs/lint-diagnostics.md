# Narrow ESLint diagnostics

The stage diagnostic reported lint/unclassified on integration commit 0df8ebc034388cb53e729c0ce047a45ced5c6e0f. This is the first observed failure, not proof that it explains the separate static build failure.

lint-locator.yml runs the existing ESLint configuration with JSON output. A downstream check name carries only the first severity-2 finding's sanitized repository-relative file, line and rule ID. Raw messages and source snippets are not copied into job names or committed files. Warnings remain warnings. A missing/invalid report yields an incomplete result, not a passing result.

The workflow is additive, contents:read only, and does not change lint rules, disable required CI, persist checkout credentials, write to the repository, access Drive, deploy or upgrade billing. It runs automatically on matching integration-branch pushes, with 10-minute collection and 2-minute report timeouts. Existing branch CI may also rerun after the commit.

Local validation: YAML structure, Bash syntax and four mocked ESLint report cases, including suppression of raw message content from metadata. This is not a real repository lint pass or a root-cause fix. Inspect the actual finding before editing code. Overall readiness remains approximately 14% until acceptance gates are completed.
