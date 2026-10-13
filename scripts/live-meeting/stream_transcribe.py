#!/usr/bin/env python3
"""Transcribe a live stream (City of Cheyenne YouTube live, or any HLS/http audio URL)
and commit + push each 30-second window to the branch this runs on.

Designed to run inside GitHub Actions (.github/workflows/live_meeting_transcribe.yml),
but it also runs on a laptop with ffmpeg, yt-dlp and faster-whisper installed.

Flow
  yt-dlp -g  -> direct audio media URL (re-resolved on every ffmpeg restart)
  ffmpeg     -> 30-second WAV segments in a temp dir (outside the repo)
  worker     -> faster-whisper -> live-transcripts/<date>-<meeting>/ -> commit -> push

Stops when --minutes elapses, or when the stream has ended (ffmpeg fails repeatedly
without producing audio).

Examples
  python3 stream_transcribe.py --url https://www.youtube.com/@TheCityofCheyenne/live --minutes 180
  python3 stream_transcribe.py --media-url ./sample.wav --stub --no-push --minutes 1   # offline test
"""
import argparse
import datetime as dt
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace

import live_capture as lc

MAX_MINUTES = 300  # keep under the 330-minute Actions job limit
MAX_QUICK_FAILURES = 5


def resolve_media_url(page_url):
    """Ask yt-dlp for a direct audio URL. Prefers HLS, which ffmpeg reads well for live streams."""
    cmd = [
        "yt-dlp", "-g", "--no-playlist",
        "-f", "ba[protocol^=m3u8]/ba/best[protocol^=m3u8]/best",
        page_url,
    ]
    r = subprocess.run(cmd, text=True, capture_output=True, timeout=180)
    urls = [line.strip() for line in r.stdout.splitlines() if line.strip()]
    if r.returncode != 0 or not urls:
        raise RuntimeError((r.stderr or "yt-dlp returned no URL").strip()[-400:])
    return urls[0]


def next_segment_index(audio_dir):
    indices = [
        int(lc.SEG_RE.search(p.name).group(1))
        for p in audio_dir.glob("seg_*.wav")
        if lc.SEG_RE.search(p.name)
    ]
    return max(indices, default=-1) + 1


def start_media_recorder(media_url, audio_dir, start_index):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
    if media_url.startswith("http"):
        # Reconnect if the HLS server drops a connection mid-stream.
        cmd += ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10"]
    cmd += [
        "-i", media_url, "-vn",
        "-ac", "1", "-ar", "16000",
        "-f", "segment", "-segment_time", str(lc.CHUNK_SECONDS),
        "-segment_format", "wav", "-reset_timestamps", "1",
        "-segment_start_number", str(start_index),
        str(audio_dir / "seg_%05d.wav"),
    ]
    return subprocess.Popen(cmd)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="page URL for yt-dlp (YouTube live, etc.)")
    src.add_argument("--media-url", help="direct media URL or local file (testing)")
    ap.add_argument("--minutes", type=int, default=180, help=f"how long to listen (1-{MAX_MINUTES})")
    ap.add_argument("--model", default="small.en", help="faster-whisper model: base.en | small.en")
    ap.add_argument("--repo", default=".", help="checkout to commit transcripts into")
    ap.add_argument("--branch", default=None, help="branch to push to (default: checked-out branch)")
    ap.add_argument("--meeting", default="cheyenne-council", help="slug for the output folder")
    ap.add_argument("--stub", action="store_true", help="skip whisper; placeholder text (testing)")
    ap.add_argument("--no-push", action="store_true", help="commit locally only")
    args = ap.parse_args()

    if not 1 <= args.minutes <= MAX_MINUTES:
        sys.exit(f"--minutes must be between 1 and {MAX_MINUTES}")
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg not found on PATH")

    repo = pathlib.Path(args.repo).resolve()
    if not (repo / ".git").exists():
        sys.exit(f"{repo} is not a git checkout")
    if args.branch is None:
        args.branch = os.environ.get("GITHUB_REF_NAME") or lc.git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()

    # Shape the namespace that lc.process_pending / lc.commit_and_push expect.
    pargs = SimpleNamespace(no_push=args.no_push, branch=args.branch, keep_audio=False, replay=None)

    rel_dir = f"live-transcripts/{dt.date.today().isoformat()}-{args.meeting}"
    out_dir = repo / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    transcriber = lc.Transcriber(args.model, stub=args.stub)
    audio_dir = pathlib.Path(tempfile.mkdtemp(prefix="stream-capture-"))
    done = set()
    t0 = time.time()
    deadline = t0 + args.minutes * 60
    quick_failures = 0
    proc = None

    lc.log(f"listening for {args.minutes} min; pushing to {args.branch} as each 30 s window finishes")
    try:
        while time.time() < deadline:
            try:
                media = args.media_url or resolve_media_url(args.url)
            except Exception as exc:
                quick_failures += 1
                lc.log(f"could not resolve stream ({quick_failures}/{MAX_QUICK_FAILURES}): {exc}")
                if quick_failures >= MAX_QUICK_FAILURES:
                    break
                time.sleep(30)
                continue

            run_started = time.time()
            proc = start_media_recorder(media, audio_dir, next_segment_index(audio_dir))
            lc.log("ffmpeg started on the live audio")
            while proc.poll() is None and time.time() < deadline:
                lc.process_pending(pargs, transcriber, audio_dir, out_dir, repo, rel_dir, t0, done, final=False)
                time.sleep(2)

            if proc.poll() is None:
                break  # deadline reached while still recording
            ran_for = time.time() - run_started
            lc.log(f"ffmpeg exited after {ran_for:.0f}s (code {proc.returncode})")
            quick_failures = quick_failures + 1 if ran_for < 60 else 0
            if quick_failures >= MAX_QUICK_FAILURES:
                lc.log("stream appears to have ended (repeated short runs); finishing")
                break
            time.sleep(10)
    except KeyboardInterrupt:
        lc.log("interrupted; flushing")
    finally:
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
        lc.process_pending(pargs, transcriber, audio_dir, out_dir, repo, rel_dir, t0, done, final=True)
        shutil.rmtree(audio_dir, ignore_errors=True)
        lc.log(f"done. transcript: {rel_dir}/transcript.md ({len(done)} windows)")


if __name__ == "__main__":
    main()
