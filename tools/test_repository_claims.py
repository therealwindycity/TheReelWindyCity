import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import audit_repository_claims as audit


class RepositoryClaimsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'root'
        self.cache = Path(self.temp.name) / 'cache'
        self.root.mkdir()
        self.cache.mkdir()

    def entry(self, path, data, **extra):
        return {'path': path, 'type': 'blob', 'mode': '100644',
                'sha': audit.git_blob_sha(data), 'size': len(data), **extra}

    def payload(self, data):
        return SimpleNamespace(stdout=json.dumps({'encoding': 'base64', 'size': len(data),
                                                  'content': base64.b64encode(data).decode()}))

    def test_git_blob_hash_uses_object_header(self):
        self.assertEqual(audit.git_blob_sha(b''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
        self.assertNotEqual(audit.git_blob_sha(b'abc'), __import__('hashlib').sha1(b'abc').hexdigest())

    def test_paths_reject_traversal_and_platform_escapes(self):
        for path in ('../x.py', '/tmp/x.py', 'a/../../x.py', 'a\\x.py', 'x\0.py'):
            with self.assertRaises(ValueError):
                audit.safe_relative(path)

    def test_selection_is_explicit(self):
        self.assertTrue(audit.selected(self.entry('tools/a.py', b'')))
        self.assertTrue(audit.selected(self.entry('data/items.json', b'')))
        self.assertFalse(audit.selected(self.entry('scanner-results/items.json', b'')))
        self.assertFalse(audit.selected(self.entry('video.mp4', b'')))
        self.assertFalse(audit.selected(self.entry('tools/a.py', b'', mode='120000')))
        self.assertFalse(audit.selected({'path': 'tools', 'type': 'tree'}))

    def test_json_profile_handles_arrays_and_nested_containers(self):
        profile = audit.profile_json([{'action_items': [{'reserve_drawdown': False}]}, {'transcript_linked': True}])
        self.assertEqual(profile['root_type'], 'list')
        self.assertEqual(profile['target_key_occurrences'], {'action_items': 1, 'reserve_drawdown': 1, 'transcript_linked': 1})
        self.assertEqual(profile['root_keys'], [])

    def test_key_counts_are_not_semantic_findings(self):
        profile = audit.profile_json({'vocabulary': {'amount': 1, 'vendor': 2}})
        self.assertEqual(profile['target_key_occurrences'], {'amount': 1, 'vendor': 1})
        self.assertNotIn('risk', profile)
        self.assertNotIn('misconduct', profile)

    def test_scalar_json_does_not_raise_get_error(self):
        self.assertEqual(audit.profile_json('not a meeting')['root_type'], 'str')
        self.assertEqual(audit.profile_json(None)['target_key_occurrences'], {})

    def test_marker_offsets_point_to_actual_phrase_in_long_lines(self):
        text = 'prefix\n' + 'x' * 800 + 'Ghost Quorum' + 'x' * 800
        result = audit.marker_hits(text)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['line'], 2)
        self.assertEqual(result[0]['column'], 801)
        self.assertEqual(text[result[0]['character_offset']:][:12], 'Ghost Quorum')
        self.assertIn('Ghost Quorum', result[0]['excerpt'])
        self.assertLess(len(result[0]['excerpt']), 400)

    def test_matching_local_blob_needs_no_network(self):
        data = b'print("hello")\n'
        (self.root / 'a.py').write_bytes(data)
        with patch.object(audit.subprocess, 'run') as network:
            actual, origin = audit.fetch_verified(self.entry('a.py', data), self.root, self.cache)
        network.assert_not_called()
        self.assertEqual(actual, data)
        self.assertEqual(origin, 'matching-local-Git-blob')

    def test_modified_local_blob_is_not_used_as_upstream(self):
        data = b'original'
        (self.root / 'a.py').write_bytes(b'changed locally')
        with patch.object(audit.subprocess, 'run', return_value=self.payload(data)):
            actual, origin = audit.fetch_verified(self.entry('a.py', data), self.root, self.cache)
        self.assertEqual(actual, data)
        self.assertEqual(origin, 'GitHub-blob-API')
        self.assertEqual((self.root / 'a.py').read_bytes(), b'changed locally')

    def test_verified_cache_is_used_without_network(self):
        data = b'cached'
        entry = self.entry('a.py', data)
        (self.cache / entry['sha']).write_bytes(data)
        with patch.object(audit.subprocess, 'run') as network:
            actual, origin = audit.fetch_verified(entry, self.root, self.cache)
        network.assert_not_called()
        self.assertEqual(actual, data)
        self.assertEqual(origin, 'verified-cache')

    def test_corrupt_cache_is_rejected(self):
        entry = self.entry('a.py', b'original')
        (self.cache / entry['sha']).write_bytes(b'corrupt')
        with self.assertRaises(ValueError):
            audit.fetch_verified(entry, self.root, self.cache)

    def test_download_hash_mismatch_is_rejected_and_not_cached(self):
        entry = self.entry('a.py', b'original')
        with patch.object(audit.subprocess, 'run', return_value=self.payload(b'wrong')):
            with self.assertRaises(ValueError):
                audit.fetch_verified(entry, self.root, self.cache)
        self.assertFalse((self.cache / entry['sha']).exists())

    def test_size_bound_prevents_network(self):
        with patch.object(audit.subprocess, 'run') as network:
            data, reason = audit.fetch_verified(self.entry('a.py', b'x' * 20), self.root, self.cache, max_bytes=10)
        network.assert_not_called()
        self.assertIsNone(data)
        self.assertEqual(reason, 'over-size-bound')

    def test_invalid_sha_and_base64_rejected(self):
        with self.assertRaises(ValueError):
            audit.fetch_verified(self.entry('a.py', b'', sha='../unsafe'), self.root, self.cache)
        payload = SimpleNamespace(stdout=json.dumps({'encoding': 'base64', 'content': '@invalid', 'size': 5}))
        with patch.object(audit.subprocess, 'run', return_value=payload):
            with self.assertRaises(ValueError):
                audit.fetch_verified(self.entry('a.py', b'abcde'), self.root, self.cache)

    def test_duplicate_concurrent_blobs_have_atomic_unique_partials(self):
        data = b'concurrent blob'
        entry = self.entry('a.py', data)
        with patch.object(audit.subprocess, 'run', side_effect=lambda *a, **k: self.payload(data)):
            with ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(lambda _: audit.fetch_verified(entry, self.root, self.cache), range(20)))
        self.assertTrue(all(actual == data for actual, origin in results))
        self.assertFalse(list(self.cache.glob('*.part')))

    def test_blob_failures_recorded_without_aborting(self):
        with patch.object(audit.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['gh'])):
            result = audit.inspect_blob(self.entry('a.py', b'data'), self.root, self.cache, 'a' * 40)
        self.assertEqual(result['status'], 'failed')

    def test_invalid_json_recorded_and_links_are_encoded(self):
        (self.root / 'bad file.json').write_bytes(b'{broken')
        result = audit.inspect_blob(self.entry('bad file.json', b'{broken'), self.root, self.cache, 'a' * 40)
        self.assertEqual(result['status'], 'failed')
        self.assertIn('bad%20file.json', result['url'])

    def test_database_is_profiled_from_verified_snapshot_without_seed_execution(self):
        source = self.root / 'evidence.db'
        with sqlite3.connect(source) as db:
            db.execute('CREATE TABLE voting_record(official TEXT,vote TEXT)')
        data = source.read_bytes()
        result = audit.inspect_local_databases([self.entry('evidence.db', data)], self.root, self.cache)
        self.assertEqual(result[0]['tables'][0]['rows'], 0)
        self.assertEqual(result[0]['tables'][0]['columns'][0]['name'], 'official')
        self.assertEqual(source.read_bytes(), data)
        self.assertTrue((self.cache / audit.git_blob_sha(data)).exists())

    def test_malformed_encoding_and_deep_json_are_isolated(self):
        for name, data in [('invalid.json', b'{"text":"\xff"}'),
                           ('deep.json', b'[' * 2000 + b'0' + b']' * 2000)]:
            (self.root / name).write_bytes(data)
            result = audit.inspect_blob(self.entry(name, data), self.root, self.cache, 'a' * 40)
            self.assertEqual(result['status'], 'failed')

    def test_local_symlink_outside_root_is_not_trusted(self):
        data = b'outside-root'
        outside = Path(self.temp.name) / 'outside.py'
        outside.write_bytes(data)
        (self.root / 'a.py').symlink_to(outside)
        with patch.object(audit.subprocess, 'run', return_value=self.payload(data)) as network:
            actual, origin = audit.fetch_verified(self.entry('a.py', data), self.root, self.cache)
        network.assert_called_once()
        self.assertEqual(origin, 'GitHub-blob-API')
        self.assertEqual(actual, data)

    def test_sqlite_errors_are_structured(self):
        source = self.root / 'bad.db'
        source.write_bytes(b'not SQLite')
        result = audit.inspect_local_databases([self.entry('bad.db', source.read_bytes())], self.root, self.cache)
        self.assertEqual(result[0]['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
