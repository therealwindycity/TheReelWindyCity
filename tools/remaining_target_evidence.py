#!/usr/bin/env python3
"""Capture the three remaining civic targets with explicit baseline availability."""
import argparse
import json
from pathlib import Path
from fleet_case_evidence import capture, packets

BASE = 'https://cheyenne.granicus.com/'
CASES = {
    'debt': [
        {'id': 'loan_proposal', 'url': BASE+'MetaViewer.php?view_id=5&clip_id=1099&meta_id=148538',
         'archived_sha1': '28ddc24603f99432ba2f10e2400d71d6a8786e14', 'review_pages': [1, 2]},
        {'id': 'loan_adoption', 'url': BASE+'DocumentViewer.php?file=cheyenne_964bdd5707a3db4918c35f6e987ac155.pdf&view=1',
         'archived_sha1': 'a464233dba8bc185a8e184ec4525c6fc1fe2972a', 'review_pages': [1, 4]},
    ],
    'highlands': [
        {'id': 'highlands_adoption', 'url': BASE+'MinutesViewer.php?view_id=2&clip_id=1120',
         'archived_sha1': '4f0be028b06aa2c60c01c52860e68bf93df62bed', 'review_pages': [1, 2, 3, 4]},
        {'id': 'highlands_staff', 'url': BASE+'MetaViewer.php?view_id=5&clip_id=1120&meta_id=149235',
         'archived_sha1': '1f330b4d729ad04c1881ea6a24a70accd89ada59', 'review_pages': [7, 9, 10]},
        {'id': 'planning_override', 'url': BASE+'MetaViewer.php?view_id=5&clip_id=1120&meta_id=149247',
         'archived_sha1': '9f7e8c683108d002983ee08207f49a332ca55477', 'review_pages': [1]},
    ],
    'stormwater': [
        {'id': 'reed_commitment', 'url': BASE+'MetaViewer.php?view_id=5&clip_id=1093&meta_id=147338',
         'archived_sha1': 'aeda0f5af2d259c6b71188dd44c5111f808d6ec6', 'review_pages': [1, 2]},
        {'id': 'reed_adoption', 'url': BASE+'MetaViewer.php?view_id=5&clip_id=1095&meta_id=147723',
         'archived_sha1': 'afb1938007694cc05a012edf95e9dddc4de205e6', 'review_pages': [1, 2, 5]},
        {'id': 'october_policy', 'url': BASE+'DocumentViewer.php?file=cheyenne_740ab3049f2e7e143ca88004317ff695.pdf&view=1',
         'archived_sha1': None, 'review_pages': [1, 3]},
        {'id': 'march_comparator', 'url': BASE+'DocumentViewer.php?file=cheyenne_2a5c2428a6390c52750d45788dfeb157.pdf&view=1',
         'archived_sha1': 'fd2bd5cb58c3d9d173e022f359fe6cdf672ad70c', 'review_pages': [1, 2]},
    ],
}


def collect(case, out):
    out.mkdir(parents=True, exist_ok=True)
    sources = []
    for specification in CASES[case]:
        (out/(specification['id']+'.pdf')).unlink(missing_ok=True)
        record = capture(specification, out)
        available = specification['archived_sha1'] is not None
        record['archive_baseline_available'] = available
        if not available:
            record['matches_archived_sha1'] = None
        sources.append(record)
    return {'schema_version': 1, 'case': case,
            'interpretation': 'Written-record capture only; no automatic financial, legal or engineering finding.',
            'sources': sources}


def complete(report):
    return all(s['status']=='captured-needs-review' and
               (not s['archive_baseline_available'] or s['matches_archived_sha1'] is True)
               for s in report['sources']) and bool(report['sources'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=sorted(CASES), required=True)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    out = args.out or Path('arena_workspace/other-targets')/args.case
    report = collect(args.case, out)
    (out/'source_captures.json').write_text(json.dumps(report, indent=2)+'\n')
    for packet in packets(report):
        message = json.dumps(packet, ensure_ascii=True)
        if len(message.encode()) > 3400:
            raise ValueError('Evidence notice exceeds bound')
        print('::notice title=OTHER_TARGET_EVIDENCE::'+message.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
    return 0 if complete(report) else 2


if __name__ == '__main__':
    raise SystemExit(main())
