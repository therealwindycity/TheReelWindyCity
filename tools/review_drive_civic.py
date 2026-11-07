#!/usr/bin/env python3
"""Read-only Drive database inventory and reproducible municipal evidence review."""
import hashlib
import json
from pathlib import Path
import sqlite3
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / 'google_drive'
OUT = ROOT / 'arena_workspace/exports'
IDS = {
    'civic.db': '1wYgMB9R494lmNNlqyREguJTmdKhQgmd_',
    'cheyenne_watchdog.db': '1DjOJKhTF_Mxei_bTcfIC0uOWpuPDau8M',
    'promethean_evidence.db': '1gFLyAUAFzW3nPzdFWASyAniL7BFWASNf',
    'evidence.sqlite': '1LsGFLgCoBCX7cswUjz6le9HXMtkLx4MH',
    'engine.db': '1apCCzQm4WD-EEzw2zj9JXqBviRymdjor',
}
QUERIES = {
    'debt': '"6544" OR "1,000,0000.00"',
    'fleet': '"E-19-26" OR "E-20-26" OR "E-24-26"',
    'highlands': '"Highlands" AND ("3-2" OR "3,459.99" OR "design")',
    'reed': '"Reed Avenue" AND ("Appropriating" OR "reserve")',
    'unmatched_quote': '"advanced detailed design"',
}
# Selected archived pages, not automatically verified findings.
SELECTED = [
    ('debt', 330, 2), ('debt', 222, 2), ('debt', 122, 4),
    ('fleet', 488, 1), ('fleet', 489, 1),
    ('highlands', 137, 7), ('highlands', 148, 1),
    ('reed', 441, 2),
]


def connect(path):
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    for name, drive_id in IDS.items():
        path = DOWNLOADS / name
        with connect(path) as db:
            tables = []
            for row in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table'"):
                escaped = row['name'].replace('"', '""')
                tables.append({'table': row['name'], 'rows': db.execute(f'SELECT count(*) FROM "{escaped}"').fetchone()[0],
                               'schema': row['sql']})
            integrity = db.execute('PRAGMA quick_check').fetchone()[0]
        inventory.append({'file': name, 'drive_id': drive_id,
                          'url': f'https://drive.google.com/file/d/{drive_id}/view',
                          'size': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'quick_check': integrity, 'tables': tables})
    with connect(DOWNLOADS / 'civic.db') as db:
        coverage = dict(db.execute('SELECT min(date) AS start,max(date) AS end,count(*) AS meetings FROM meetings').fetchone())
        hits = {}
        for label, query in QUERIES.items():
            hits[label] = [dict(r) for r in db.execute('''
              SELECT d.id AS doc_id, p.page, m.date AS indexed_meeting_date,
                d.item_title,d.url,snippet(pages_fts,0,'[',']','…',55) AS excerpt
              FROM pages_fts JOIN pages p ON p.id=pages_fts.rowid
              JOIN docs d ON d.id=p.doc_id LEFT JOIN meetings m ON m.id=d.meeting_id
              WHERE pages_fts MATCH ? ORDER BY d.id,p.page''', (query,))]
        selected = []
        for case, doc, page in SELECTED:
            row = db.execute('''SELECT d.id AS doc_id,p.page,m.date AS indexed_meeting_date,
              d.item_title,d.url,p.text FROM pages p JOIN docs d ON d.id=p.doc_id
              LEFT JOIN meetings m ON m.id=d.meeting_id WHERE d.id=? AND p.page=?''', (doc,page)).fetchone()
            if row is None:
                raise ValueError(f'Missing selected page {doc}:{page}')
            selected.append({'case': case, **dict(row)})
    report = {'generated_utc': datetime.now(timezone.utc).isoformat(), 'inventory': inventory,
              'coverage': coverage, 'queries': QUERIES, 'hits': hits, 'selected_pages': selected,
              'verification': 'Archived extracted text reviewed; original PDFs, video, and live links not authenticated.'}
    (OUT / 'drive_database_review.json').write_text(json.dumps(report, indent=2) + '\n')
    # Separate derived database; never change downloaded originals or the original case registry.
    output_db = OUT / 'drive_evidence_review.sqlite3'
    with sqlite3.connect(output_db) as db:
        db.executescript('''
          CREATE TABLE IF NOT EXISTS source_databases(file TEXT PRIMARY KEY,drive_id TEXT,url TEXT,sha256 TEXT,size INTEGER);
          CREATE TABLE IF NOT EXISTS archived_pages(case_key TEXT,doc_id INTEGER,page INTEGER,indexed_meeting_date TEXT,
            title TEXT,url TEXT,text TEXT,status TEXT,PRIMARY KEY(doc_id,page));
          CREATE VIRTUAL TABLE IF NOT EXISTS archived_pages_fts USING fts5(case_key,doc_id UNINDEXED,page UNINDEXED,text);
          DELETE FROM archived_pages_fts;
        ''')
        for row in inventory:
            db.execute('INSERT OR REPLACE INTO source_databases VALUES (?,?,?,?,?)',
                       tuple(row[k] for k in ('file','drive_id','url','sha256','size')))
        for row in selected:
            db.execute('INSERT OR REPLACE INTO archived_pages VALUES (?,?,?,?,?,?,?,?)',
                       tuple(row[k] for k in ('case','doc_id','page','indexed_meeting_date','item_title','url','text'))
                       + ('archived-extraction-not-original-authenticated',))
            db.execute('INSERT INTO archived_pages_fts VALUES (?,?,?,?)',
                       tuple(row[k] for k in ('case','doc_id','page','text')))
    lines = ['# Drive database evidence review', '',
             '**Status:** archived database text reviewed; original PDFs, live URLs and video have not been authenticated. This is a correction/research report, not a finding of corruption.', '',
             '## Inventory', '| Database | Bytes | Integrity check |', '|---|---:|---|']
    for row in inventory:
        lines.append(f"| [{row['file']}]({row['url']}) | {row['size']:,} | {row['quick_check']} |")
    lines += ['', f"`civic.db` has {coverage['meetings']} indexed meetings, dated {coverage['start']} through {coverage['end']}. Indexed meeting dates may be packet/approval dates rather than the date of an embedded document.", '',
      '## What the archived text changes', '',
      '### 1. Debt application — typo present, supplied quotation inaccurate',
      'The extracted page contains `$1,000,0000.00` in a WHEREAS clause estimating annual principal and interest from approximately $750,000.00. It separately authorizes an application for a loan not exceeding $20 million. It does **not** say “Applicant debt service shall not exceed … annually.” The adoption date is blank in this packet text; the signed final version remains needed. [Packet, page 2](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1099&meta_id=148538).',
      'The archived June 22 minutes describe Resolution 6544 as adopted, with all governing-body members present voting yes. They also record public comment and a member comment; “rubber-stamped without proofreading” is not established by those minutes. [Minutes embedded in July 13 packet, page 4](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1120&meta_id=149219). No individual roll call was inferred.', '',
      '### 2. Fleet purchasing — supplied links recommend the Wyoming bidder',
      'The May 6 E-19-26 memo lists Duval and Fremont, then recommends **Fremont Motor Company for $78,819**. [Memo, page 1](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147788).',
      'The E-20-26 memo recommends **Fremont for $126,662**. The supplied “minutes” URL is actually this purchasing memo in the database. These are recommendations, not independently verified final awards. [Memo, page 1](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147790). Neither memo establishes a resident-preference violation.', '',
      '### 3. Highlands — scope of the 3–2 recommendation matters',
      'The staff report describes a 3,459.99-acre annexation request. [Report, packet page 7](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1120&meta_id=149235).',
      'The 3–2 disapproval described by the memo concerns a **future land-use map amendment**, not a blanket rejection of every annexation instrument. The same memo describes a statutory overruling process. That is a staff statement, not an independent legal conclusion. [Memo, page 1](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1120&meta_id=149247).',
      'An exact FTS search for “advanced detailed design” returned no matching page in this database. This does not prove the supplied quotation was never spoken; transcript/audio review remains necessary.', '',
      '### 4. Reed Avenue and stormwater — instrument mismatch and missing coverage',
      'The archived April 27 minutes identify the Reed Avenue appropriation as **Ordinance 4669**, not the supplied 4662. They record Moody voting no and a clerk note that no vote was recorded for Rinne due to technical issues. [Minutes embedded in May 11 packet, page 2](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147723).',
      'The selected page does not establish the supplied $5.65M amount or the claimed October 26 stormwater vote. The municipal database’s indexed meeting coverage ends September 22. Those later records must be located separately.', '',
      '## Database suitability',
      '- `civic.db`: source-linked extracted municipal pages; best of the inspected databases for these document checks.',
      '- `evidence.sqlite`: 7,894 observations: 6,319 historical URLs, 1,573 hostnames and 2 registrations. Infrastructure-discovery leads, not a municipal voting ledger.',
      '- `promethean_evidence.db`: 14 governance items; officials and voting_record tables contain zero rows. No verified council vote dataset here.',
      '- `cheyenne_watchdog.db`: small authored research tables. Labels such as “CONFIRMED EXACT” are stored assertions, not independent verification.',
      '- `engine.db`: monitored documents, versions and alerts. Alerts are research leads, not findings.', '',
      '## Not imported',
      '`master_meetings_database_linked.json` is 143,553,641 bytes and exceeds the connector’s 100 MiB download limit. `Apex_Omni_Vault_Final.db` also exceeds that limit. Neither was downloaded or searched. No coverage claims here rely on them.', '',
      '## Archived page excerpts',
      'Exact extracted page text follows; OCR/extraction artifacts may be present. Page numbers refer to database page positions. The JSON export includes all query hits; the SQLite review export contains these eight selected pages plus provenance.', '']
    for row in selected:
        lines += [f"### {row['case']} — document {row['doc_id']}, page {row['page']}",
                  f"[Archived source URL]({row['url']}) · Indexed packet date: {row['indexed_meeting_date']}",
                  '```text', row['text'].strip(), '```', '']
    (OUT / 'drive_database_review.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'databases': len(inventory), 'coverage': coverage,
                      'hits': {k: len(v) for k,v in hits.items()}, 'selected_pages': len(selected),
                      'integrity': {r['file']: r['quick_check'] for r in inventory}}, indent=2))


if __name__ == '__main__':
    main()
