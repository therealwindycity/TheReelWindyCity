#!/usr/bin/env python3
"""Search the committed compressed corpus without trusting its document associations."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TERMS = ['advanced detailed design', 'at my disposal', '1,000,0000', 'duval',
         'stormwater runoff management', '5.65', '5,650,000']


def main():
    source = ROOT / 'drive-import/master_meetings_database_linked.json.gz'
    raw = gzip.decompress(source.read_bytes())
    records = json.loads(raw)
    matches = []
    for record in records:
        for turn_index, turn in enumerate(record.get('turns', [])):
            text = turn.get('text', '')
            lower = text.lower()
            for term in TERMS:
                start = 0
                while (position := lower.find(term, start)) >= 0:
                    matches.append({'term': term, 'record_id': record['id'],
                                    'title': record.get('title'), 'stored_date': record.get('date'),
                                    'filename': record.get('filename'), 'turn_index': turn_index,
                                    'speaker_label_unverified': turn.get('speaker'),
                                    'character_offset': position,
                                    'excerpt': text[max(0, position-400):position+len(term)+650]})
                    start = position + len(term)
    out = ROOT / 'arena_workspace/exports'
    out.mkdir(parents=True, exist_ok=True)
    report = {'source': str(source.relative_to(ROOT)), 'raw_bytes': len(raw),
              'raw_sha256': hashlib.sha256(raw).hexdigest(), 'records_searched': len(records),
              'warning': 'Not byte-identical to the larger Drive copy. Dates, speakers and associated documents are not authenticated. Attached document arrays include cross-year associations; do not use them as verified citations.',
              'terms': TERMS, 'matches': matches}
    (out/'linked_corpus_search.json').write_text(json.dumps(report,indent=2)+'\n')
    lines = ['# Linked corpus search', '', report['warning'], '',
             f'Searched {len(records)} records; found {len(matches)} phrase occurrences. Repeated quotations are not independent corroboration.', '']
    for m in matches:
        lines += [f"## {m['title']} — {m['record_id']} / turn {m['turn_index']} / offset {m['character_offset']}",
                  f"Term: {m['term']} | Stored date: {m['stored_date']} | Speaker label (unverified): {m['speaker_label_unverified']}",
                  '```text',m['excerpt'],'```','']
    (out/'linked_corpus_search.md').write_text('\n'.join(lines))
    print(json.dumps({'records_searched':len(records),'matches':len(matches),'raw_sha256':report['raw_sha256']}))


if __name__ == '__main__':
    main()
