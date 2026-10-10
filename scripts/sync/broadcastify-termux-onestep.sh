#!/usr/bin/env bash
#
# broadcastify-termux-onestep.sh — Termux ONE-PASTE, one-and-done Premium fetch.
#
# THE ONE-PASTE BLOCK (copy ALL of it, paste into Termux, hit Enter):
#
#   cat > ~/bcfy-onestep.sh <<'ONESTEP'
#   <this entire file, from the shebang to the last line>
#   ONESTEP
#   bash ~/bcfy-onestep.sh
#
# WHAT "ALL OF IT" DOES
#   1. Signs in to Broadcastify with your account (password typed hidden; it is
#      held in memory only — never printed, never written to disk, never on a
#      command line).
#   2. Verifies the account has Premium archive access (1 KB range probe).
#   3. Downloads the archive block to ~/broadcastify-archives/. Default is the
#      welfare-check block 47003-1784499221 (welfare check #2026-00023988, Laramie
#      County SO, Sun 2026-07-19 4:40:08 PM MDT, Prosser Rd & S Greeley Hwy;
#      block runs 4:13-4:43 PM MDT, the call is 26m27s in). Pass any other block
#      id as an argument:  bash ~/bcfy-onestep.sh 47003-1784409721
#   4. If the GitHub CLI is installed and logged in (pkg install -y gh &&
#      gh auth login), optionally stores your login as encrypted GitHub Actions
#      secrets, so the "Fetch Broadcastify Archive Audio (Premium)" workflow can
#      fetch audio from the site pipeline on demand.
#   5. Prints your session cookie and copy-paste reuse commands.
#
# SAFETY
#   - The password is never persisted anywhere by this script.
#   - The session cookie (bcfyuser1) is a bearer credential: anyone holding it
#     can use your account until it expires. It is saved to
#     ~/.broadcastify-cookie with mode 600 — keep it private.
#   - Nothing here touches the repository or the website. GitHub Actions
#     secrets are encrypted and readable only by the audio-fetch workflow.
#   - Accounts with two-factor authentication cannot sign in this way — use
#     scripts/sync/broadcastify-premium-termux.sh --cookie 'bcfyuser1=...' with
#     a cookie copied from a signed-in DESKTOP Chrome (Android Chrome cookies
#     are unreadable without root).
#
# Requires: bash + curl + awk (auto-installed via pkg if missing). No root.

set -uo pipefail

BASE="https://www.broadcastify.com"
UA="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
GH_REPO="${GH_REPO:-therealwindycity/TheReelWindyCity}"

COOKIE_FILE="$HOME/.broadcastify-cookie"
OUT_DIR="$HOME/broadcastify-archives"
INCIDENT_ARCHIVE_ID="47003-1784499221"

bold()   { printf '\033[1m'; }
yellow() { printf '\033[1;33m'; }
red()    { printf '\033[1;31m'; }
reset()  { printf '\033[0m'; }
log()  { printf '\n%b==>%b %s\n' "$(bold)" "$(reset)" "$*"; }
warn() { printf '\n%b!!%b %s\n' "$(yellow)" "$(reset)" "$*" >&2; }
die()  { printf '\n%bxx%b %s\n' "$(red)" "$(reset)" "$*" >&2; exit 1; }

TARGET_ID="${1:-$INCIDENT_ARCHIVE_ID}"
[[ "$TARGET_ID" =~ ^[0-9]+-[0-9]+$ ]] || die "archive id must look like <feedId>-<unixStart> (e.g. $INCIDENT_ARCHIVE_ID); got: $TARGET_ID"

command -v curl >/dev/null 2>&1 || { log "curl missing — installing (pkg install -y curl)"; pkg install -y curl || die "could not install curl"; }
command -v awk  >/dev/null 2>&1 || { log "awk missing — installing (pkg install -y gawk)"; pkg install -y gawk  || die "could not install gawk"; }

log "Broadcastify Premium one-step"
echo "  1. sign in (password hidden, never saved)"
echo "  2. verify Premium archive access"
echo "  3. download block $TARGET_ID -> $OUT_DIR/"
if [ "$TARGET_ID" = "$INCIDENT_ARCHIVE_ID" ]; then
  echo "     welfare check #2026-00023988 — LCSO, Sun 2026-07-19 4:40:08 PM MDT,"
  echo "     Prosser Rd & S Greeley Hwy. Block: 4:13-4:43 PM MDT; call 26m27s in."
fi
echo "  4. optionally store your login as encrypted GitHub Actions secrets"
echo

printf 'Broadcastify username (email): '
read -r BCFY_USERNAME
printf 'Broadcastify password (hidden, not saved): '
read -rs BCFY_PASSWORD
printf '\n'
[ -n "${BCFY_USERNAME:-}" ] && [ -n "${BCFY_PASSWORD:-}" ] || die "username and password are required."

log "Signing in to broadcastify.com ..."
jar="$(mktemp)" || die "mktemp failed"
if ! curl -sS -o /dev/null --max-time 60 \
    -X POST "$BASE/login/" \
    -H "Origin: $BASE" \
    -H "Referer: $BASE/login/" \
    -H "User-Agent: $UA" \
    --data-urlencode "username=$BCFY_USERNAME" \
    --data-urlencode "password=$BCFY_PASSWORD" \
    --data-urlencode "action=auth" \
    --data-urlencode "redirect=$BASE" \
    -c "$jar"; then
  rm -f "$jar"
  die "could not reach broadcastify.com — check the phone's internet connection and try again."
fi
if ! grep -q $'\tbcfyuser1\t' "$jar" 2>/dev/null; then
  rm -f "$jar"
  die "sign-in did not yield a session cookie — wrong password, or the account uses two-factor authentication. For 2FA, copy the bcfyuser1 cookie from a signed-in DESKTOP Chrome and use scripts/sync/broadcastify-premium-termux.sh --cookie 'bcfyuser1=...' instead."
fi
COOKIE_VALUE="$(awk -F'\t' '$6 == "bcfyuser1" { print $7 }' "$jar" | head -n1)"
[ -n "$COOKIE_VALUE" ] || { rm -f "$jar"; die "could not read the session cookie value from the sign-in response."; }
( umask 077; cp "$jar" "$COOKIE_FILE" )
rm -f "$jar"
log "Signed in. Session cookie saved to $COOKIE_FILE (mode 600)."

log "Verifying Premium archive access (1 KB probe of $TARGET_ID) ..."
probe="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 90 \
  -r 0-1023 -L -b "$COOKIE_FILE" -H "User-Agent: $UA" \
  "$BASE/archives/download/$TARGET_ID" 2>/dev/null || true)"
code="${probe%% *}"; ctype="${probe#* }"
case "$code:$ctype" in
  200:audio/*|206:audio/*|200:application/octet-stream|206:application/octet-stream)
    log "Premium archive access confirmed (HTTP $code $ctype)." ;;
  *)
    die "Premium archive access refused (probe: ${code:-none} ${ctype:-<none>}). Is the Premium subscription active on this account? Without Premium the download endpoint answers 'Authentication Required'." ;;
esac

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/$TARGET_ID.mp3"
log "Downloading $TARGET_ID (~30 min of audio, roughly 25-35 MB) -> $OUT"
curl -sSL --max-time 900 -b "$COOKIE_FILE" -H "User-Agent: $UA" \
  -o "$OUT" "$BASE/archives/download/$TARGET_ID" || die "download failed — network dropped? Re-run the same command to retry."
size="$(wc -c < "$OUT" 2>/dev/null || echo 0)"
first="$(head -c 1 "$OUT" 2>/dev/null || true)"
if [ "$size" -lt 100000 ] || [ "$first" = "<" ]; then
  die "the download is $size bytes and does not look like audio (first byte '$first') — that is an error page, not the block. Refusing to keep it. Check Premium access and re-run."
fi
sum="$(sha256sum "$OUT" 2>/dev/null | cut -d' ' -f1 || echo unknown)"
log "Downloaded: $OUT"
log "  size   : $size bytes"
log "  sha256 : $sum"

if [ "$TARGET_ID" = "$INCIDENT_ARCHIVE_ID" ]; then
  log "The welfare-check dispatch (#2026-00023988, 4:40:08 PM MDT) starts 26m27s (1587s) into this block."
  echo "  Play it from the call: open the file in a player and seek to 26:27,"
  echo "  or cut it with ffmpeg:  ffmpeg -ss 1587 -i \"$OUT\" -c copy welfare-check-call.mp3"
fi

if [ -d "$HOME/storage/downloads" ]; then
  cp "$OUT" "$HOME/storage/downloads/$TARGET_ID.mp3" \
    && log "Also copied to $HOME/storage/downloads/$TARGET_ID.mp3 (shows up in your Files app)."
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  printf '\nThe GitHub CLI is ready. Also store your Broadcastify login as encrypted GitHub\nActions secrets on %s, so the website automation can fetch archive audio on\ndemand? [y/N] ' "$GH_REPO"
  read -r gh_ans
  case "$gh_ans" in
    y|Y)
      if printf '%s' "$BCFY_USERNAME" | gh secret set BCFY_USERNAME --repo "$GH_REPO" \
         && printf '%s' "$BCFY_PASSWORD" | gh secret set BCFY_PASSWORD --repo "$GH_REPO"; then
        log "Stored BCFY_USERNAME + BCFY_PASSWORD as encrypted Actions secrets (never in the repo or on the site)."
        gh secret list --repo "$GH_REPO" 2>/dev/null || true
        echo "  Fetch any block from the site pipeline:"
        echo "    Actions -> 'Fetch Broadcastify Archive Audio (Premium)' -> Run workflow"
        echo "    archive_id: $TARGET_ID"
      else
        warn "gh secret set failed — store them by hand instead: Settings -> Secrets and variables -> Actions -> New repository secret (BCFY_USERNAME, BCFY_PASSWORD)."
      fi
      ;;
    *)
      echo "Skipped — the audio is already on your phone; the site automation stays manual for now."
      ;;
  esac
else
  echo
  echo "Optional — to let the website automation fetch archive audio on demand, store your"
  echo "Broadcastify login as encrypted GitHub Actions secrets (Settings -> Secrets and"
  echo "variables -> Actions -> New repository secret: BCFY_USERNAME, BCFY_PASSWORD), or run"
  echo "scripts/sync/broadcastify-secrets-setup.sh on a computer, or in Termux:"
  echo "  pkg install -y gh && gh auth login   then re-run this script."
fi

unset BCFY_PASSWORD

log "DONE."
cat <<EOF

  Audio file : $OUT
               $size bytes, sha256 $sum
  Session    : bcfyuser1=$COOKIE_VALUE
               (bearer credential — treat like a password; saved at $COOKIE_FILE, mode 600)
  Reuse      : curl -sL -b "$COOKIE_FILE" -o block.mp3 "$BASE/archives/download/<block-id>"
  Incident   : welfare check #2026-00023988 -> block $INCIDENT_ARCHIVE_ID
               listen page: $BASE/archives/feed/?feedId=47003&archive=$INCIDENT_ARCHIVE_ID
EOF
