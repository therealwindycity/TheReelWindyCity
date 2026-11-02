import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import remaining_target_evidence as targets
from fleet_case_evidence import safe_url, packets, assemble


class TargetEvidenceTests(unittest.TestCase):
    def test_nine_unique_fixed_public_sources(self):
        sources=[s for group in targets.CASES.values() for s in group]
        self.assertEqual(len(sources),9)
        self.assertEqual(len({s['id'] for s in sources}),9)
        for s in sources:
            safe_url(s['url'])
            self.assertTrue(all(1 <= p <= 20 for p in s['review_pages']))

    def test_new_source_is_not_misrepresented_as_archive_match(self):
        def captured(s, out):return {**s,'status':'captured-needs-review','matches_archived_sha1':bool(s['archived_sha1']), 'pages':[]}
        with tempfile.TemporaryDirectory() as out, patch.object(targets,'capture',side_effect=captured):
            report=targets.collect('stormwater',Path(out))
        new=next(s for s in report['sources'] if s['id']=='october_policy')
        self.assertFalse(new['archive_baseline_available'])
        self.assertIsNone(new['matches_archived_sha1'])
        self.assertTrue(targets.complete(report))

    def test_missing_and_mismatched_sources_fail_completion(self):
        with tempfile.TemporaryDirectory() as out, patch.object(targets,'capture',side_effect=lambda s,o:{**s,'status':'failed'}):
            failed=targets.collect('debt',Path(out))
        self.assertFalse(targets.complete(failed))
        report={'sources':[{'status':'captured-needs-review','archive_baseline_available':True,'matches_archived_sha1':False}]}
        self.assertFalse(targets.complete(report))
        self.assertFalse(targets.complete({'sources':[]}))

    def test_evidence_payload_keeps_case_and_baseline_semantics(self):
        report={'case':'debt','sources':[{'review_pages':[1],'pages':[{'page':1,'text':'$1,000,0000.00'}],
                    'archive_baseline_available':False,'matches_archived_sha1':None}]}
        self.assertEqual(assemble(packets(report)),report)
        self.assertEqual(report['sources'][0]['pages'][0]['text'],'$1,000,0000.00')

    def test_stale_capture_deleted_even_when_new_fetch_fails(self):
        with tempfile.TemporaryDirectory() as out:
            path=Path(out)/'loan_proposal.pdf';path.write_bytes(b'stale')
            with patch.object(targets,'capture',side_effect=lambda s,o:{**s,'status':'failed'}):
                targets.collect('debt',Path(out))
            self.assertFalse(path.exists())


if __name__ == '__main__':unittest.main()
