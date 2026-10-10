#!/usr/bin/env bash
#
# broadcastify-premium-termux.sh — one-shot Broadcastify Premium auth (Termux / Android)
#
# THE BIG PICTURE
#   Creating the project's databases and publishing the website is automated in
#   GitHub Actions: deploy-pages.yml re-runs the linkage-database sync before
#   every build and deploys to Pages (hourly + on push to main), and
#   citizen_connect_sync.yml refreshes the Socrata record daily, and
#   broadcastify-archive-fetch.yml downloads archive audio from Actions using
#   repository secrets. This script is the phone/local alternative: it signs
#   in with YOUR credentials directly and prints the download wiring.
#
# WHAT THIS DOES
#   Logs in to Broadcastify with your username + password, captures the session
#   cookie ("bcfyuser1") that Broadcastify sets on success, verifies that the
#   account has Premium archive access, and prints everything needed to wire
#   the Premium session into downloads — including the exact command for the
#   welfare-check archive block from src/data/scanner-archive-links.json:
#     welfare check #2026-00023988 — Laramie County SO, Sun 2026-07-19
#     4:40:08 PM MDT, Prosser Rd & S Greeley Hwy — archive block 47003-1784499221
#     (2026-07-19 4:13–4:43 PM MDT; the dispatch audio is 26m27s into the block).
#
# WHY THIS LOGS IN INSTEAD OF REUSING YOUR CHROME SESSION
#   Chrome on Android keeps cookies in a sandboxed, Keystore-encrypted database
#   that no other app — Termux included, short of root — can read. So this
#   script signs in with the same account your Chrome uses and captures the
#   session cookie itself. If you would rather paste a cookie, copy it from a
#   *desktop* Chrome (chrome://settings/cookies → www.broadcastify.com →
#   bcfyuser1 → copy the value) and run:
#     ./broadcastify-premium-termux.sh --cookie 'bcfyuser1=PASTE_VALUE_HERE'
#
# USAGE
#   ./broadcastify-premium-termux.sh                    auth + verify Premium + print the wiring
#   ./broadcastify-premium-termux.sh download           also download the incident's archive block
#   ./broadcastify-premium-termux.sh download <id>      download any archive block by id
#   ./broadcastify-premium-termux.sh <id>               same as: download <id>
#   ./broadcastify-premium-termux.sh --cookie 'bcfyuser1=...'   skip login, use a pasted cookie
#
#   Credentials are read from, in order: BCFY_USERNAME/BCFY_PASSWORD env vars,
#   then ~/.broadcastify-creds (mode 600), then an interactive prompt.
#
# WHAT IT SPITS OUT (the "wiring")
#   - the bcfyuser1 session cookie value (a bearer credential — treat like a password)
#   - ~/.broadcastify-cookie   curl-ready cookie file (mode 600): curl -b ~/.broadcastify-cookie ...
#   - ~/.broadcastify-creds    your login (mode 600, only if you chose to save it)
#   - the exact download command for the incident's archive block
#   - a loop that downloads every archive block referenced by the linkage artifact
#
# SAFETY
#   - Your password is never printed, never written into this script, and only
#     saved to ~/.broadcastify-creds (mode 600) if you explicitly choose to.
#   - The session cookie is a bearer credential: anyone holding it can use your
#     account until it expires. Keep both files private; re-run this script to
#     refresh an expired session.
#   - Accounts with two-factor authentication cannot sign in this way — use
#     --cookie with a cookie copied from a signed-in desktop browser.
#
# Requires: bash + curl + awk (Termux: pkg install -y curl gawk). No root needed.

set -u
set -o pipefail

BASE="https://www.broadcastify.com"
LOGIN_URL="$BASE/login/"
UA="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"

CREDS_FILE="$HOME/.broadcastify-creds"
COOKIE_FILE="$HOME/.broadcastify-cookie"
OUT_DIR="${BCFY_OUT_DIR:-$HOME/broadcastify-archives}"

# The incident this wiring is for (see src/data/scanner-archive-links.json).
INCIDENT_ARCHIVE_ID="47003-1784499221"
INCIDENT_LABEL="welfare-check_2026-00023988_prosser-s-greeley_2026-07-19_1640MDT"

bold()   { printf '\033[1m'; }
yellow() { printf '\033[1;33m'; }
red()    { printf '\033[1;31m'; }
reset()  { printf '\033[0m'; }
log()  { printf '\n%b==>%b %s\n' "$(bold)" "$(reset)" "$*"; }
warn() { printf '\n%b!!%b %s\n' "$(yellow)" "$(reset)" "$*" >&2; }
die()  { printf '\n%bxx%b %s\n' "$(red)" "$(reset)" "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl not found — in Termux run: pkg install -y curl"
command -v awk  >/dev/null 2>&1 || die "awk not found — in Termux run: pkg install -y gawk"

COOKIE_VALUE=""

usage() {
  cat <<'USAGE'
Usage: broadcastify-premium-termux.sh [download] [archiveId] [--cookie 'bcfyuser1=VALUE']

  (no args)     Authenticate, verify Premium, print the session cookie and wiring.
  download      Also download the welfare-check archive block (47003-1784499221).
  download <id> Download any Broadcastify archive block by id (e.g. 47003-1784499221).
  <id>          Same as "download <id>".
  --cookie ...  Skip login; use a bcfyuser1 cookie pasted from a signed-in desktop Chrome.

Credentials come from BCFY_USERNAME/BCFY_PASSWORD, then ~/.broadcastify-creds,
then an interactive prompt (password hidden). First run asks once; choose to save
so later runs are one-tap.
USAGE
}

ensure_creds() {
  if [ -n "${BCFY_USERNAME:-}" ] && [ -n "${BCFY_PASSWORD:-}" ]; then
    log "Using credentials from BCFY_USERNAME / BCFY_PASSWORD environment variables."
    return 0
  fi
  if [ -f "$CREDS_FILE" ]; then
    BCFY_USERNAME="$(sed -n 's/^BCFY_USERNAME=//p' "$CREDS_FILE" | head -n1)"
    BCFY_PASSWORD="$(sed -n 's/^BCFY_PASSWORD=//p' "$CREDS_FILE" | head -n1)"
    if [ -n "$BCFY_USERNAME" ] && [ -n "$BCFY_PASSWORD" ]; then
      log "Using saved credentials from $CREDS_FILE (mode 600)."
      return 0
    fi
    warn "$CREDS_FILE is missing BCFY_USERNAME/BCFY_PASSWORD — prompting instead."
  fi
  log "First run: enter your Broadcastify (RadioReference) login."
  printf 'Username or email: '
  read -r BCFY_USERNAME
  printf 'Password (hidden): '
  read -rs BCFY_PASSWORD
  printf '\n'
  [ -n "${BCFY_USERNAME:-}" ] && [ -n "${BCFY_PASSWORD:-}" ] || die "username and password are required."
  printf 'Save these credentials to %s (mode 600) so future runs need no typing? [y/N] ' "$CREDS_FILE"
  read -r _ans
  case "$_ans" in
    y|Y)
      ( umask 077; printf 'BCFY_USERNAME=%s\nBCFY_PASSWORD=%s\n' "$BCFY_USERNAME" "$BCFY_PASSWORD" > "$CREDS_FILE" )
      log "Saved credentials to $CREDS_FILE (mode 600). Delete it any time."
      ;;
    *)
      warn "Not saved — you will be prompted on every run."
      ;;
  esac
}

login() {
  log "Signing in to $LOGIN_URL ..."
  local jar http exp human
  jar="$(mktemp)" || die "mktemp failed"
  http="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 \
    -X POST "$LOGIN_URL" \
    -H "Origin: $BASE" \
    -H "Referer: $LOGIN_URL" \
    -H "User-Agent: $UA" \
    --data-urlencode "username=$BCFY_USERNAME" \
    --data-urlencode "password=$BCFY_PASSWORD" \
    --data-urlencode "action=auth" \
    --data-urlencode "redirect=$BASE" \
    -c "$jar" 2>/dev/null || true)"
  if ! grep -q $'\tbcfyuser1\t' "$jar" 2>/dev/null; then
    rm -f "$jar"
    die "Sign-in did not yield a session cookie (HTTP ${http:-none}). Wrong password — or the account uses two-factor authentication; in that case copy the bcfyuser1 cookie from a signed-in desktop Chrome and re-run with: --cookie 'bcfyuser1=...'"
  fi
  COOKIE_VALUE="$(awk -F'\t' '$6 == "bcfyuser1" { print $7 }' "$jar" | head -n1)"
  [ -n "$COOKIE_VALUE" ] || { rm -f "$jar"; die "could not read the session cookie value from the sign-in response."; }
  exp="$(awk -F'\t' '$6 == "bcfyuser1" { print $5 }' "$jar" | head -n1)"
  human="$(date -u -d "@$exp" 2>/dev/null || true)"
  ( umask 077; cp "$jar" "$COOKIE_FILE" )
  rm -f "$jar"
  log "Session established. Cookie saved to $COOKIE_FILE (mode 600)."
  if [ -n "$human" ]; then
    log "Session cookie expiry: $human UTC — re-run this script after that to refresh."
  fi
}

use_pasted_cookie() {
  local raw="$1"
  raw="${raw#bcfyuser1=}"
  [ -n "$raw" ] || die "--cookie needs the value, e.g. --cookie 'bcfyuser1=PASTE_HERE'"
  COOKIE_VALUE="$raw"
  ( umask 077; printf '.broadcastify.com\tTRUE\t/\tTRUE\t0\tbcfyuser1\t%s\n' "$COOKIE_VALUE" > "$COOKIE_FILE" )
  log "Using the pasted session cookie (saved to $COOKIE_FILE, mode 600)."
}

verify_premium() {
  log "Verifying Premium archive access (range-fetching the first 1 KB of $INCIDENT_ARCHIVE_ID) ..."
  local probe code ctype
  probe="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 90 \
    -r 0-1023 -L -b "$COOKIE_FILE" -H "User-Agent: $UA" \
    "$BASE/archives/download/$INCIDENT_ARCHIVE_ID" 2>/dev/null || true)"
  code="${probe%% *}"
  ctype="${probe#* }"
  log "Probe response: HTTP ${code:-none} ${ctype:-<no content-type>}"
  case "$code:$ctype" in
    200:audio/*|206:audio/*|200:application/octet-stream|206:application/octet-stream) return 0 ;;
    *) return 1 ;;
  esac
}

download_archive() {
  local id="$1" out="$2" size
  mkdir -p "$OUT_DIR"
  log "Downloading $id -> $out"
  curl -sL --max-time 900 -b "$COOKIE_FILE" -H "User-Agent: $UA" \
    -o "$out" "$BASE/archives/download/$id" || { warn "curl failed for $id"; return 1; }
  size="$(wc -c < "$out" 2>/dev/null || echo 0)"
  if [ "$size" -lt 100000 ]; then
    warn "Only $size bytes came back — that is probably an error page, not audio. First bytes:"
    head -c 200 "$out" 2>/dev/null | tr -d '\0' | head -n2 >&2
    return 1
  fi
  log "Downloaded $size bytes ($(du -h "$out" 2>/dev/null | cut -f1))."
  return 0
}

print_wiring() {
  log "Premium is wired. Here is everything you need:"
  cat <<EOF

  Session cookie (bearer credential — treat like a password; it expires):
    bcfyuser1=$COOKIE_VALUE

  curl-ready cookie file (mode 600):
    $COOKIE_FILE
    use it as:  curl -b "$COOKIE_FILE" ...

  Your login (mode 600, only if you chose to save it):
    $CREDS_FILE

  The incident's archive block — welfare check #2026-00023988,
  Laramie County SO, Sun 2026-07-19 4:40:08 PM MDT, Prosser Rd & S Greeley Hwy:
    block:    $INCIDENT_ARCHIVE_ID   (2026-07-19 4:13-4:43 PM MDT; the call is 26m27s in)
    listen:   $BASE/archives/feed/?feedId=47003&archive=$INCIDENT_ARCHIVE_ID
    download: curl -sL -b "$COOKIE_FILE" -o "$OUT_DIR/$INCIDENT_LABEL.mp3" \\
              "$BASE/archives/download/$INCIDENT_ARCHIVE_ID"

  Download every archive block referenced by the linkage artifact
  (src/data/scanner-archive-links.json) — each linked log carries its block id:
    grep -o '47003-[0-9]*' src/data/scanner-archive-links.json | sort -u \\
      | while read -r id; do
          curl -sL -b "$COOKIE_FILE" -o "archives/\$id.mp3" \\
            "$BASE/archives/download/\$id"
        done

EOF
}

main() {
  local mode="auth" target_id="$INCIDENT_ARCHIVE_ID" pasted_cookie=""

  while [ $# -gt 0 ]; do
    case "$1" in
      download) mode="download"; shift ;;
      --cookie) [ $# -ge 2 ] || die "--cookie needs a value"; pasted_cookie="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) target_id="$1"; mode="download"; shift ;;
    esac
  done

  if [ -n "$pasted_cookie" ]; then
    use_pasted_cookie "$pasted_cookie"
  else
    ensure_creds
    login
  fi

  verify_premium || die "Signed in, but Premium archive access was refused for $INCIDENT_ARCHIVE_ID (HTTP probe did not return audio). Is the Premium subscription active on this account? Without Premium the download endpoint answers 'Authentication Required'."

  print_wiring

  if [ "$mode" = "download" ]; then
    download_archive "$target_id" "$OUT_DIR/$target_id.mp3" || die "download failed for $target_id"
    if [ "$target_id" = "$INCIDENT_ARCHIVE_ID" ]; then
      log "That is the welfare-check block: the dispatch audio for #2026-00023988 starts ~26m27s in (4:40:08 PM MDT); the block runs 4:13:41-4:43:41 PM MDT."
    fi
  fi

  log "Done."
}

main "$@"
