from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import follow_money_evidence as money


def html(title='Authorizing $18,063,014 Interfund Loan',link='/MetaViewer.php?view_id=5&amp;clip_id=1144&amp;meta_id=151234'):
    return '<html><body><a href="/MetaViewer.php?meta_id=9">orphan</a><table><tr><td>18.</td><td>'+title+'</td></tr></table><a href="'+link+'">Resolution</a></body></html>'


class FollowMoneyTests(unittest.TestCase):
    def test_generated_agenda_associates_following_link(self):
        item=money.choose_interfund(money.parse_agenda(html()))
        self.assertEqual(item['item_no'],'18')
        self.assertIn('meta_id=151234',item['attachment_urls'][0])
        self.assertEqual(len(item['attachment_urls']),1)

    def test_missing_or_multiple_candidates_fail_closed(self):
        items=money.parse_agenda(html())
        for value in ([],items*2):
            with self.assertRaises(ValueError):money.choose_interfund(value)

    def test_wrong_host_and_clip_rejected(self):
        for link in ('https://evil.test/MetaViewer.php?clip_id=1144&amp;meta_id=1',
                     '/MetaViewer.php?clip_id=1095&amp;meta_id=1'):
            with self.assertRaises(ValueError):money.parse_agenda(html(link=link))

    def test_unrelated_loan_is_not_selected(self):
        with self.assertRaises(ValueError):money.choose_interfund(money.parse_agenda(html(title='Interfund Loan $1,000,000')))

    def test_missing_body_is_failure(self):
        with self.assertRaises(ValueError):money.parse_agenda('not an agenda')

    def test_agenda_url_is_fixed(self):
        self.assertEqual(money.safe_agenda(money.AGENDA),money.AGENDA)
        for url in (money.AGENDA.replace('1144','1145'),money.AGENDA.replace('https:','http:')):
            with self.assertRaises(ValueError):money.safe_agenda(url)

    def test_discovery_failure_removes_stale_own_capture_and_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder);(out/'interfund_attachment_3.pdf').write_bytes(b'stale')
            with patch.object(money,'fetch_agenda',side_effect=OSError('unavailable')):
                report=money.collect('interfund',out)
            self.assertFalse(money.complete(report));self.assertFalse(list(out.glob('*.pdf')))

    def test_new_baseline_not_fabricated(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(money,'fetch_agenda',return_value=html()), patch.object(
                money,'capture',side_effect=lambda s,o:{**s,'status':'captured-needs-review','matches_archived_sha1':False,'pages':[{'page':1,'text':'terms'}]}):
            report=money.collect('interfund',Path(folder))
        self.assertTrue(money.complete(report));self.assertIsNone(report['sources'][0]['matches_archived_sha1'])


if __name__=='__main__':unittest.main()
