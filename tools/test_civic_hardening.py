"""Offline adversarial regression tests. No municipal or video network calls."""
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import civic_engine as engine
import civic_run_status as completion
import inspect_civic_sources as inspection
import official_civic_montage as official


class HardeningTests(unittest.TestCase):
    def setUp(self):
        self.targets = json.loads(engine.TARGETS.read_text())
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'exports').mkdir()
        (self.root / 'sources').mkdir()

    def database(self, targets=None):
        return engine.init_db(self.root / 'cheyenne_records.sqlite3', targets or self.targets[:1])

    def put_run(self, run_id='test-run'):
        (self.root / 'exports/run_report.json').write_text(json.dumps({'run_id': run_id}))

    def source_row(self, data=b'%PDF-test', kind='minutes', expected_sha=None, case=None):
        item = case or self.targets[0]
        path = self.root / 'sources' / f"{item['id']}-{kind}.bin"
        path.write_bytes(data)
        return {'case_id': item['id'], 'kind': kind, 'url': item[kind + '_url'],
                'status': 'retrieved-not-content-verified', 'local_path': str(path),
                'sha256': expected_sha or hashlib.sha256(data).hexdigest(), 'meeting_date': item['date']}

    def reader(self, text, encrypted=False, count=1):
        return SimpleNamespace(is_encrypted=encrypted, pages=[SimpleNamespace(extract_text=lambda: text)] * count)

    def valid_completion_fixture(self):
        db = self.database()
        item = self.targets[0]
        sources, checked = [], []
        for kind in ('primary', 'minutes'):
            row = self.source_row(kind=kind)
            db.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)',
                       (row['case_id'], kind, row['url'], row['status'], 'now', row['sha256'], row['local_path'], None))
            sources.append({k: row[k] for k in ('case_id', 'kind', 'url', 'status', 'sha256', 'local_path')})
            textfile = self.root / 'exports' / f"{item['id']}-{kind}-extracted.txt"
            textfile.write_text('Archived text')
            checked.append({**sources[-1], 'inspection_status': 'inspected', 'issues': [],
                            'extracted_text_sha256': hashlib.sha256(textfile.read_bytes()).hexdigest()})
        db.commit()
        db.close()
        run = {'run_id': 'same', 'sources': sources}
        inspect = {'run_id': 'same', 'sources': checked}
        (self.root / 'exports/run_report.json').write_text(json.dumps(run))
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps(inspect))
        return run, inspect

    def test_all_original_targets_validate(self):
        engine.validate_targets(self.targets)

    def test_target_validation_rejects_traversal_and_duplicates(self):
        for identity in ('../outside', 'a/b', '', 'a' * 97):
            values = copy.deepcopy(self.targets)
            values[0]['id'] = identity
            with self.assertRaises(ValueError):
                engine.validate_targets(values)
        with self.assertRaises(ValueError):
            engine.validate_targets([self.targets[0], self.targets[0]])

    def test_target_validation_rejects_invalid_types_and_durations(self):
        for value in ([], {}, None):
            with self.assertRaises(ValueError):
                engine.validate_targets(value)
        for duration in (True, False, 0, -2, 301, 3.5, '45', None):
            item = {**self.targets[0], 'duration': duration}
            with self.assertRaises(ValueError):
                engine.validate_targets([item])

    def test_target_urls_cannot_point_to_other_hosts_or_credentials(self):
        for url in ('http://cheyenne.granicus.com/x', 'https://127.0.0.1/x',
                    'https://user:pass@cheyenne.granicus.com/x', 'https://cheyenne.granicus.com:8080/x'):
            with self.assertRaises(ValueError):
                engine.validate_targets([{**self.targets[0], 'primary_url': url}])

    def test_timestamp_ascii_and_width_constraints(self):
        for value in ('٠٤:14:50', '4:14:50', '04:1:50', '04:14:5', None, True):
            with self.assertRaises(ValueError):
                engine.seconds(value)

    def test_case_upsert_preserves_source_and_vote_foreign_keys(self):
        db = self.database()
        item = self.targets[0]
        db.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)', (item['id'], 'primary', item['primary_url'], 'old', None, None, None, None))
        db.execute('INSERT INTO votes VALUES (?,?,?,?,?,?)', (item['id'], 'Reviewed member', 'YES', item['primary_url'], 'page 1', 'human-reviewed'))
        db.commit()
        db.close()
        db = self.database()
        self.assertEqual(db.execute('SELECT count(*) FROM sources').fetchone()[0], 1)
        self.assertEqual(db.execute('SELECT count(*) FROM votes').fetchone()[0], 1)
        self.assertIsNone(db.execute('PRAGMA foreign_key_check').fetchone())
        db.close()

    def test_failed_retrieval_removes_stale_bytes_and_digest(self):
        row = self.source_row(kind='primary')
        db = self.database()
        with patch.object(engine, 'urlopen', side_effect=OSError('failed')):
            result = engine.retrieve(db, self.targets[0], 'primary', self.root / 'sources', False)
        self.assertIsNone(result['sha256'])
        self.assertFalse(Path(row['local_path']).exists())
        self.assertEqual(db.execute('SELECT local_path,sha256 FROM sources').fetchone(), (None, None))
        db.close()

    def test_successful_retrieval_atomic_digest(self):
        db = self.database()
        with patch.object(engine, 'urlopen', return_value=io.BytesIO(b'%PDF-bytes')):
            result = engine.retrieve(db, self.targets[0], 'primary', self.root / 'sources', False)
        self.assertEqual(result['sha256'], hashlib.sha256(b'%PDF-bytes').hexdigest())
        self.assertFalse(list((self.root / 'sources').glob('*.part')))
        db.close()

    def test_empty_response_is_failure(self):
        db = self.database()
        with patch.object(engine, 'urlopen', return_value=io.BytesIO(b'')):
            result = engine.retrieve(db, self.targets[0], 'primary', self.root / 'sources', False)
        self.assertEqual(result['status'], 'retrieval-failed')
        db.close()

    def test_workspace_lock_excludes_writers_and_cleans_on_exception(self):
        with self.assertRaises(RuntimeError):
            with engine.workspace_lock(self.root):
                with self.assertRaises(FileExistsError):
                    with engine.workspace_lock(self.root):
                        self.fail('Overlapping writer acquired lock')
                raise RuntimeError('crash')
        self.assertFalse((self.root / '.civic-engine.lock').exists())

    def test_probe_rejects_zero_nan_infinite_and_missing_duration(self):
        for value in ('0', '-1', 'nan', 'inf', None):
            metadata = {'streams': [{'codec_type': 'video'}], 'format': {} if value is None else {'duration': value}}
            with patch.object(engine.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(metadata))):
                with self.assertRaises(ValueError):
                    engine.probe(self.root / 'x.mp4')

    def test_date_and_role_classification(self):
        self.assertEqual(inspection.date_and_role('RECORD OF PROCEEDINGS\nJuly 14, 2025'), ('2025-07-14', 'minutes'))
        self.assertEqual(inspection.date_and_role('MEMORANDUM DATE: May 6, 2026'), ('2026-05-06', 'memo'))
        self.assertEqual(inspection.date_and_role('RECORD OF PROCEEDINGS February 31, 2026'), (None, 'minutes'))

    def test_source_hash_mismatch_prevents_pdf_parsing(self):
        row = self.source_row(expected_sha='wrong')
        with patch.object(inspection, 'PdfReader') as parser:
            result = inspection.inspect_one(row, self.root)
        parser.assert_not_called()
        self.assertEqual(result['inspection_status'], 'inspection-failed')

    def test_source_path_cannot_escape_sources_directory(self):
        row = self.source_row()
        row['local_path'] = str(self.root / 'exports/run_report.json')
        self.assertEqual(inspection.inspect_one(row, self.root)['inspection_status'], 'inspection-failed')

    def test_non_pdf_not_treated_as_retrieved_evidence(self):
        row = self.source_row(b'<html>Access denied</html>')
        self.assertEqual(inspection.inspect_one(row, self.root)['inspection_status'], 'unexpected-response')

    def test_pdf_wrong_date_flagged(self):
        row = self.source_row()
        with patch.object(inspection, 'PdfReader', return_value=self.reader('RECORD OF PROCEEDINGS July 14, 2025')):
            result = inspection.inspect_one(row, self.root)
        self.assertIn('proceedings-date-does-not-match-supplied-case-date', result['issues'])

    def test_memo_not_accepted_as_minutes(self):
        row = self.source_row()
        with patch.object(inspection, 'PdfReader', return_value=self.reader('MEMORANDUM May 6, 2026 Fremont')):
            result = inspection.inspect_one(row, self.root)
        self.assertIn('supplied-minutes-link-is-not-minutes', result['issues'])

    def test_empty_pdf_needs_ocr_and_removes_old_extracted_file(self):
        row = self.source_row()
        old = self.root / 'exports' / f"{row['case_id']}-minutes-extracted.txt"
        old.write_text('stale')
        with patch.object(inspection, 'PdfReader', return_value=self.reader('')):
            result = inspection.inspect_one(row, self.root)
        self.assertEqual(result['inspection_status'], 'needs-ocr')
        self.assertFalse(old.exists())

    def test_encrypted_and_excessive_page_pdfs_fail_closed(self):
        row = self.source_row()
        for reader in (self.reader('x', encrypted=True), self.reader('x', count=301)):
            with patch.object(inspection, 'PdfReader', return_value=reader):
                self.assertEqual(inspection.inspect_one(row, self.root)['inspection_status'], 'inspection-failed')

    def test_corrupt_pdf_error_does_not_escape_inspection(self):
        with contextlib.redirect_stderr(io.StringIO()):
            result = inspection.inspect_one(self.source_row(), self.root)
        self.assertEqual(result['inspection_status'], 'inspection-failed')

    def test_annotation_is_valid_json_within_size_bound(self):
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            inspection.notice('test', {'case_id': 'case', 'text': '☃' * 5000})
        payload = stream.getvalue().split('::', 2)[2].strip()
        self.assertLess(len(payload.encode()), 4096)
        self.assertTrue(json.loads(payload)['annotation_abbreviated'])

    def test_only_official_public_media_host_accepted(self):
        self.assertTrue(inspection.trusted_media_url('https://archive-stream.granicus.com/video/playlist.m3u8'))
        for url in ('https://evil.example/x.mp4', 'file:///etc/passwd', 'http://archive-stream.granicus.com/x.mp4',
                    'https://user@archive-stream.granicus.com/x.mp4', 'https://archive-stream.granicus.com:9000/x.mp4',
                    'https://archive-stream.granicus.com.evil.example/x.mp4'):
            self.assertFalse(inspection.trusted_media_url(url))

    def test_named_votes_require_explicit_context_date_and_role(self):
        text = 'Stormwater Runoff Management System Account. Motion failed. Voting “no” – all members of the governing body with the exception of Dr. Aldrich and Mr. White voting “yes”.'
        row = {'inspection_status': 'inspected', 'document_role': 'minutes', 'document_date': '2026-10-26',
               'case_id': self.targets[3]['id'], 'url': self.targets[3]['primary_url'], 'sha256': 'digest'}
        votes = inspection.extract_named_votes([text], row)
        self.assertEqual([(r['member'], r['vote']) for r in votes], [('Dr. Aldrich', 'YES'), ('Mr. White', 'YES')])
        self.assertEqual(inspection.extract_named_votes([text.replace('Stormwater', 'Unrelated')], row), [])
        self.assertEqual(inspection.extract_named_votes([text], {**row, 'document_date': '2025-10-26'}), [])
        self.assertEqual(inspection.extract_named_votes([text.replace('Motion failed.', 'Motion passed.')], row), [])

    def test_completion_accepts_consistent_document_stage_not_publication(self):
        self.valid_completion_fixture()
        result = completion.inspect_completion(self.root)
        self.assertTrue(result['execution_gate_passed'])
        self.assertTrue(result['documents_complete'])
        self.assertFalse(result['objective_complete'])
        self.assertFalse(result['publication_ready'])

    def test_completion_rejects_missing_report_and_mixed_run_ids(self):
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])
        run, checked = self.valid_completion_fixture()
        checked['run_id'] = 'other'
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps(checked))
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])

    def test_completion_rejects_changed_source_and_changed_extracted_text(self):
        run, checked = self.valid_completion_fixture()
        Path(run['sources'][0]['local_path']).write_bytes(b'tampered')
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])
        self.valid_completion_fixture_after_reset()
        textfile = next((self.root / 'exports').glob('*-extracted.txt'))
        textfile.write_text('changed')
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])

    def valid_completion_fixture_after_reset(self):
        (self.root / 'cheyenne_records.sqlite3').unlink()
        return self.valid_completion_fixture()

    def test_completion_rejects_duplicate_or_missing_sources(self):
        run, checked = self.valid_completion_fixture()
        checked['sources'].append(checked['sources'][0])
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps(checked))
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])

    def test_completion_rejects_ledger_report_disagreement(self):
        self.valid_completion_fixture()
        with sqlite3.connect(self.root / 'cheyenne_records.sqlite3') as db:
            db.execute("UPDATE sources SET sha256='different'")
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])

    def test_completion_rejects_association_issue_and_missing_required_media(self):
        run, checked = self.valid_completion_fixture()
        checked['sources'][0]['issues'] = ['wrong-date']
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps(checked))
        result = completion.inspect_completion(self.root, require_media=True)
        self.assertTrue(result['documents_complete'])
        self.assertFalse(result['source_associations_valid'])
        self.assertFalse(result['execution_gate_passed'])
        self.assertFalse(result['media_complete'])

    def test_official_missing_input_clears_stale_final_and_writes_failure(self):
        output = self.root / 'exports/official_archive_cue_montage.mp4'
        output.write_bytes(b'old')
        report = official.render_montage(self.root)
        self.assertFalse(output.exists())
        self.assertFalse(report['complete_montage'])
        self.assertTrue((self.root / 'exports/official_media_report.json').exists())

    def test_official_missing_media_produces_four_failures_without_network(self):
        self.put_run('same')
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps({'run_id': 'same', 'media': []}))
        with patch.object(engine, 'run') as runner, contextlib.redirect_stdout(io.StringIO()):
            report = official.render_montage(self.root)
        runner.assert_not_called()
        self.assertEqual(len(report['clips']), 4)
        self.assertTrue(all(r['status'] == 'failed' for r in report['clips']))

    def test_official_stale_discovery_rejected(self):
        self.put_run('new')
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps({'run_id': 'old', 'media': []}))
        report = official.render_montage(self.root)
        self.assertIn('different runs', report['error'])


    def official_fixture(self, hostname='archive-stream.granicus.com'):
        self.put_run('same')
        media = [{'clip_id': t['granicus_clip_id'],
                  'official_media_candidates': [f"https://{hostname}/video/{t['granicus_clip_id']}.m3u8"]}
                 for t in self.targets]
        (self.root / 'exports/source_content_inspection.json').write_text(json.dumps({'run_id': 'same', 'media': media}))

    def fake_ffmpeg(self, command, cwd=None):
        if command[-1] != '-':
            Path(command[-1]).write_bytes(b'fixture-media-not-real-footage')

    def fake_probe(self, path):
        duration = 180 if path.name == 'official_archive_cue_montage.mp4' else self.targets[int(path.stem.split('_')[1])-1]['duration']
        return {'format': {'duration': str(duration)}, 'streams': [{'codec_type': 'video'}, {'codec_type': 'audio'}]}

    def test_official_all_segments_normalized_concat_and_full_decode_invoked(self):
        self.official_fixture()
        with patch.object(engine, 'run', side_effect=self.fake_ffmpeg) as runner, patch.object(engine, 'probe', side_effect=self.fake_probe), contextlib.redirect_stdout(io.StringIO()):
            report = official.render_montage(self.root)
        self.assertTrue(report['complete_montage'])
        self.assertEqual(runner.call_count, 6)  # four renders, concat, complete decode
        self.assertEqual(report['run_id'], 'same')
        self.assertEqual(sum(r['duration'] for r in report['clips']), 180)

    def test_official_concat_failure_clears_final_and_preserves_failure_report(self):
        self.official_fixture()
        def fail_concat(command, cwd=None):
            self.fake_ffmpeg(command, cwd)
            if 'concat' in command:
                raise RuntimeError('concat failed')
        with patch.object(engine, 'run', side_effect=fail_concat), patch.object(engine, 'probe', side_effect=self.fake_probe), contextlib.redirect_stdout(io.StringIO()):
            report = official.render_montage(self.root)
        self.assertFalse(report['complete_montage'])
        self.assertFalse((self.root / 'exports/official_archive_cue_montage.mp4').exists())
        self.assertIn('concat failed', report['error'])
        self.assertEqual(len(report['clips']), 4)

    def test_official_short_clips_are_not_stitched(self):
        self.official_fixture()
        metadata = {'format': {'duration': '1'}, 'streams': [{'codec_type': 'video'}, {'codec_type': 'audio'}]}
        with patch.object(engine, 'run', side_effect=self.fake_ffmpeg) as runner, patch.object(engine, 'probe', return_value=metadata), contextlib.redirect_stdout(io.StringIO()):
            report = official.render_montage(self.root)
        self.assertFalse(report['complete_montage'])
        self.assertEqual(runner.call_count, 4)
        self.assertFalse(list((self.root / 'video_clips').glob('official_*.mp4')))

    def test_official_untrusted_candidates_never_reach_ffmpeg(self):
        self.official_fixture('evil.example')
        with patch.object(engine, 'run') as runner, contextlib.redirect_stdout(io.StringIO()):
            report = official.render_montage(self.root)
        runner.assert_not_called()
        self.assertTrue(all(r['status'] == 'failed' for r in report['clips']))

    def test_lock_does_not_delete_replaced_owner_token(self):
        with engine.workspace_lock(self.root):
            (self.root / '.civic-engine.lock').write_text(json.dumps({'token': 'different-owner'}))
        self.assertTrue((self.root / '.civic-engine.lock').exists())

    def test_iso_date_width_is_enforced(self):
        with self.assertRaises(ValueError):
            engine.validate_targets([{**self.targets[0], 'date': '2026-6-2'}])


    def test_complete_inspection_isolates_corrupt_source_and_preserves_votes_on_rerun(self):
        item = self.targets[3]
        db = self.database([item])
        for kind in ('primary', 'minutes'):
            row = self.source_row(kind=kind, case=item)
            db.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)',
                       (row['case_id'], kind, row['url'], row['status'], 'now', row['sha256'], row['local_path'], None))
        db.commit()
        db.close()
        self.put_run('same')
        text = ('RECORD OF PROCEEDINGS October 26, 2026. Stormwater Runoff Management System Account. '
                'Motion failed. Voting “no” – all members of the governing body with the exception of '
                'Dr. Aldrich and Mr. White voting “yes”.')
        def reader(path):
            if '-minutes.' in str(path):
                raise ValueError('damaged PDF')
            return self.reader(text)
        for _ in range(2):
            with patch.object(inspection, 'PdfReader', side_effect=reader), patch.object(inspection, 'urlopen') as network, contextlib.redirect_stdout(io.StringIO()):
                report = inspection.inspect_workspace(self.root, skip_discovery=True)
            network.assert_not_called()
            self.assertEqual(sorted(r['inspection_status'] for r in report['sources']), ['inspected', 'inspection-failed'])
            with sqlite3.connect(self.root / 'cheyenne_records.sqlite3') as db:
                self.assertEqual(db.execute('SELECT count(*) FROM votes').fetchone()[0], 2)
                self.assertIsNone(db.execute('PRAGMA foreign_key_check').fetchone())
        # Retrying retrieval must update, not delete/reinsert the source parent.
        db = self.database([item])
        with patch.object(engine, 'urlopen', return_value=io.BytesIO(b'%PDF-new')):
            result = engine.retrieve(db, item, 'primary', self.root / 'sources', False)
        self.assertEqual(result['status'], 'retrieved-not-content-verified')
        self.assertEqual(db.execute('SELECT count(*) FROM source_inspections').fetchone()[0], 2)
        db.close()


    def test_engine_cli_restricted_rerun_and_atomic_reports(self):
        args = ['civic_engine.py', '--workspace', str(self.root), '--restricted-network', '--skip-video']
        for _ in range(2):
            with patch('sys.argv', args), patch.object(engine, 'urlopen') as network, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(engine.main(), 2)
            network.assert_not_called()
            result = json.loads((self.root / 'exports/run_report.json').read_text())
            self.assertEqual(len(result['sources']), 8)
            self.assertEqual(result['video']['status'], 'not-attempted')
            self.assertFalse((self.root / '.civic-engine.lock').exists())
            with patch('sys.argv', ['inspect', '--workspace', str(self.root), '--skip-discovery']), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(inspection.main(), 2)
            with patch('sys.argv', ['gate', '--workspace', str(self.root)]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(completion.main(), 2)
            self.assertTrue((self.root / 'exports/completion_manifest.json').exists())

    def test_engine_cli_successful_retrieval_does_not_claim_editorial_completion(self):
        args = ['civic_engine.py', '--workspace', str(self.root), '--skip-video']
        with patch('sys.argv', args), patch.object(engine, 'urlopen', side_effect=lambda *a, **kw: io.BytesIO(b'%PDF-fixture')), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(engine.main(), 0)
        result = json.loads((self.root / 'exports/run_report.json').read_text())
        self.assertEqual(result['claims_verified'], 0)
        self.assertEqual(result['video']['status'], 'not-attempted')

    def test_completion_cli_writes_verifiable_manifest(self):
        self.valid_completion_fixture()
        with patch('sys.argv', ['gate', '--workspace', str(self.root)]), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(completion.main(), 0)
        manifest = json.loads((self.root / 'exports/completion_manifest.json').read_text())
        for name, digest in manifest.items():
            self.assertEqual(hashlib.sha256((self.root / name).read_bytes()).hexdigest(), digest)

    def test_media_discovery_filters_untrusted_links_without_truncated_json(self):
        data = b'<title>Meeting</title><source src="https://archive-stream.granicus.com/public/playlist.m3u8"><source src="https://evil.example/a.mp4">'
        with patch.object(inspection, 'urlopen', side_effect=lambda *a, **kw: io.BytesIO(data)):
            media = inspection.discover_media()
        self.assertEqual(len(media), 4)
        self.assertTrue(all(r['official_media_candidates'] == ['https://archive-stream.granicus.com/public/playlist.m3u8'] for r in media))

    def test_media_discovery_network_failures_are_per_clip(self):
        with patch.object(inspection, 'urlopen', side_effect=OSError('offline')):
            media = inspection.discover_media()
        self.assertEqual(len(media), 4)
        self.assertTrue(all(r['error'] == 'offline' for r in media))

    def test_completion_rejects_old_media_run_even_without_required_video(self):
        self.valid_completion_fixture()
        (self.root / 'exports/official_media_report.json').write_text(json.dumps({'run_id': 'old', 'clips': []}))
        self.assertFalse(completion.inspect_completion(self.root)['execution_gate_passed'])

    def test_official_cli_returns_failure_when_no_inputs(self):
        with patch('sys.argv', ['official', '--workspace', str(self.root)]):
            self.assertEqual(official.main(), 2)


    def fake_core_command(self, command, cwd=None):
        if command[0] == 'yt-dlp':
            Path(command[command.index('-o')+1]).write_bytes(b'fixture-download')
        elif command[-1] != '-':
            Path(command[-1]).write_bytes(b'fixture-render')

    def fake_core_probe(self, path):
        duration = 180 if path.name == 'cheyenne_corruption_montage.mp4' else self.targets[int(path.stem.split('_')[-1])-1]['duration']
        return {'format': {'duration': str(duration)}, 'streams': [{'codec_type': 'video'}, {'codec_type': 'audio'}]}

    def test_core_montage_success_checks_every_clip_and_full_decode(self):
        with patch.object(engine.shutil, 'which', return_value='/bin/mock'), patch.object(engine, 'run', side_effect=self.fake_core_command) as runner, patch.object(engine, 'probe', side_effect=self.fake_core_probe):
            result = engine.montage(self.targets, self.root, False)
        self.assertEqual(result['status'], 'rendered-unverified-research-cues')
        self.assertEqual(runner.call_count, 10)  # four downloads, four normalizations, concat and decode
        self.assertTrue(Path(result['output']).exists())

    def test_core_missing_audio_and_short_clip_never_make_final(self):
        for streams, duration in (([{'codec_type': 'video'}], '45'), ([{'codec_type': 'video'}, {'codec_type': 'audio'}], '1')):
            with patch.object(engine.shutil, 'which', return_value='/bin/mock'), patch.object(engine, 'run', side_effect=self.fake_core_command), patch.object(engine, 'probe', return_value={'streams': streams, 'format': {'duration': duration}}):
                result = engine.montage(self.targets, self.root, False)
            self.assertEqual(result['status'], 'incomplete-no-montage')
            self.assertEqual(len(result['failures']), 4)
            self.assertIsNone(result['output'])

    def test_core_concat_failure_removes_partial_output(self):
        def fail_concat(command, cwd=None):
            self.fake_core_command(command, cwd)
            if 'concat' in command:
                raise RuntimeError('concat failed')
        with patch.object(engine.shutil, 'which', return_value='/bin/mock'), patch.object(engine, 'run', side_effect=fail_concat), patch.object(engine, 'probe', side_effect=self.fake_core_probe):
            result = engine.montage(self.targets, self.root, False)
        self.assertEqual(result['status'], 'render-failed')
        self.assertFalse((self.root / 'exports/cheyenne_corruption_montage.mp4').exists())


if __name__ == '__main__':
    unittest.main()
