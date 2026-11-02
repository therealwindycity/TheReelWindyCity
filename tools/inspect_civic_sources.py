#!/usr/bin/env python3
"""Bounded, source-hashed PDF inspection; retrieval is not claim verification."""
import argparse
from datetime import datetime
import hashlib
import html
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'arena_workspace'
TERMS = ['stormwater', '1,000,0000', 'Fremont', '3-2', '4669', '6544', '5,650,000', 'Aldrich']
MAX_PAGES = 300
MAX_TEXT = 20 * 1024 * 1024


def notice(title, data):
    """Keep valid JSON within GitHub's annotation truncation boundary."""
    message = json.dumps(data, ensure_ascii=True)
    if len(message.encode()) > 3400:
        message = json.dumps({'annotation_abbreviated': True,
                              'case_id': data.get('case_id'), 'kind': data.get('kind'),
                              'inspection_status': data.get('inspection_status'),
                              'issues': data.get('issues', []),
                              'full_record': 'source_content_inspection.json'})
    message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::notice title={title}::{message}', flush=True)


def date_and_role(text):
    normalized = re.sub(r'\s+', ' ', text)
    role = ('minutes' if 'RECORD OF PROCEEDINGS' in normalized.upper() else
            'memo' if 'MEMORANDUM' in normalized.upper() else 'unclassified')
    match = re.search(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b', normalized)
    date = None
    if match:
        try:
            date = datetime.strptime(' '.join(match.groups()), '%B %d %Y').date().isoformat()
        except ValueError:
            pass
    return date, role


def trusted_media_url(value):
    try:
        parsed = urlparse(value)
        return (parsed.scheme == 'https' and parsed.hostname == 'archive-stream.granicus.com'
                and parsed.port in (None, 443) and not parsed.username and not parsed.password
                and not parsed.fragment and parsed.path.lower().endswith(('.mp4', '.m3u8')))
    except ValueError:
        return False


def extract_named_votes(texts, record):
    """Narrow extraction rule: explicit names only; no roll-call expansion or tally."""
    if (record.get('inspection_status') != 'inspected' or record.get('document_role') != 'minutes'
            or record.get('document_date') != '2026-10-26'
            or record.get('case_id') != 'CASE-04-REED-AVE-VS-STORMWATER'):
        return []
    pattern = re.compile(r'Motion failed\. Voting ["“]no["”]\s*[–—-]\s*all members of the governing body with the exception of Dr\. Aldrich and Mr\. White voting ["“]yes["”]', re.I)
    votes = []
    for page, text in enumerate(texts, 1):
        normalized = re.sub(r'\s+', ' ', text)
        for match in pattern.finditer(normalized):
            context = normalized[max(0, match.start()-800):match.end()]
            if 'stormwater runoff' not in context.lower():
                continue
            for member in ('Dr. Aldrich', 'Mr. White'):
                votes.append({'member': member, 'vote': 'YES', 'page': page,
                              'source_url': record['url'], 'source_sha256': record['sha256'],
                              'context': context,
                              'verification': 'explicit-named-vote-in-retrieved-PDF-not-audio-verified'})
    return votes


def inspect_one(row, workspace):
    record = {key: row[key] for key in ('case_id', 'kind', 'url')}
    record.update(retrieval_status=row['status'], inspection_status='not-retrieved', issues=[])
    target = workspace / 'exports' / f"{row['case_id']}-{row['kind']}-extracted.txt"
    target.unlink(missing_ok=True)
    texts = []
    if row['status'] != 'retrieved-not-content-verified' or not row['local_path']:
        return record
    try:
        path = Path(row['local_path']).resolve()
        if not path.is_relative_to((workspace / 'sources').resolve()):
            raise ValueError('Source path is outside workspace sources')
        data = path.read_bytes()
        if len(data) > 25 * 1024 * 1024:
            raise ValueError('Source exceeds 25 MiB inspection limit')
        record['bytes'] = len(data)
        record['sha256'] = hashlib.sha256(data).hexdigest()
        if record['sha256'] != row['sha256']:
            raise ValueError('Retrieved file hash does not match source ledger')
        if not data.startswith(b'%PDF-'):
            record.update(response_type='non-PDF', inspection_status='unexpected-response')
            text = data.decode('utf-8', errors='replace')
            record['response_excerpt'] = re.sub('<[^>]+>', ' ', text)[:500]
            record['issues'].append('non-PDF-response')
            return record
        record['response_type'] = 'PDF'
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise ValueError('Encrypted PDF is not automatically decrypted')
        record['pages'] = len(reader.pages)
        if not 0 < len(reader.pages) <= MAX_PAGES:
            raise ValueError('PDF page count outside supported inspection bound')
        chars = 0
        for page in reader.pages:
            text = page.extract_text() or ''
            chars += len(text)
            if chars > MAX_TEXT:
                raise ValueError('Extracted text exceeds inspection bound')
            texts.append(text)
        if not any(t.strip() for t in texts):
            record['inspection_status'] = 'needs-ocr'
            record['issues'].append('no-extractable-text')
            return record
        record['inspection_status'] = 'inspected'
        record['first_page_excerpt'] = texts[0][:500]
        record['document_date'], record['document_role'] = date_and_role(texts[0])
        if row['kind'] == 'minutes' and record['document_role'] != 'minutes':
            record['issues'].append('supplied-minutes-link-is-not-minutes')
        if record['document_role'] == 'minutes' and record['document_date'] != row['meeting_date']:
            record['issues'].append('proceedings-date-does-not-match-supplied-case-date')
        record['excerpts'] = []
        for page, text in enumerate(texts, 1):
            for term in TERMS:
                # This is lexical matching, not evidence of a motion or a 3-2 tally.
                pos = text.lower().find(term.lower())
                if pos >= 0:
                    record['excerpts'].append({'page': page, 'term': term,
                                              'text': text[max(0, pos-160):pos+450]})
        target.write_text('\n\n'.join(f'PAGE {i}\n{t}' for i, t in enumerate(texts, 1)))
        record['extracted_text_sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        record['named_votes'] = extract_named_votes(texts, record)
    except Exception as exc:
        target.unlink(missing_ok=True)
        record.update(inspection_status='inspection-failed', error=str(exc))
    return record


def discover_media():
    media = []
    for clip in ('1099', '1095', '1120', '1144'):
        url = f'https://cheyenne.granicus.com/MediaPlayer.php?view_id=2&clip_id={clip}'
        row = {'clip_id': clip, 'page_url': url}
        try:
            with urlopen(Request(url, headers={'User-Agent': 'CivicEvidenceResearch/1.0'}), timeout=15) as response:
                data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise ValueError('Player response exceeds 2 MiB bound')
            text = data.decode('utf-8', errors='replace').replace('\\/', '/')
            row['page_titles'] = re.findall(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)[:1]
            candidates = {html.unescape(s) for s in re.findall(r'https?[^\s\x22\x27<>]+\.(?:mp4|m3u8)(?:\?[^\s\x22\x27<>]*)?', text, re.I)}
            row['official_media_candidates'] = sorted(s for s in candidates if trusted_media_url(s))[:5]
        except Exception as exc:
            row['error'] = str(exc)
        media.append(row)
    return media


def inspect_workspace(workspace, skip_discovery=False):
    exports = workspace / 'exports'
    exports.mkdir(parents=True, exist_ok=True)
    report_path = exports / 'source_content_inspection.json'
    report_path.unlink(missing_ok=True)
    run = json.loads((exports / 'run_report.json').read_text())
    db_path = workspace / 'cheyenne_records.sqlite3'
    with sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute('''SELECT s.*, c.meeting_date FROM sources s
                             JOIN cases c ON c.id=s.case_id ORDER BY s.case_id,s.kind''').fetchall()
    results = []
    for row in rows:
        record = inspect_one(row, workspace)
        results.append(record)
        brief = {k: v for k, v in record.items() if k not in ('excerpts', 'named_votes')}
        brief['excerpt_matches'] = sorted(record.get('excerpts', []), key=lambda r: TERMS.index(r['term']))[:2]
        notice(f"Source inspection {record['case_id']} {record['kind']}", brief)
    media = [] if skip_discovery else discover_media()
    # Eight source notices plus one summary stay below the ten-annotation step limit.
    notice('Media discovery summary', {'discovered': len(media), 'full_records': 'source_content_inspection.json'})
    report = {'run_id': run['run_id'], 'sources': results, 'media': media,
              'media_discovery_status': 'not-attempted' if skip_discovery else 'attempted'}
    with sqlite3.connect(db_path) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('''CREATE TABLE IF NOT EXISTS source_inspections (
          case_id TEXT,kind TEXT,source_sha256 TEXT,status TEXT,issues_json TEXT,run_id TEXT,
          PRIMARY KEY(case_id,kind),FOREIGN KEY(case_id,kind) REFERENCES sources(case_id,kind))''')
        for case_id in {r['case_id'] for r in results}:
            db.execute('DELETE FROM votes WHERE case_id=? AND verification=?',
                       (case_id, 'explicit-named-vote-in-retrieved-PDF-not-audio-verified'))
        for record in results:
            db.execute('INSERT OR REPLACE INTO source_inspections VALUES (?,?,?,?,?,?)',
                       (record['case_id'], record['kind'], record.get('sha256'), record['inspection_status'],
                        json.dumps(record['issues']), run['run_id']))
            for vote in record.get('named_votes', []):
                # Preserve any manually reviewed record with the same case/member key.
                db.execute('INSERT OR IGNORE INTO votes VALUES (?,?,?,?,?,?)',
                           (record['case_id'], vote['member'], vote['vote'], vote['source_url'],
                            f"page {vote['page']}; sha256 {vote['source_sha256']}", vote['verification']))
    temporary = report_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(report_path)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=WORK)
    parser.add_argument('--skip-discovery', action='store_true')
    args = parser.parse_args()
    report = inspect_workspace(args.workspace, args.skip_discovery)
    return 0 if all(r['inspection_status'] == 'inspected' for r in report['sources']) else 2


if __name__ == '__main__':
    raise SystemExit(main())
