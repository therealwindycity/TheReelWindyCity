#!/usr/bin/env python3
"""Fail-closed completion gate for civic retrieval, source association and media."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
from civic_engine import probe


class ReportError(ValueError):
    pass


def load_object(path):
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        raise ReportError(f'{path.name}: {exc}') from exc
    if not isinstance(data, dict):
        raise ReportError(f'{path.name}: expected JSON object')
    return data


def inspect_completion(workspace, require_media=False):
    exports = workspace / 'exports'
    failures = []
    report = {'schema_version': 1, 'documents_complete': False, 'source_associations_valid': False,
              'media_complete': False, 'media_required': require_media,
              'publication_ready': False, 'objective_complete': False,
              'named_votes_imported': 0, 'failures': failures}
    try:
        run = load_object(exports / 'run_report.json')
        inspection = load_object(exports / 'source_content_inspection.json')
        if not run.get('run_id') or run['run_id'] != inspection.get('run_id'):
            raise ReportError('Retrieval and inspection run IDs are missing or different')
        report['run_id'] = run['run_id']
        sources = run.get('sources')
        checked = inspection.get('sources')
        if not isinstance(sources, list) or not sources or not isinstance(checked, list):
            raise ReportError('Missing/non-list source records')
        expected = {(s['case_id'], s['kind']) for s in sources}
        actual = {(s['case_id'], s['kind']) for s in checked}
        if len(expected) != len(sources) or len(actual) != len(checked) or expected != actual:
            raise ReportError('Duplicate, missing or extra inspection records')
        # Case registry supplies two roles per case. Missing whole cases are detected
        # from the persisted database, not guessed from the report length.
        with sqlite3.connect((workspace / 'cheyenne_records.sqlite3').resolve().as_uri() + '?mode=ro', uri=True) as db:
            cases = {r[0] for r in db.execute('SELECT id FROM cases')}
            if expected != {(case, kind) for case in cases for kind in ('primary', 'minutes')}:
                raise ReportError('Source report does not cover every case and source role')
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
                raise ReportError('SQLite integrity or foreign-key check failed')
            ledger = {(r[0], r[1]): r[2:] for r in db.execute(
                'SELECT case_id,kind,url,status,sha256,local_path FROM sources')}
            for source in sources:
                identity = (source['case_id'], source['kind'])
                expected_row = tuple(source.get(k) for k in ('url', 'status', 'sha256', 'local_path'))
                if ledger.get(identity) != expected_row:
                    raise ReportError(f'{identity}: run report differs from SQLite source ledger')
            report['named_votes_imported'] = db.execute('SELECT count(*) FROM votes').fetchone()[0]
        source_lookup = {(s['case_id'], s['kind']): s for s in sources}
        issues = []
        for record in checked:
            identity = (record['case_id'], record['kind'])
            retrieved = source_lookup[identity]
            if retrieved.get('status') != 'retrieved-not-content-verified' or record.get('inspection_status') != 'inspected':
                failures.append(f'{identity}: retrieval/inspection incomplete')
                continue
            path = Path(retrieved.get('local_path') or '').resolve()
            if not path.is_relative_to((workspace / 'sources').resolve()):
                failures.append(f'{identity}: source path outside workspace')
                continue
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != retrieved.get('sha256') or digest != record.get('sha256'):
                failures.append(f'{identity}: source digest mismatch')
            extracted = exports / f'{identity[0]}-{identity[1]}-extracted.txt'
            if hashlib.sha256(extracted.read_bytes()).hexdigest() != record.get('extracted_text_sha256'):
                failures.append(f'{identity}: extracted-text digest mismatch')
            issues.extend({'case_id': identity[0], 'kind': identity[1], 'issue': issue}
                          for issue in record.get('issues', []))
        report['source_count'] = len(sources)
        report['documents_complete'] = not failures
        report['association_issues'] = issues
        report['source_associations_valid'] = not issues and report['documents_complete']
        if issues:
            failures.append(f'{len(issues)} source role/date association issues require review')
        official_path = exports / 'official_media_report.json'
        if official_path.exists():
            media = load_object(official_path)
            if media.get('run_id') != run['run_id']:
                failures.append('Official-media report belongs to a different run')
            else:
                clips = media.get('clips', [])
                clip_ids = {r.get('case_id') for r in clips}
                valid = (len(clips) == len(cases) and clip_ids == cases and
                         all(r.get('status') == 'rendered-unverified-cue' for r in clips))
                if media.get('complete_montage') and valid:
                    output = exports / 'official_archive_cue_montage.mp4'
                    if hashlib.sha256(output.read_bytes()).hexdigest() != media.get('output_sha256'):
                        raise ReportError('Montage file digest differs from official-media report')
                    metadata = probe(output)
                    report['media_complete'] = True
                    report['media_duration_seconds'] = float(metadata['format']['duration'])
        if require_media and not report['media_complete']:
            failures.append('Required authentic archive montage is incomplete')
        report['execution_gate_passed'] = not failures
        report['objective_complete'] = False  # Editorial/source-content verification is not automated.
        report['editorial_status'] = 'Human source-context and claim review still required; no automatic publication'
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error, subprocess.SubprocessError) as exc:
        failures.append(str(exc))
        report['execution_gate_passed'] = False
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=Path('arena_workspace'))
    parser.add_argument('--require-media', action='store_true')
    args = parser.parse_args()
    exports = args.workspace / 'exports'
    exports.mkdir(parents=True, exist_ok=True)
    result = inspect_completion(args.workspace, args.require_media)
    path = exports / 'completion_report.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, indent=2) + '\n')
    temporary.replace(path)
    # Manifest covers the database and evidence outputs, excluding itself.
    files = [args.workspace / 'cheyenne_records.sqlite3', exports / 'run_report.json',
             exports / 'source_content_inspection.json', path, exports / 'official_media_report.json',
             exports / 'official_archive_cue_montage.mp4']
    files.extend(sorted(exports.glob('*-extracted.txt')))
    manifest = {str(p.relative_to(args.workspace)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in files if p.is_file()}
    (exports / 'completion_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    brief = {k: v for k, v in result.items() if k != 'association_issues'}
    print('::notice title=Civic completion gate::' + json.dumps(brief).replace('%', '%25').replace('\n', '%0A'))
    return 0 if result['execution_gate_passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
