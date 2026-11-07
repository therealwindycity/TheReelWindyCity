#!/usr/bin/env python3
"""Capture three fixed public procurement records; retrieval is not payment proof."""
import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

SOURCES = (
    {'id': 'bid', 'url': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147788',
     'archived_sha1': '7b7c33140c0ddacadd7b17a031c1a340cd634fbd', 'review_pages': [1, 2]},
    {'id': 'referral', 'url': 'https://cheyenne.granicus.com/MinutesViewer.php?view_id=5&clip_id=1095&doc_id=73b94d0f-52f1-11f1-9b4d-005056a89546',
     'archived_sha1': '0cae55ff9603a9e026cd9b8aeb660cf45c047258', 'review_pages': [1, 5]},
    {'id': 'award', 'url': 'https://cheyenne.granicus.com/MinutesViewer.php?view_id=5&clip_id=1097&doc_id=f3faa5e3-5ebe-11f1-9b4d-005056a89546',
     'archived_sha1': 'da921c2168d796d151a34058ab46ccdfa4a6f113', 'review_pages': [1, 6]},
)
MAX_BYTES = 5 * 1024 * 1024


def safe_url(url):
    p = urlsplit(url)
    if (p.scheme != 'https' or p.hostname != 'cheyenne.granicus.com' or
            p.username or p.password or p.port not in (None, 443) or
            p.path not in ('/MetaViewer.php', '/MinutesViewer.php', '/DocumentViewer.php')):
        raise ValueError('Unapproved source URL')
    return url


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        safe_url(newurl)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


class PDFLinks(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.links = base, set()

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key not in ('href', 'src', 'data') or not value:
                continue
            url = urljoin(self.base, value)
            parsed = urlsplit(url)
            if parsed.path != '/DocumentViewer.php':
                continue
            try:
                safe_url(url)
            except ValueError:
                continue
            if any(name.lower().endswith('.pdf') for name in parse_qs(parsed.query).get('file', [])):
                self.links.add(url)


def fetch(url, max_bytes=MAX_BYTES):
    if not isinstance(max_bytes, int) or not 0 < max_bytes <= 12 * 1024 * 1024:
        raise ValueError('Unsupported source byte bound')
    safe_url(url)
    with build_opener(SafeRedirect()).open(
            Request(url, headers={'User-Agent': 'CivicEvidenceResearch/1.0'}), timeout=25) as response:
        safe_url(response.geturl())
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError(f'Source exceeds {max_bytes} byte bound')
        return data, response.geturl()


def capture(source, out, fetcher=None):
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError
    row = {**source, 'status': 'failed'}
    fetch_source = fetcher or fetch
    try:
        data, final_url = fetch_source(source['url'])
        if not data.startswith(b'%PDF-'):
            viewer = PDFLinks(final_url)
            viewer.feed(data.decode('utf-8'))
            if len(viewer.links) != 1:
                raise ValueError('Viewer does not identify exactly one public PDF')
            data, final_url = fetch_source(next(iter(viewer.links)))
        if not data.startswith(b'%PDF-'):
            raise ValueError('Response is not a PDF')
        row.update(final_url=final_url, bytes=len(data), sha1=hashlib.sha1(data).hexdigest(),
                   sha256=hashlib.sha256(data).hexdigest())
        row['matches_archived_sha1'] = row['sha1'] == source['archived_sha1']
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted or not 1 <= len(reader.pages) <= 20:
            raise ValueError('Encrypted or unexpected PDF page count')
        pages = []
        for index, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ''
            layout = (page.extract_text(extraction_mode='layout') or '') if source['id'] == 'bid' and index == 2 else None
            pages.append({'page': index, 'text': text, **({'layout': layout} if layout is not None else {})})
        if sum(len(p['text']) + len(p.get('layout', '')) for p in pages) > 150_000:
            raise ValueError('Extracted text exceeds bound')
        if not set(source['review_pages']).issubset({p['page'] for p in pages}):
            raise ValueError('Expected review pages unavailable')
        if not all(p['text'].strip() for p in pages if p['page'] in source['review_pages']):
            raise ValueError('Review pages require OCR/manual inspection')
        (out / (source['id'] + '.pdf')).write_bytes(data)
        row.update(pages=pages, status='captured-needs-review')
    except (OSError, ValueError, RuntimeError, PyPdfError) as exc:
        row['error'] = str(exc)
    return row


def packets(report):
    focused = {**report, 'sources': [{**s, 'pages': [p for p in s.get('pages', [])
                if p['page'] in s['review_pages']]} for s in report['sources']]}
    raw = json.dumps(focused, ensure_ascii=True)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    parts = []
    remaining = raw
    while remaining:
        low, high = 1, min(len(remaining), 3200)
        while low < high:
            middle = (low + high + 1) // 2
            envelope = {'part': 999999, 'parts': 999999, 'payload_sha256': digest,
                        'data': remaining[:middle]}
            if len(json.dumps(envelope).encode()) <= 3300:
                low = middle
            else:
                high = middle - 1
        parts.append(remaining[:low])
        remaining = remaining[low:]
    # GitHub only retains ten notice annotations per step. Fail before emitting
    # an incomplete sequence rather than publishing a misleading green capture.
    if len(parts) > 10:
        raise ValueError('Focused review exceeds ten-notice budget; use full artifact')
    return [{'part': i, 'parts': len(parts), 'payload_sha256': digest, 'data': data}
            for i, data in enumerate(parts)]


def assemble(parts):
    if not parts:
        raise ValueError('No evidence packets')
    count, digest = parts[0]['parts'], parts[0]['payload_sha256']
    if (len(parts) != count or sorted(p['part'] for p in parts) != list(range(count)) or
            any(p['parts'] != count or p['payload_sha256'] != digest for p in parts)):
        raise ValueError('Missing, duplicate or inconsistent evidence packets')
    raw = ''.join(p['data'] for p in sorted(parts, key=lambda p: p['part']))
    if hashlib.sha256(raw.encode()).hexdigest() != digest:
        raise ValueError('Evidence packet digest mismatch')
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path('arena_workspace/fleet-case'))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    # Never leave stale successful captures under the current run's filenames.
    for source in SOURCES:
        (args.out / (source['id'] + '.pdf')).unlink(missing_ok=True)
    report = {'schema_version': 1, 'interpretation': 'Public source capture, not proof of payment or compliance.',
              'sources': [capture(source, args.out) for source in SOURCES]}
    (args.out / 'source_captures.json').write_text(json.dumps(report, indent=2)+'\n')
    for packet in packets(report):
        message = json.dumps(packet, ensure_ascii=True)
        if len(message.encode()) > 3400:
            raise ValueError('Evidence notice exceeds transport bound')
        print('::notice title=FLEET_EVIDENCE::' + message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A'))
    return 0 if all(s['status'] == 'captured-needs-review' and s.get('matches_archived_sha1')
                    for s in report['sources']) else 2


if __name__ == '__main__':
    raise SystemExit(main())
