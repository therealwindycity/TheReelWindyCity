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
#   3. Downloads the ENTIRE LINKED ARCHIVE — every archive block the Socrata <->
#      scanner linkage database points to (each block that carries at least one
#      linked CAD log), not just one incident. The block list comes from the
#      linkage database, in this order:
#        a. --links <url-or-file>     (explicit)
#        b. src/data/scanner-archive-links.json in the current directory
#           (i.e. run it inside a clone of this repo)
#        c. the committed database on GitHub (default; currently the verified
#           Jul 18-20, 2026 window: 34 blocks, roughly 0.25-1 GB)
#      Already-downloaded, valid blocks are skipped, so re-running resumes
#      where it left off. A manifest (block id, sha256, size) is appended to
#      ~/broadcastify-archives/manifest.tsv.
#   4. If the GitHub CLI is installed and logged in (pkg install -y gh &&
#      gh auth login), optionally stores your login as encrypted GitHub Actions
#      secrets, so the "Fetch Broadcastify Archive Audio (Premium)" workflow can
#      fetch audio from the site pipeline on demand.
#   5. Prints your session cookie and copy-paste reuse commands.
#
# USAGE
#   bash ~/bcfy-onestep.sh                        the entire linked archive
#   bash ~/bcfy-onestep.sh 47003-1784499221      just one block
#   bash ~/bcfy-onestep.sh --links <url-or-file>  a custom linkage database
#   bash ~/bcfy-onestep.sh --yes                  skip the size confirmation
#
#   The welfare-check block (welfare check #2026-00023988, Laramie County SO,
#   Sun 2026-07-19 4:40:08 PM MDT, Prosser Rd & S Greeley Hwy) is
#   47003-1784499221; the call is 26m27s into the 4:13-4:43 PM MDT block.
#   Once PR #19 merges, the live site also serves a rolling ~6-month linkage
#   database (many more blocks) at
#   https://therealwindycity.github.io/TheReelWindyCity/data/scanner-archive-links.json
#   — pass that to --links for the full rolling window. The script prints the
#   real block count and estimated size, and asks before downloading anything
#   large (>50 blocks, >2 GB, or more than the free space).
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
MANIFEST="$OUT_DIR/manifest.tsv"
INCIDENT_ARCHIVE_ID="47003-1784499221"
# The committed linkage database: main once PR #19 merges, the arena branch until then.
LINKS_URLS=(
  "https://raw.githubusercontent.com/therealwindycity/TheReelWindyCity/main/src/data/scanner-archive-links.json"
  "https://raw.githubusercontent.com/therealwindycity/TheReelWindyCity/arena/605a7a98-thereelwindycity/src/data/scanner-archive-links.json"
)

bold()   { printf '\033[1m'; }
yellow() { printf '\033[1;33m'; }
red()    { printf '\033[1;31m'; }
reset()  { printf '\033[0m'; }
log()  { printf '\n%b==>%b %s\n' "$(bold)" "$(reset)" "$*"; }
warn() { printf '\n%b!!%b %s\n' "$(yellow)" "$(reset)" "$*" >&2; }
die()  { printf '\n%bxx%b %s\n' "$(red)" "$(reset)" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: bcfy-onestep.sh [block-id] [--links <url-or-file>] [--yes]

  (no args)   Download the ENTIRE linked archive: every archive block the
              linkage database points to (resumes; skips valid files).
  block-id    Download just that block, e.g. 47003-1784499221
  --links X   Use linkage database X (a URL or a local file) for the block list.
  --yes       Skip the size confirmation for large downloads.
  -h | --help Show this help.
USAGE
}

# A downloaded block is valid audio if it is at least 100000 bytes and does not
# start with '<' (an HTML error page).
is_valid_audio() {
  local f="$1" size first
  [ -f "$f" ] || return 1
  size="$(wc -c < "$f" 2>/dev/null || echo 0)"
  [ "$size" -ge 100000 ] || return 1
  first="$(head -c 1 "$f" 2>/dev/null || true)"
  [ "$first" != "<" ]
}

# download_block <id> <out-file> — returns 0 only if the download is valid audio.
download_block() {
  local id="$1" out="$2"
  curl -sSL --max-time 900 -b "$COOKIE_FILE" -H "User-Agent: $UA" \
    -o "$out" "$BASE/archives/download/$id" || return 1
  is_valid_audio "$out"
}

TARGET_ID=""
LINKS_SRC=""
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --links) [ $# -ge 2 ] || die "--links needs a URL or file path"; LINKS_SRC="$2"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [ -z "$TARGET_ID" ] && [[ "$1" =~ ^[0-9]+-[0-9]+$ ]]; then
        TARGET_ID="$1"; shift
      else
        die "unknown argument: $1 (try --help)"
      fi
      ;;
  esac
done

command -v curl >/dev/null 2>&1 || { log "curl missing — installing (pkg install -y curl)"; pkg install -y curl || die "could not install curl"; }
command -v awk  >/dev/null 2>&1 || { log "awk missing — installing (pkg install -y gawk)"; pkg install -y gawk  || die "could not install gawk"; }

log "Broadcastify Premium one-step"
if [ -n "$TARGET_ID" ]; then
  echo "  mode: download ONE block ($TARGET_ID)"
else
  echo "  mode: download the ENTIRE linked archive (every block in the linkage database)"
fi
echo "  1. sign in (password hidden, never saved)"
echo "  2. verify Premium archive access"
echo "  3. download the archive blocks -> $OUT_DIR/ (resumes; skips valid files)"
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

log "Verifying Premium archive access (1 KB probe of $INCIDENT_ARCHIVE_ID) ..."
probe="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 90 \
  -r 0-1023 -L -b "$COOKIE_FILE" -H "User-Agent: $UA" \
  "$BASE/archives/download/$INCIDENT_ARCHIVE_ID" 2>/dev/null || true)"
code="${probe%% *}"; ctype="${probe#* }"
case "$code:$ctype" in
  200:audio/*|206:audio/*|200:application/octet-stream|206:application/octet-stream)
    log "Premium archive access confirmed (HTTP $code $ctype)." ;;
  *)
    die "Premium archive access refused (probe: ${code:-none} ${ctype:-<none>}). Is the Premium subscription active on this account? Without Premium the download endpoint answers 'Authentication Required'." ;;
esac

mkdir -p "$OUT_DIR"
BULK_FAILED=0
SUMMARY_AUDIO=""

if [ -n "$TARGET_ID" ]; then
  # ---- single-block mode -----------------------------------------------------
  OUT="$OUT_DIR/$TARGET_ID.mp3"
  if is_valid_audio "$OUT"; then
    log "Already downloaded and valid: $OUT — skipping."
  else
    log "Downloading $TARGET_ID (~30 min of audio) -> $OUT"
    download_block "$TARGET_ID" "$OUT" || die "download failed for $TARGET_ID — network dropped? Re-run the same command to retry."
  fi
  size="$(wc -c < "$OUT" 2>/dev/null || echo 0)"
  sum="$(sha256sum "$OUT" 2>/dev/null | cut -d' ' -f1 || echo unknown)"
  log "Block file: $OUT ($size bytes, sha256 $sum)"
  printf '%s\t%s\t%s\n' "$TARGET_ID" "$sum" "$size" >> "$MANIFEST"
  SUMMARY_AUDIO="$OUT ($size bytes, sha256 $sum)"
  if [ "$TARGET_ID" = "$INCIDENT_ARCHIVE_ID" ]; then
    log "The welfare-check dispatch (#2026-00023988, 4:40:08 PM MDT) starts 26m27s (1587s) into this block."
    echo "  Play it from the call: open the file in a player and seek to 26:27,"
    echo "  or cut it with ffmpeg:  ffmpeg -ss 1587 -i \"$OUT\" -c copy welfare-check-call.mp3"
  fi
  if [ -d "$HOME/storage/downloads" ]; then
    cp "$OUT" "$HOME/storage/downloads/$TARGET_ID.mp3" \
      && log "Also copied to $HOME/storage/downloads/$TARGET_ID.mp3 (shows up in your Files app)."
  fi
else
  # ---- entire linked archive -------------------------------------------------
  LINKS_FILE=""
  if [ -n "$LINKS_SRC" ]; then
    if [ -f "$LINKS_SRC" ]; then
      LINKS_FILE="$LINKS_SRC"
      log "Linkage database: $LINKS_SRC (local file)"
    else
      LINKS_FILE="$OUT_DIR/scanner-archive-links.json"
      log "Fetching linkage database: $LINKS_SRC"
      curl -sSL --max-time 60 -o "$LINKS_FILE" "$LINKS_SRC" \
        || die "could not fetch the linkage database from $LINKS_SRC — check the phone's internet connection."
    fi
  elif [ -f "src/data/scanner-archive-links.json" ]; then
    LINKS_FILE="src/data/scanner-archive-links.json"
    log "Linkage database: $LINKS_FILE (local repo copy)"
  else
    LINKS_FILE="$OUT_DIR/scanner-archive-links.json"
    log "Fetching the committed linkage database from GitHub ..."
    fetched=0
    for u in "${LINKS_URLS[@]}"; do
      if curl -sSL --max-time 60 -o "$LINKS_FILE" "$u" && head -c 1 "$LINKS_FILE" 2>/dev/null | grep -q '{'; then
        fetched=1
        log "Linkage database: $u"
        break
      fi
    done
    [ "$fetched" = "1" ] || die "could not fetch the linkage database from GitHub — check the phone's internet connection and try again."
  fi
  [ -s "$LINKS_FILE" ] || die "linkage database is empty: $LINKS_FILE"
  head -c 1 "$LINKS_FILE" | grep -q '{' || die "linkage database does not look like JSON: $LINKS_FILE"
  grep -q '"links"' "$LINKS_FILE" || die "no \"links\" array in $LINKS_FILE"

  pairs="$(mktemp)" || die "mktemp failed"
  # The artifact is pretty-printed JSON: flatten it, then pull each linked
  # archive object's block id and duration ("archive": null entries are skipped).
  tr -d '\n\r' < "$LINKS_FILE" \
    | grep -o '"archive"[[:space:]]*:[[:space:]]*{[^}]*}' \
    | while read -r obj; do
        id="$(printf '%s' "$obj" | sed -n 's/.*"id":[[:space:]]*"\([0-9][0-9]*-[0-9][0-9]*\)".*/\1/p')"
        dur="$(printf '%s' "$obj" | sed -n 's/.*"duration":[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
        [ -n "$id" ] && printf '%s %s\n' "$id" "${dur:-1800}"
      done | sort -u > "$pairs"
  n="$(wc -l < "$pairs")"
  [ "$n" -gt 0 ] || die "no linked archive blocks found in $LINKS_FILE"

  total_dur="$(awk '{s+=$2} END{print s+0}' "$pairs")"
  est_lo_mb=$(( total_dur * 4000 / 1048576 ))    # 32 kbps MP3
  est_hi_mb=$(( total_dur * 16000 / 1048576 ))   # 128 kbps MP3
  free_kb="$(df -k "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')"
  free_mb=$(( ${free_kb:-0} / 1024 ))
  log "Plan: download $n archive blocks (the entire linked archive), ~${est_lo_mb}-${est_hi_mb} MB total."
  if [ -n "${free_kb:-}" ] && [ "$free_kb" -gt 0 ] 2>/dev/null; then
    log "Free space in \$HOME: ~$free_mb MB."
  fi

  need_confirm=0
  [ "$n" -gt 50 ] && need_confirm=1
  [ "$est_hi_mb" -gt 2048 ] && need_confirm=1
  if [ -n "${free_kb:-}" ] && [ "$free_kb" -gt 0 ] 2>/dev/null && [ "$free_mb" -lt $(( est_hi_mb + 256 )) ]; then
    need_confirm=1
  fi
  if [ "$need_confirm" = "1" ] && [ "$ASSUME_YES" != "1" ]; then
    warn "This is a large download ($n blocks, up to ~$est_hi_mb MB)."
    printf 'Proceed with all %s blocks? [y/N] ' "$n"
    read -r ans
    case "$ans" in
      y|Y) ;;
      *) log "Aborted — nothing downloaded."; exit 0 ;;
    esac
  fi

  ok=0; skipped=0; failed=0; failed_ids=""; downloaded_bytes=0
  i=0
  while read -r id _dur; do
    i=$((i+1))
    out="$OUT_DIR/$id.mp3"
    if is_valid_audio "$out"; then
      skipped=$((skipped+1))
      printf '[%d/%d] %s — already downloaded, skipping\n' "$i" "$n" "$id"
      continue
    fi
    printf '[%d/%d] downloading %s ... ' "$i" "$n" "$id"
    if download_block "$id" "$out"; then
      size="$(wc -c < "$out" 2>/dev/null || echo 0)"
      sum="$(sha256sum "$out" 2>/dev/null | cut -d' ' -f1 || echo unknown)"
      printf '%s\t%s\t%s\n' "$id" "$sum" "$size" >> "$MANIFEST"
      ok=$((ok+1)); downloaded_bytes=$((downloaded_bytes + size))
      printf 'ok (%s bytes)\n' "$size"
    else
      failed=$((failed+1)); failed_ids="$failed_ids $id"
      printf 'FAILED\n'
      warn "block $id did not come back as audio — skipping it and continuing."
    fi
  done < "$pairs"
  rm -f "$pairs"

  log "Linked-archive download complete: $ok downloaded (~$((downloaded_bytes / 1048576)) MB this run), $skipped already present, $failed failed (of $n)."
  log "Files: $OUT_DIR/<block-id>.mp3   |   manifest: $MANIFEST"
  SUMMARY_AUDIO="$OUT_DIR/ — $n linked blocks ($ok downloaded, $skipped already present, $failed failed); manifest: $MANIFEST"
  if [ "$failed" -gt 0 ]; then
    BULK_FAILED=1
    warn "failed blocks:$failed_ids"
    log "Re-run this script to retry the failed blocks (valid files are skipped)."
  fi
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
        echo "    archive_id: $INCIDENT_ARCHIVE_ID   (or any block id from the manifest)"
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

  Audio      : $SUMMARY_AUDIO
  Session    : bcfyuser1=$COOKIE_VALUE
               (bearer credential — treat like a password; saved at $COOKIE_FILE, mode 600)
  Reuse      : curl -sL -b "$COOKIE_FILE" -o block.mp3 "$BASE/archives/download/<block-id>"
  Incident   : welfare check #2026-00023988 -> block $INCIDENT_ARCHIVE_ID
               listen page: $BASE/archives/feed/?feedId=47003&archive=$INCIDENT_ARCHIVE_ID
EOF
exit "$BULK_FAILED"
