#!/usr/bin/env python3
"""Source-aware civic research queue. Retrieval never implies claim verification."""
import argparse
import hashlib
import json
import os
import re
import uuid
from contextlib import contextmanager
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlparse

TARGETS = Path(__file__).with_name('civic_engine_targets.json')


@contextmanager
def workspace_lock(workspace):
    """Exclude overlapping writers. Crash leftovers require explicit inspection/removal."""
    workspace.mkdir(parents=True, exist_ok=True)
    lock = workspace / '.civic-engine.lock'
    token = uuid.uuid4().hex
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump({'pid': os.getpid(), 'token': token}, stream)
        yield
    finally:
        try:
            owned = json.loads(lock.read_text()).get('token') == token
        except (OSError, ValueError):
            owned = False
        if owned:
            lock.unlink()


def validate_targets(items):
    if not isinstance(items, list) or not items:
        raise ValueError('Targets must be a nonempty list')
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Each target must be an object')
        for field in ('id', 'date', 'instrument', 'claim', 'quote', 'start', 'primary_url', 'minutes_url', 'video_url'):
            if not isinstance(item.get(field), str) or not item[field]:
                raise ValueError(f'Missing/non-string target field: {field}')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', item['id']) or item['id'] in seen:
            raise ValueError('Unsafe or duplicate target ID')
        seen.add(item['id'])
        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', item['date']):
            raise ValueError('Meeting date must use YYYY-MM-DD')
        datetime.strptime(item['date'], '%Y-%m-%d')
        if isinstance(item.get('duration'), bool) or not isinstance(item.get('duration'), int) or not 1 <= item['duration'] <= 300:
            raise ValueError('Duration must be an integer from 1 through 300 seconds')
        section(item)
        for field in ('primary_url', 'minutes_url', 'video_url'):
            url = urlparse(item[field])
            hosts = {'www.youtube.com', 'youtube.com'} if field == 'video_url' else {'cheyenne.granicus.com'}
            if url.scheme != 'https' or url.hostname not in hosts or url.username or url.password or url.port not in (None, 443):
                raise ValueError(f'Unapproved source URL: {field}')


def seconds(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{2,}:[0-9]{2}:[0-9]{2}', value):
        raise ValueError('Expected HH:MM:SS using ASCII digits')
    parts = value.split(':')
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError('Expected HH:MM:SS')
    h, m, s = map(int, parts)
    if m > 59 or s > 59:
        raise ValueError('Invalid time')
    return h * 3600 + m * 60 + s


def section(item):
    start = seconds(item['start'])
    if isinstance(item['duration'], bool) or not isinstance(item['duration'], int) or not 1 <= item['duration'] <= 300:
        raise ValueError('Duration must be an integer from 1 through 300 seconds')
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
        db.execute('''INSERT INTO cases VALUES (?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET instrument=excluded.instrument,
                   meeting_date=excluded.meeting_date, supplied_claim=excluded.supplied_claim,
                   supplied_quote=excluded.supplied_quote, verification=excluded.verification''',
                   (item['id'], item['instrument'], item['date'], item['claim'],
                    item['quote'], 'unverified-user-supplied'))
    db.commit()
    return db


def retrieve(db, item, kind, root, restricted):
    if kind not in ('primary', 'minutes') or not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', item['id']):
        raise ValueError('Unsafe source identity')
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{item['id']}-{kind}.bin"
    partial = path.with_suffix('.part')
    path.unlink(missing_ok=True)
    partial.unlink(missing_ok=True)
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
                partial.write_bytes(data)
                partial.replace(path)
                digest, local = hashlib.sha256(data).hexdigest(), str(path.resolve())
                status = 'retrieved-not-content-verified'
        except Exception as exc:
            partial.unlink(missing_ok=True)
            path.unlink(missing_ok=True)
            status, error = 'retrieval-failed', str(exc)
    db.execute('''INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(case_id,kind) DO UPDATE SET url=excluded.url,status=excluded.status,
               retrieved_at=excluded.retrieved_at,sha256=excluded.sha256,
               local_path=excluded.local_path,error=excluded.error''',
               (item['id'], kind, url, status, datetime.now(timezone.utc).isoformat(), digest, local, error))
    db.commit()
    return {'case_id': item['id'], 'kind': kind, 'url': url, 'status': status,
            'sha256': digest, 'local_path': local, 'error': error}


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


def run(command, cwd=None):
    result = subprocess.run(command, capture_output=True, text=True, timeout=600, cwd=cwd)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])


def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)],
                            capture_output=True, text=True, check=True, timeout=30)
    data = json.loads(result.stdout)
    duration = float(data.get('format', {}).get('duration', 0))
    if not 0 < duration < 86400:
        raise ValueError('Missing, non-finite or invalid media duration')
    if not any(s['codec_type'] == 'video' for s in data['streams']):
        raise ValueError('No video stream')
    return data


def montage(items, workspace, restricted):
    workspace = workspace.resolve()
    output = workspace / 'exports/cheyenne_corruption_montage.mp4'
    # Never leave an earlier run looking like current success.
    if output.exists():
        output.unlink()
    if restricted:
        return {'status': 'blocked-network-policy', 'output': None}
    missing = [tool for tool in ('yt-dlp', 'ffmpeg', 'ffprobe') if not shutil.which(tool)]
    if missing:
        return {'status': 'missing-tools', 'tools': missing, 'output': None}
    (workspace / 'video_clips').mkdir(parents=True, exist_ok=True)
    (workspace / 'exports').mkdir(parents=True, exist_ok=True)
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
                  f"drawtext=textfile={label.name}:expansion=none:fontcolor=white:fontsize=22:box=1:boxcolor=black@0.8:x=24:y=h-80")
            run(['ffmpeg', '-y', '-i', str(raw), '-t', str(item['duration']), '-map', '0:v:0', '-map', '0:a:0',
                 '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
                 '-ar', '48000', '-ac', '2', '-af', 'aresample=async=1:first_pts=0',
                 '-avoid_negative_ts', 'make_zero', str(normalized)], cwd=raw.parent)
            metadata = probe(normalized)
            if abs(float(metadata['format']['duration']) - item['duration']) > 2:
                raise ValueError('Rendered clip duration does not match requested section')
            clips.append(normalized)
        except (RuntimeError, ValueError, subprocess.SubprocessError, OSError) as exc:
            normalized.unlink(missing_ok=True)
            failures.append({'case_id': item['id'], 'error': str(exc)})
    # Require all four segments: no silently incomplete montage.
    if failures or len(clips) != len(items):
        return {'status': 'incomplete-no-montage', 'failures': failures, 'output': None}
    manifest = workspace / 'concat_list.txt'
    manifest.write_text(''.join(f"file '{clip.resolve()}'\n" for clip in clips))
    try:
        run(['ffmpeg', '-y', '-f', 'concat', '-safe', '1', '-i', str(manifest), '-c', 'copy',
             '-movflags', '+faststart', str(output)])
        metadata = probe(output)
        if abs(float(metadata['format']['duration']) - sum(item['duration'] for item in items)) > 2:
            raise ValueError('Final montage duration differs from requested sections')
        run(['ffmpeg', '-v', 'error', '-i', str(output), '-f', 'null', '-'])
    except (RuntimeError, ValueError, subprocess.SubprocessError, OSError) as exc:
        output.unlink(missing_ok=True)
        return {'status': 'render-failed', 'error': str(exc), 'output': None}
    return {'status': 'rendered-unverified-research-cues', 'output': str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=Path('arena_workspace'))
    parser.add_argument('--restricted-network', action='store_true', help='Record sandbox network blocks without attempting forbidden hosts')
    parser.add_argument('--targets', type=Path, default=TARGETS)
    parser.add_argument('--skip-video', action='store_true', help='Do not retry video access barriers; record not-attempted status')
    args = parser.parse_args()
    items = json.loads(args.targets.read_text())
    validate_targets(items)
    with workspace_lock(args.workspace):
        for name in ('exports', 'sources', 'video_clips'):
            (args.workspace / name).mkdir(parents=True, exist_ok=True)
        # Outputs from prior runs cannot be mistaken for a current retrieval.
        for name in ('run_report.json', 'source_content_inspection.json', 'official_media_report.json',
                     'completion_report.json', 'completion_manifest.json', 'official_archive_cue_montage.mp4', 'cheyenne_corruption_montage.mp4'):
            (args.workspace / 'exports' / name).unlink(missing_ok=True)
        db = init_db(args.workspace / 'cheyenne_records.sqlite3', items)
        try:
            statuses = [retrieve(db, item, kind, args.workspace / 'sources', args.restricted_network)
                        for item in items for kind in ('primary', 'minutes')]
        finally:
            db.close()
        (args.workspace / 'exports/evidence_posts_with_links.md').write_text(render_posts(items, statuses), encoding='utf-8')
        if args.skip_video:
            video = {'status': 'not-attempted', 'reason': 'Video retries require explicit opt-in', 'output': None}
        else:
            video = montage(items, args.workspace, args.restricted_network)
        report = {'run_id': uuid.uuid4().hex, 'generated_utc': datetime.now(timezone.utc).isoformat(),
                  'targets_sha256': hashlib.sha256(args.targets.read_bytes()).hexdigest(),
                  'claims_verified': 0, 'votes_verified': 0, 'sources': statuses, 'video': video}
        report_path = args.workspace / 'exports/run_report.json'
        partial = report_path.with_suffix('.tmp')
        partial.write_text(json.dumps(report, indent=2) + '\n')
        partial.replace(report_path)
        print(json.dumps(report, indent=2))
        sources_ok = all(r['status'] == 'retrieved-not-content-verified' for r in statuses)
        return 0 if sources_ok and (args.skip_video or video['output']) else 2


if __name__ == '__main__':
    sys.exit(main())
