#!/usr/bin/env bash
#
# broadcastify-secrets-setup.sh — the SAFE one-paste way to wire your
# Broadcastify Premium credentials into the audio-fetch automation.
#
# What this does
#   `gh secret set` prompts you for each value (terminal echo off) and stores
#   it as an encrypted GitHub Actions repository secret. The credentials are
#   NEVER written to this repository, the website, or any script file — only
#   the "Fetch Broadcastify Archive Audio (Premium)" workflow can read them,
#   and only while it runs. You can revoke them any time under
#   Settings → Secrets and variables → Actions.
#
# What this deliberately does NOT do
#   There is no web page that accepts your password, and there should not be.
#   This site is a public GitHub Pages site backed by a public repository: a
#   page that takes a password and "updates the scripts" would commit your
#   Broadcastify password to a public repo — readable by anyone, kept in git
#   history forever, and it would make the site look like a credential-
#   harvesting page. Actions secrets are the only safe channel for this.
#
# Usage (on your own computer — or in Termux with `pkg install gh`):
#   ./scripts/sync/broadcastify-secrets-setup.sh
#
# Requires the GitHub CLI (https://cli.github.com), logged in with access to
# therealwindycity/TheReelWindyCity:   gh auth login
#
# After this finishes, fetch the welfare-check audio block:
#   Actions → "Fetch Broadcastify Archive Audio (Premium)" → Run workflow
#   archive_id: 47003-1784499221   mode: artifact | commit

set -euo pipefail

REPO="${GH_REPO:-therealwindycity/TheReelWindyCity}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: the GitHub CLI (gh) is not installed. See https://cli.github.com" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not logged in. Run 'gh auth login' first." >&2
  exit 1
fi

echo "This stores your Broadcastify Premium credentials as encrypted GitHub"
echo "Actions secrets on $REPO. Nothing is written to the repo or the website;"
echo "you will be prompted for each value with terminal echo turned off."
echo

echo "→ Broadcastify username (your account email)"
gh secret set BCFY_USERNAME --repo "$REPO"

echo "→ Broadcastify password (Premium account)"
gh secret set BCFY_PASSWORD --repo "$REPO"

echo
read -r -p "Also store a BCFY_SESSION_COOKIE (the bcfyuser1 value from a signed-in desktop Chrome)? [y/N] " answer
if [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]; then
  echo "Paste the cookie VALUE only (the part after 'bcfyuser1=')."
  gh secret set BCFY_SESSION_COOKIE --repo "$REPO"
  echo "Stored. If present, the workflow uses the cookie instead of signing in"
  echo "(cookies expire — the username/password secrets are the durable path)."
else
  echo "Skipped. The workflow will sign in with the username/password secrets."
fi

echo
echo "Secrets now configured on $REPO:"
gh secret list --repo "$REPO"
echo
echo "Next step — fetch the welfare-check audio block:"
echo "  Actions → 'Fetch Broadcastify Archive Audio (Premium)' → Run workflow"
echo "  archive_id: 47003-1784499221"
echo "  mode:       artifact (download from the run page) or commit (publish to the site)"
