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

    def test_notice_budget_fails_before_emitting_partial_transport(self):
        report = self.report()
        report['sources'][0]['pages'][1]['text'] = 'x' * 100000
        with self.assertRaisesRegex(ValueError, 'ten-notice'):
            fleet.packets(report)

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

    def test_malformed_pdf_is_isolated(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(fleet, 'fetch', return_value=(b'%PDF-1.7\nbroken', fleet.SOURCES[0]['url'])):
                result = fleet.capture(fleet.SOURCES[0], Path(root))
            self.assertEqual(result['status'], 'failed')
            self.assertIn('error', result)

    def test_valid_text_pdf_is_preserved_byte_for_byte(self):
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        writer = PdfWriter()
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                                 NameObject('/Subtype'): NameObject('/Type1'),
                                 NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):
            DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
        stream = DecodedStreamObject()
        stream.set_data(b'BT /F1 12 Tf 20 100 Td (Award 78819) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(stream)
        output = io.BytesIO();writer.write(output)
        data = output.getvalue()
        source = {'id': 'valid', 'url': fleet.SOURCES[0]['url'], 'review_pages': [1],
                  'archived_sha1': hashlib.sha1(data).hexdigest()}
        with tempfile.TemporaryDirectory() as root:
            with patch.object(fleet, 'fetch', return_value=(data, source['url'])):
                result = fleet.capture(source, Path(root))
            self.assertEqual(result['status'], 'captured-needs-review')
            self.assertTrue(result['matches_archived_sha1'])
            self.assertIn('Award 78819', result['pages'][0]['text'])
            self.assertEqual((Path(root) / 'valid.pdf').read_bytes(), data)

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
