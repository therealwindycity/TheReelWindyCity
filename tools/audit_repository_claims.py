#!/usr/bin/env python3
"""Audit claimed repository mechanisms against an immutable Git tree.

Read-only public GitHub requests use gh. Cache and reports stay outside tracked
source directories. Identifier presence is not implementation or misconduct.
"""
import argparse
import base64
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sqlite3
import subprocess
import uuid
from urllib.parse import quote

REPO = 'bartimoussmith-oss/therealwindycity'
CODE_SUFFIXES = {'.py', '.sql', '.yml', '.yaml', '.sh', '.js', '.mjs', '.ts', '.tsx'}
DOCS = {'tools/ESTOPPEL_EFFECT_ALGORITHM.md', 'drive-import/manifest.json',
        'docs/ARCHITECTURE-TIERS.md', 'MONTAGE_INTEGRATION.md'}
MARKERS = ('Watchdog Efficacy', 'Text-to-Action Divergence', 'Ghost Quorum',
           'Consultant Absorption Ratio', 'reserve_drawdown', 'spet_transfer',
           'transcript_linked', 'action_items', 'voiceprint', 'voice_print', 'sentiment')
JSON_KEYS = {'action_items', 'transcript_linked', 'reserve_drawdown', 'spet_transfer',
             'ballot_language', 'grant_receipt_date', 'outlay_date', 'fund_id',
             'vote_cast', 'attendance', 'vendor', 'amount'}


def git_blob_sha(data):
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()


def safe_relative(value):
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or '\\' in value or '\0' in value:
        raise ValueError('Unsafe repository path')
    return path


def selected(entry):
    if entry.get('type') != 'blob' or entry.get('mode') == '120000':
        return False
    path = safe_relative(entry['path'])
    return (path.suffix in CODE_SUFFIXES or
            (path.suffix == '.json' and path.parts[0] != 'scanner-results') or str(path) in DOCS)


def fetch_verified(entry, root, cache, max_bytes=64*1024*1024):
    path = safe_relative(entry['path'])
    sha = entry['sha']
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Invalid Git object SHA')
    if entry.get('size', 0) > max_bytes:
        return None, 'over-size-bound'
    candidate = (root / str(path)).resolve()
    if candidate.is_relative_to(root.resolve()) and candidate.is_file() and candidate.stat().st_size <= max_bytes:
        data = candidate.read_bytes()
        if len(data) <= max_bytes and git_blob_sha(data) == sha:
            return data, 'matching-local-Git-blob'
    destination = cache / sha
    if destination.exists():
        if destination.stat().st_size > max_bytes:
            raise ValueError('Cached blob exceeds size bound')
        data = destination.read_bytes()
        if len(data) <= max_bytes and git_blob_sha(data) == sha:
            return data, 'verified-cache'
        raise ValueError('Cached blob digest mismatch')
    result = subprocess.run(['gh', 'api', f'repos/{REPO}/git/blobs/{sha}'],
                            capture_output=True, text=True, timeout=60, check=True)
    payload = json.loads(result.stdout)
    if (not isinstance(payload, dict) or payload.get('encoding') != 'base64' or
            not isinstance(payload.get('size'), int) or not 0 <= payload['size'] <= max_bytes or
            not isinstance(payload.get('content'), str)):
        raise ValueError('Unsupported/oversized GitHub blob response')
    data = base64.b64decode(''.join(payload['content'].split()), validate=True)
    if len(data) > max_bytes or git_blob_sha(data) != sha:
        raise ValueError('Downloaded blob size/digest mismatch')
    cache.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix('.' + uuid.uuid4().hex + '.part')
    try:
        partial.write_bytes(data)
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)
    return data, 'GitHub-blob-API'


def profile_json(data):
    root_type = type(data).__name__
    root_keys = sorted(data) if isinstance(data, dict) else []
    counts = Counter()
    stack = [data]
    visited = 0
    while stack:
        node = stack.pop()
        visited += 1
        if visited > 2_000_000:
            raise ValueError('JSON node inspection limit exceeded')
        if isinstance(node, dict):
            for key, value in node.items():
                if key in JSON_KEYS:
                    counts[key] += 1
                if isinstance(value, (dict, list)):
                    stack.append(value)
        elif isinstance(node, list):
            stack.extend(value for value in node if isinstance(value, (dict, list)))
    return {'root_type': root_type, 'root_keys': root_keys,
            'target_key_occurrences': dict(counts), 'containers_visited': visited}


def marker_hits(text):
    hits = []
    offset = 0
    for number, line in enumerate(text.splitlines(keepends=True), 1):
        for marker in MARKERS:
            for match in re.finditer(re.escape(marker), line, re.I):
                hits.append({'marker': marker, 'line': number, 'column': match.start()+1,
                             'character_offset': offset+match.start(),
                             'excerpt': line[max(0, match.start()-120):match.end()+240].strip()})
        offset += len(line)
    return hits


def inspect_blob(entry, root, cache, ref):
    result = {'path': entry['path'], 'git_blob_sha': entry['sha'], 'bytes': entry.get('size'),
              'url': f'https://github.com/{REPO}/blob/{ref}/{quote(entry["path"])}'}
    try:
        data, origin = fetch_verified(entry, root, cache)
        result['acquisition'] = origin
        if data is None:
            result['status'] = 'skipped-size-bound'
            return result
        text = data.decode('utf-8')
        result['sha256'] = hashlib.sha256(data).hexdigest()
        result['marker_hits'] = marker_hits(text)
        if PurePosixPath(entry['path']).suffix == '.json':
            result['json_profile'] = profile_json(json.loads(text))
        result['status'] = 'inspected'
    except (OSError, ValueError, KeyError, RecursionError, subprocess.SubprocessError) as exc:
        result.update(status='failed', error=str(exc))
    return result


def inspect_local_databases(tree, root, cache):
    results = []
    for entry in tree:
        if entry.get('type') != 'blob' or PurePosixPath(entry['path']).suffix != '.db':
            continue
        path = root / str(safe_relative(entry['path']))
        row = {'path': entry['path'], 'upstream_blob_sha': entry['sha']}
        try:
            data, origin = fetch_verified(entry, root, cache)
            if data is None:
                row['status'] = 'not-inspected-size-bound'
                results.append(row)
                continue
            # Profile the validated bytes, not a potentially changing live DB.
            cache.mkdir(parents=True, exist_ok=True)
            path = cache / entry['sha']
            snapshot = path.with_suffix('.' + uuid.uuid4().hex + '.part')
            try:
                snapshot.write_bytes(data)
                snapshot.replace(path)
            finally:
                snapshot.unlink(missing_ok=True)
            row['acquisition'] = origin
            with sqlite3.connect(path.resolve().as_uri() + '?mode=ro&immutable=1', uri=True) as db:
                tables = []
                for name, sql in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
                    quoted = name.replace('"', '""')
                    tables.append({'name': name, 'sql': sql,
                                   'rows': db.execute(f'SELECT count(*) FROM "{quoted}"').fetchone()[0],
                                   'columns': [{'name': r[1], 'type': r[2], 'not_null': bool(r[3]), 'primary_key': r[5]}
                                               for r in db.execute(f'PRAGMA table_info("{quoted}")')]})
                row.update(status='inspected-read-only-matching-upstream-blob', tables=tables)
        except (sqlite3.Error, OSError, ValueError, KeyError, RecursionError, subprocess.SubprocessError) as exc:
            row.update(status='failed', error=str(exc))
        results.append(row)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--tree', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=Path('arena_workspace/repository-audit'))
    args = parser.parse_args()
    tree = json.loads(args.tree.read_text())
    if tree.get('truncated') is not False or not re.fullmatch(r'[a-f0-9]{40}', tree.get('sha', '')):
        raise ValueError('Need a complete immutable Git tree')
    entries = [r for r in tree['tree'] if selected(r)]
    args.out.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda entry: inspect_blob(entry, args.root, args.out/'blobs', tree['sha']), entries))
    results.sort(key=lambda r: r['path'])
    json_roots = Counter()
    keys = Counter()
    markers = Counter()
    for record in results:
        if 'json_profile' in record:
            json_roots[record['json_profile']['root_type']] += 1
            keys.update(record['json_profile']['target_key_occurrences'])
        for hit in record.get('marker_hits', []):
            markers[hit['marker']] += 1
    report = {'schema_version': 1, 'repository': REPO, 'immutable_tree_sha': tree['sha'], 'tree_entries': len(tree['tree']),
              'tree_input_sha256': hashlib.sha256(args.tree.read_bytes()).hexdigest(),
              'selection_policy': {'code_suffixes': sorted(CODE_SUFFIXES), 'extra_documents': sorted(DOCS),
                                   'excluded_json_top_directory': 'scanner-results',
                                   'max_blob_bytes': 64*1024*1024, 'max_json_containers': 2_000_000,
                                   'marker_mode': 'case-insensitive literal substring'},
              'truncated_tree': tree['truncated'], 'selection': 'Configured code extensions, non-scanner JSON and four specified documents; not a full binary/media or all-prose scan',
              'selected_files': len(entries), 'status_counts': dict(Counter(r['status'] for r in results)),
              'json_root_types': dict(json_roots), 'target_json_key_occurrences': dict(keys),
              'marker_hit_counts': {m: markers[m] for m in MARKERS},
              'files': results, 'databases': inspect_local_databases(tree['tree'], args.root, args.out/'blobs'),
              'limitations': ['Negative identifier matches are scoped findings, not proof about every historical implementation.',
                              'Database schemas and authored seed assertions do not prove working analytic joins or misconduct.',
                              'Scanner-result JSON is excluded; voice/audio and bank ledgers are not inspected.']}
    (args.out/'repository_claims_audit.json').write_text(json.dumps(report, indent=2)+'\n')
    summary = {k:v for k,v in report.items() if k not in ('files','databases')}
    print(json.dumps(summary,indent=2))
    return 0 if (all(r['status']=='inspected' for r in results) and
                 all(r['status']=='inspected-read-only-matching-upstream-blob' for r in report['databases'])) else 2


if __name__ == '__main__':
    raise SystemExit(main())
