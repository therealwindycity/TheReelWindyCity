#!/usr/bin/env python3
"""Source-aware civic research queue. Retrieval never implies claim verification."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen

TARGETS = Path(__file__).with_name('civic_engine_targets.json')


def seconds(value):
    parts = value.split(':')
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError('Expected HH:MM:SS')
    h, m, s = map(int, parts)
    if m > 59 or s > 59:
        raise ValueError('Invalid time')
    return h * 3600 + m * 60 + s


def section(item):
    start = seconds(item['start'])
    if item['duration'] <= 0:
        raise ValueError('Duration must be positive')
    return f"*{start}-{start + item['duration']}"


def init_db(path, items):
    db = sqlite3.connect(path)
    db.executescript('''
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY, instrument TEXT, meeting_date TEXT,
      supplied_claim TEXT, supplied_quote TEXT, verification TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (
      case_id TEXT REFERENCES cases(id), kind TEXT, url TEXT,
      status TEXT, retrieved_at TEXT, sha256 TEXT, local_path TEXT, error TEXT,
      PRIMARY KEY(case_id,kind));
    CREATE TABLE IF NOT EXISTS votes (
      case_id TEXT REFERENCES cases(id), member TEXT, vote TEXT,
      source_url TEXT NOT NULL, locator TEXT NOT NULL,
      verification TEXT NOT NULL, PRIMARY KEY(case_id,member));
    ''')
    for item in items:
        db.execute('INSERT OR REPLACE INTO cases VALUES (?,?,?,?,?,?)',
                   (item['id'], item['instrument'], item['date'], item['claim'],
                    item['quote'], 'unverified-user-supplied'))
    db.commit()
    return db


def retrieve(db, item, kind, root, restricted):
    url = item[kind + '_url']
    status, digest, local, error = 'blocked-network-policy', None, None, None
    if restricted:
        error = 'Municipal and video hosts are outside this sandbox allowlist.'
    else:
        try:
            with urlopen(Request(url, headers={'User-Agent': 'CivicEvidenceResearch/1.0'}), timeout=15) as response:
                data = response.read(25 * 1024 * 1024 + 1)
                if len(data) > 25 * 1024 * 1024:
                    raise ValueError('Source exceeds 25 MiB retrieval limit')
                if not data:
                    raise ValueError('Empty response')
                path = root / f"{item['id']}-{kind}.bin"
                path.write_bytes(data)
                digest, local = hashlib.sha256(data).hexdigest(), str(path.resolve())
                status = 'retrieved-not-content-verified'
        except Exception as exc:
            status, error = 'retrieval-failed', str(exc)
    db.execute('INSERT OR REPLACE INTO sources VALUES (?,?,?,?,?,?,?,?)',
               (item['id'], kind, url, status, datetime.now(timezone.utc).isoformat(), digest, local, error))
    db.commit()
    return {'case_id': item['id'], 'kind': kind, 'url': url, 'status': status, 'error': error}


def render_posts(items, statuses):
    lines = ['# The Real Windy City — municipal records review queue',
             '', '**UNVERIFIED DRAFT — not publication-ready findings.**',
             'These are user-supplied research leads, not established wrongdoing. Links, dates, quotations, votes and video cues require source review. Successful retrieval does not verify a claim.', '']
    for item in items:
        lines += [f"## {item['instrument']} — supplied date {item['date']}",
                  f"**Research question:** {item['claim']}",
                  f"[Supplied packet link]({item['primary_url']}) · [Supplied minutes link]({item['minutes_url']})",
                  f"[Unverified video cue {item['start']}]({item['video_url']}&t={seconds(item['start'])}s)",
                  f"**Unverified supplied quotation (not authenticated):** {item['quote']}"]
        for status in statuses:
            if status['case_id'] == item['id']:
                lines.append(f"- {status['kind']}: {status['status']}")
        lines += ['**Before publication:** authenticate the document and meeting date, locate the quotation/page, check the final action and roll call, review surrounding footage, and distinguish fact from interpretation.', '']
    lines += ['## Vote coverage', 'No verified roll-call rows have been imported. The votes table is intentionally empty rather than inferring votes from supplied prose.', '']
    return '\n'.join(lines)


def run(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=600)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])


def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)],
                            capture_output=True, text=True, check=True, timeout=30)
    data = json.loads(result.stdout)
    if not any(s['codec_type'] == 'video' for s in data['streams']):
        raise ValueError('No video stream')
    return data


def montage(items, workspace, restricted):
    output = workspace / 'exports/cheyenne_corruption_montage.mp4'
    # Never leave an earlier run looking like current success.
    if output.exists():
        output.unlink()
    if restricted:
        return {'status': 'blocked-network-policy', 'output': None}
    missing = [tool for tool in ('yt-dlp', 'ffmpeg', 'ffprobe') if not shutil.which(tool)]
    if missing:
        return {'status': 'missing-tools', 'tools': missing, 'output': None}
    clips, failures = [], []
    for index, item in enumerate(items, 1):
        raw = workspace / 'video_clips' / f'raw_{index}.mp4'
        normalized = raw.with_name(f'clip_{index}.mp4')
        try:
            for path in (raw, normalized):
                path.unlink(missing_ok=True)
            run(['yt-dlp', '--no-playlist', '--retries', '1', '--socket-timeout', '15',
                 '--download-sections', section(item), '--force-keyframes-at-cuts',
                 '-f', 'bv*[height<=720]+ba/b[height<=720]/best', '--merge-output-format', 'mp4',
                 '-o', str(raw), item['video_url']])
            streams = probe(raw)['streams']
            if not any(s['codec_type'] == 'audio' for s in streams):
                raise ValueError('Missing audio: not silently substituting a soundtrack')
            # Textfile avoids interpreting supplied punctuation as drawtext syntax.
            label = workspace / 'video_clips' / f'label_{index}.txt'
            label.write_text(f"UNVERIFIED RESEARCH CUE | {item['date']} | {item['start']}\n{item['instrument']}")
            vf = ("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,"
                  f"drawtext=textfile='{label.resolve()}':expansion=none:fontcolor=white:fontsize=22:box=1:boxcolor=black@0.8:x=24:y=h-80")
            run(['ffmpeg', '-y', '-i', str(raw), '-t', str(item['duration']), '-map', '0:v:0', '-map', '0:a:0',
                 '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
                 '-ar', '48000', '-ac', '2', '-af', 'aresample=async=1:first_pts=0',
                 '-avoid_negative_ts', 'make_zero', str(normalized)])
            probe(normalized)
            clips.append(normalized)
        except (RuntimeError, ValueError, subprocess.SubprocessError, OSError) as exc:
            failures.append({'case_id': item['id'], 'error': str(exc)})
    # Require all four segments: no silently incomplete montage.
    if failures or len(clips) != len(items):
        return {'status': 'incomplete-no-montage', 'failures': failures, 'output': None}
    manifest = workspace / 'concat_list.txt'
    manifest.write_text(''.join(f"file '{clip.resolve()}'\n" for clip in clips))
    try:
        run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(manifest), '-c', 'copy',
             '-movflags', '+faststart', str(output)])
        probe(output)
    except (RuntimeError, ValueError, subprocess.SubprocessError, OSError) as exc:
        output.unlink(missing_ok=True)
        return {'status': 'render-failed', 'error': str(exc), 'output': None}
    return {'status': 'rendered-unverified-research-cues', 'output': str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=Path('arena_workspace'))
    parser.add_argument('--restricted-network', action='store_true', help='Record sandbox network blocks without attempting forbidden hosts')
    parser.add_argument('--targets', type=Path, default=TARGETS)
    args = parser.parse_args()
    items = json.loads(args.targets.read_text())
    for item in items:
        section(item)
    for name in ('exports', 'sources', 'video_clips'):
        (args.workspace / name).mkdir(parents=True, exist_ok=True)
    with init_db(args.workspace / 'cheyenne_records.sqlite3', items) as db:
        statuses = [retrieve(db, item, kind, args.workspace / 'sources', args.restricted_network)
                    for item in items for kind in ('primary', 'minutes')]
    (args.workspace / 'exports/evidence_posts_with_links.md').write_text(render_posts(items, statuses), encoding='utf-8')
    video = montage(items, args.workspace, args.restricted_network)
    report = {'claims_verified': 0, 'votes_verified': 0, 'sources': statuses, 'video': video}
    (args.workspace / 'exports/run_report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if video['output'] else 2


if __name__ == '__main__':
    sys.exit(main())
