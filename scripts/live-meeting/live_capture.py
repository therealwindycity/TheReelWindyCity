#!/usr/bin/env python3
"""Live meeting audio -> local speech-to-text -> git commit + push every 30 seconds.

Run this on YOUR machine. The build sandbox cannot reach zoom.us or cheyenne.granicus.com.

Pipeline
  ffmpeg (loopback audio device) --30s WAV segments--> transcriber (faster-whisper, local)
  -> live-transcripts/<date>-<meeting>/chunks/NNNN.md  and  transcript.md (appended)
  -> git commit (ONLY that folder) -> git push to the checked-out branch

Examples
  macOS (BlackHole 2ch loopback):   python3 live_capture.py --platform avfoundation --input ":BlackHole 2ch"
  Linux (PulseAudio monitor):       python3 live_capture.py --platform pulse --input default.monitor
  Windows (Stereo Mix):             python3 live_capture.py --platform dshow --input "audio=Stereo Mix (Realtek)"

Offline self-test (no audio device, no model download, pushes can be disabled):
  python3 live_capture.py --replay ./samples --stub --no-push
"""
import argparse
import datetime as dt
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time

CHUNK_SECONDS = 30
SEG_RE = re.compile(r"seg_(\d+)\.wav$")


def log(msg):
    print(f"[{dt.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def git(repo, *args, check=False):
    return subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True, check=check)


def fmt_clock(epoch):
    return dt.datetime.fromtimestamp(epoch).strftime("%H:%M:%S")


class Transcriber:
    def __init__(self, model_name, stub=False):
        self.stub = stub
        self.model = None
        if not stub:
            from faster_whisper import WhisperModel  # pip install faster-whisper
            log(f"loading whisper model '{model_name}' (first run downloads it)...")
            self.model = WhisperModel(model_name, device="cpu", compute_type="int8")

    def transcribe(self, wav_path):
        """Return a list of (offset_seconds, text) for the segment."""
        if self.stub:
            return [(0.0, f"(stub transcript for {wav_path.name})")]
        segments, _info = self.model.transcribe(
            str(wav_path), language="en", vad_filter=True, beam_size=1
        )
        return [(s.start, s.text.strip()) for s in segments if s.text.strip()]


def start_recorder(args, audio_dir):
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", args.platform, "-i", args.input,
        "-ac", "1", "-ar", "16000",
        "-f", "segment", "-segment_time", str(CHUNK_SECONDS),
        "-segment_format", "wav", "-reset_timestamps", "1",
        str(audio_dir / "seg_%05d.wav"),
    ]
    return subprocess.Popen(cmd)


def write_chunk(out_dir, idx, t0, segments):
    chunk_start = t0 + idx * CHUNK_SECONDS
    chunk_end = chunk_start + CHUNK_SECONDS
    lines = [f"[{fmt_clock(chunk_start + off)}] {text}" for off, text in segments]
    body = "\n".join(lines) if lines else "(no speech detected in this 30-second window)"

    chunks_dir = out_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    (chunks_dir / f"{idx:04d}.md").write_text(
        f"# Chunk {idx:04d}: {fmt_clock(chunk_start)} to {fmt_clock(chunk_end)}\n\n{body}\n",
        encoding="utf-8",
    )

    transcript = out_dir / "transcript.md"
    if not transcript.exists():
        transcript.write_text(
            f"# Live transcript, {out_dir.name}\n\n"
            "Machine-generated speech-to-text from public audio. Verify quotes against the official recording.\n\n",
            encoding="utf-8",
        )
    with transcript.open("a", encoding="utf-8") as f:
        f.write(f"## {fmt_clock(chunk_start)} to {fmt_clock(chunk_end)} (chunk {idx:04d})\n{body}\n\n")


def commit_and_push(args, repo, rel_dir, message):
    git(repo, "add", "--", rel_dir)
    r = git(repo, "commit", "-m", message, "--", rel_dir)
    if r.returncode != 0 and "nothing to commit" not in (r.stdout + r.stderr):
        log(f"commit warning: {(r.stderr or r.stdout).strip()}")
    if args.no_push:
        return
    for attempt in range(1, 4):
        p = git(repo, "push", "origin", f"HEAD:{args.branch}")
        if p.returncode == 0:
            return
        log(f"push attempt {attempt} failed: {p.stderr.strip()[-200:]}")
        # Someone else pushed, or the branch moved: rebase our pending commits and retry.
        git(repo, "pull", "--rebase", "--autostash", "origin", args.branch)
        time.sleep(2)
    log("push still failing; commits are kept locally and will go out with the next chunk")


def process_pending(args, transcriber, audio_dir, out_dir, repo, rel_dir, t0, done, final):
    segs = sorted(
        (int(SEG_RE.search(p.name).group(1)), p)
        for p in audio_dir.glob("seg_*.wav")
        if SEG_RE.search(p.name)
    )
    # The newest segment is still being written by ffmpeg, unless recording has stopped.
    ready = segs if final else segs[:-1]
    for idx, wav in ready:
        if idx in done:
            continue
        try:
            segments = transcriber.transcribe(wav)
        except Exception as exc:  # keep the meeting running even if one window fails
            log(f"chunk {idx:04d} transcription failed: {exc}")
            segments = []
        write_chunk(out_dir, idx, t0, segments)
        done.add(idx)
        stamp = fmt_clock(t0 + idx * CHUNK_SECONDS)
        commit_and_push(args, repo, rel_dir, f"live: chunk {idx:04d} ({stamp})")
        log(f"chunk {idx:04d} ({stamp}): {len(segments)} segment(s) pushed")
        if not args.keep_audio and not args.replay:
            wav.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--platform", default="avfoundation", help="ffmpeg input format: avfoundation | pulse | dshow")
    ap.add_argument("--input", help="ffmpeg audio input device (see examples above)")
    ap.add_argument("--replay", help="directory of seg_NNNNN.wav files to process instead of live capture")
    ap.add_argument("--model", default="small.en", help="faster-whisper model: base.en | small.en | medium.en")
    ap.add_argument("--repo", default=".", help="path to your local checkout of TheReelWindyCity")
    ap.add_argument("--branch", default=None, help="branch to push to (default: the checked-out branch)")
    ap.add_argument("--meeting", default="cheyenne-council", help="slug used in the output folder name")
    ap.add_argument("--stub", action="store_true", help="skip whisper; write placeholder text (testing)")
    ap.add_argument("--no-push", action="store_true", help="commit locally but do not push")
    ap.add_argument("--keep-audio", action="store_true", help="keep WAV segments after transcription")
    args = ap.parse_args()

    repo = pathlib.Path(args.repo).resolve()
    if not (repo / ".git").exists():
        sys.exit(f"{repo} is not a git checkout")
    if shutil.which("git") is None:
        sys.exit("git not found on PATH")
    if args.branch is None:
        args.branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()

    date = dt.date.today().isoformat()
    rel_dir = f"live-transcripts/{date}-{args.meeting}"
    out_dir = repo / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    transcriber = Transcriber(args.model, stub=args.stub)
    done = set()
    t0 = time.time()

    if args.replay:
        audio_dir = pathlib.Path(args.replay).resolve()
        process_pending(args, transcriber, audio_dir, out_dir, repo, rel_dir, t0, done, final=True)
        log("replay finished")
        return

    if not args.input:
        sys.exit("--input is required for live capture (or use --replay for testing)")
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg not found on PATH")

    audio_dir = pathlib.Path(tempfile.mkdtemp(prefix="live-capture-"))  # audio stays out of git
    log(f"recording from {args.platform}:{args.input} -> {audio_dir}")
    t0 = time.time()
    recorder = start_recorder(args, audio_dir)
    log(f"pushing to {args.branch} every ~{CHUNK_SECONDS}s. Ctrl+C to stop.")
    try:
        while recorder.poll() is None:
            process_pending(args, transcriber, audio_dir, out_dir, repo, rel_dir, t0, done, final=False)
            time.sleep(2)
        log("ffmpeg exited; flushing remaining audio")
    except KeyboardInterrupt:
        log("stopping...")
    finally:
        if recorder.poll() is None:
            recorder.terminate()
            try:
                recorder.wait(timeout=10)
            except subprocess.TimeoutExpired:
                recorder.kill()
        process_pending(args, transcriber, audio_dir, out_dir, repo, rel_dir, t0, done, final=True)
        if not args.keep_audio:
            shutil.rmtree(audio_dir, ignore_errors=True)
        log(f"done. transcript: {out_dir / 'transcript.md'}")


if __name__ == "__main__":
    main()
