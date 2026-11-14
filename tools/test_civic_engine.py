import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import civic_engine as engine


class CivicEngineTests(unittest.TestCase):
    def setUp(self):
        self.items = json.loads(engine.TARGETS.read_text())

    def test_timestamp_and_section(self):
        self.assertEqual(engine.seconds('04:14:50'), 15290)
        self.assertEqual(engine.section(self.items[0]), '*15290-15335')
        for value in ('00:60:00', '-1:00:00', '42', '00:00:99'):
            with self.assertRaises(ValueError):
                engine.seconds(value)

    def test_posts_never_assert_verified(self):
        text = engine.render_posts(self.items, [])
        self.assertIn('UNVERIFIED DRAFT', text)
        self.assertIn('&t=15290s)', text)
        self.assertNotIn('Record Confession', text)
        for item in self.items:
            self.assertIn(item['primary_url'], text)
            self.assertIn(item['minutes_url'], text)

    def test_database_idempotence_and_no_invented_votes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'records.db'
            for _ in range(2):
                db = engine.init_db(path, self.items)
                self.assertEqual(db.execute('SELECT count(*) FROM cases').fetchone()[0], 4)
                self.assertEqual(db.execute('SELECT count(*) FROM votes').fetchone()[0], 0)
                db.close()

    def test_blocked_sources_never_request_network(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(engine, 'urlopen') as network:
            db = engine.init_db(Path(tmp) / 'db', self.items)
            result = engine.retrieve(db, self.items[0], 'primary', Path(tmp), True)
            self.assertEqual(result['status'], 'blocked-network-policy')
            network.assert_not_called()
            db.close()

    def test_failed_source_recorded(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(engine, 'urlopen', side_effect=OSError('unreachable')):
            db = engine.init_db(Path(tmp) / 'db', self.items)
            result = engine.retrieve(db, self.items[0], 'minutes', Path(tmp), False)
            self.assertEqual(result['status'], 'retrieval-failed')
            self.assertIn('unreachable', result['error'])
            db.close()

    def test_blocked_montage_removes_stale_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'exports').mkdir()
            output = root / 'exports/cheyenne_corruption_montage.mp4'
            output.write_bytes(b'stale')
            result = engine.montage(self.items, root, True)
            self.assertIsNone(result['output'])
            self.assertFalse(output.exists())

    def test_missing_tools(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(engine.shutil, 'which', return_value=None):
            result = engine.montage(self.items, Path(tmp), False)
            self.assertEqual(result['status'], 'missing-tools')
            self.assertIn('ffmpeg', result['tools'])


if __name__ == '__main__':
    unittest.main()
