import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from pypdf import PdfWriter
import fleet_case_evidence as fleet


class FleetEvidenceTests(unittest.TestCase):
    def report(self):
        return {'sources': [{'id': 'bid', 'review_pages': [2], 'pages': [
            {'page': 1, 'text': 'not selected'}, {'page': 2, 'text': 'é % " money' * 300}]}]}

    def test_fixed_sources_are_approved(self):
        self.assertEqual(len(fleet.SOURCES), 3)
        for source in fleet.SOURCES:
            self.assertEqual(fleet.safe_url(source['url']), source['url'])

    def test_host_scheme_port_and_credentials_fail_closed(self):
        for url in ('http://cheyenne.granicus.com/MetaViewer.php',
                    'https://cheyenne.granicus.com.evil.test/MetaViewer.php',
                    'https://user@cheyenne.granicus.com/MetaViewer.php',
                    'https://cheyenne.granicus.com:444/MetaViewer.php',
                    'https://cheyenne.granicus.com/admin'):
            with self.assertRaises(ValueError):fleet.safe_url(url)

    def test_viewer_accepts_only_same_host_pdf_document_links(self):
        viewer = fleet.PDFLinks(fleet.SOURCES[0]['url'])
        viewer.feed('<iframe src="/DocumentViewer.php?file=good.pdf&amp;view=1"></iframe>'
                    '<a href="https://evil.test/DocumentViewer.php?file=bad.pdf">bad</a>')
        self.assertEqual(viewer.links, {'https://cheyenne.granicus.com/DocumentViewer.php?file=good.pdf&view=1'})

    def test_packet_roundtrip_unicode_and_size(self):
        packets = fleet.packets(self.report())
        self.assertTrue(all(len(json.dumps(p).encode()) <= 3400 for p in packets))
        assembled = fleet.assemble(list(reversed(packets)))
        self.assertEqual(assembled['sources'][0]['pages'], self.report()['sources'][0]['pages'][1:])

    def test_missing_duplicate_and_modified_packets_rejected(self):
        packets = fleet.packets(self.report())
        tampered = copy.deepcopy(packets);tampered[0]['data'] += 'x'
        for parts in ([], packets[:-1], packets + packets[:1], tampered):
            with self.assertRaises(ValueError):fleet.assemble(parts)

    def test_network_failure_is_a_source_failure(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(fleet, 'fetch', side_effect=OSError('unavailable')):
                result = fleet.capture(fleet.SOURCES[0], Path(root))
            self.assertEqual(result['status'], 'failed')
            self.assertFalse(list(Path(root).glob('*.pdf')))

    def test_ambiguous_viewer_does_not_choose_arbitrary_document(self):
        html = b'<a href="/DocumentViewer.php?file=a.pdf">a</a><a href="/DocumentViewer.php?file=b.pdf">b</a>'
        with tempfile.TemporaryDirectory() as root:
            with patch.object(fleet, 'fetch', return_value=(html, fleet.SOURCES[0]['url'])):
                result = fleet.capture(fleet.SOURCES[0], Path(root))
            self.assertEqual(result['status'], 'failed')
            self.assertIn('exactly one', result['error'])

    def test_blank_pdf_fails_instead_of_claiming_text_verification(self):
        writer = PdfWriter();writer.add_blank_page(width=300, height=300)
        output = io.BytesIO();writer.write(output)
        source = {'id': 'test', 'url': fleet.SOURCES[0]['url'], 'review_pages': [1],
                  'archived_sha1': hashlib.sha1(output.getvalue()).hexdigest()}
        with tempfile.TemporaryDirectory() as root:
            with patch.object(fleet, 'fetch', return_value=(output.getvalue(), source['url'])):
                result = fleet.capture(source, Path(root))
            self.assertEqual(result['status'], 'failed')
            self.assertIn('OCR', result['error'])


if __name__ == '__main__':unittest.main()
