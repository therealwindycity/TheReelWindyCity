#!/usr/bin/env python3
"""Discover the documented interfund proposal and capture Reed budget provenance."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from bs4 import BeautifulSoup
from fleet_case_evidence import capture, safe_url
from remaining_target_evidence import evidence_packets

AGENDA = 'https://cheyenne.granicus.com/GeneratedAgendaViewer.php?view_id=5&clip_id=1144'
BUDGET = [
    {'id':'reed_carryforward', 'url':'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1038&meta_id=144480',
     'archived_sha1':'6098a57558db3a352b5f26b774a9a98f5bc2babf','review_pages':[1,11]},
    {'id':'carryforward_adoption', 'url':'https://cheyenne.granicus.com/MinutesViewer.php?view_id=5&clip_id=1038&doc_id=7e8ee6b7-b66c-11f0-8df7-005056a89546',
     'archived_sha1':'e8412e715c026c4dea829dcffc6d33b78214f787','review_pages':[1,2]},
]
ITEM = re.compile(r'^\s*(\d{1,2}|[a-z])\s*[.)]\s*(.*)$')


def safe_agenda(url):
    p=urlsplit(url)
    if (p.scheme!='https' or p.hostname!='cheyenne.granicus.com' or p.username or
            p.password or p.port not in (None,443) or p.path!='/GeneratedAgendaViewer.php' or
            parse_qs(p.query).get('clip_id')!=['1144']):
        raise ValueError('Unapproved agenda URL')
    return url


class AgendaRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        safe_agenda(newurl)
        return super().redirect_request(request,fp,code,msg,headers,newurl)


def fetch_agenda():
    safe_agenda(AGENDA)
    with build_opener(AgendaRedirect()).open(Request(AGENDA,headers={'User-Agent':'CivicEvidenceResearch/1.0'}),timeout=25) as response:
        safe_agenda(response.geturl())
        data=response.read(2*1024*1024+1)
    if len(data)>2*1024*1024 or data.startswith(b'%PDF-'):
        raise ValueError('Agenda is oversized or not HTML')
    return data.decode('utf-8')


def parse_agenda(html):
    soup=BeautifulSoup(html,'html.parser')
    root=soup.body or soup
    if root.find('table') is None:
        raise ValueError('Agenda has no item tables')
    items=[]; current=None; parent=''
    for element in root.descendants:
        if getattr(element,'name',None)=='table':
            rows=element.get_text('\n',strip=True).splitlines()
            if not rows:continue
            match=ITEM.match(rows[0])
            if not match:continue
            number=match.group(1)
            if number.isdigit():parent=number
            else:number=parent+number
            title=' '.join(([match.group(2)] if match.group(2) else [])+rows[1:])
            current={'item_no':number,'title':title,'attachment_urls':[]};items.append(current)
        elif getattr(element,'name',None)=='a' and current is not None:
            href=element.get('href')
            if not href:continue
            url=urljoin(AGENDA,href)
            p=urlsplit(url);q=parse_qs(p.query)
            if p.path!='/MetaViewer.php' or 'meta_id' not in q:continue
            safe_url(url)
            if q.get('clip_id')!=['1144'] or len(q['meta_id'])!=1 or not q['meta_id'][0].isdigit():
                raise ValueError('Attachment is not uniquely associated with clip 1144')
            if url not in current['attachment_urls']:current['attachment_urls'].append(url)
    return items


def choose_interfund(items):
    candidates=[i for i in items if 'interfund' in i['title'].lower() and
                '18063014' in re.sub(r'[^0-9]','',i['title'])]
    if len(candidates)!=1 or not 1 <= len(candidates[0]['attachment_urls']) <= 4:
        raise ValueError('Need exactly one matching loan item with one to four attachments')
    return candidates[0]


def choose_budget(items):
    candidates=[i for i in items if re.search(r're[‐‑–—-]?appropriat',i['title'],re.I) and '2027' in i['title']]
    if len(candidates)!=1 or not 1 <= len(candidates[0]['attachment_urls']) <= 4:
        raise ValueError('Need exactly one FY2027 reappropriation item with attachments')
    return candidates[0]


def collect(case,out):
    out.mkdir(parents=True,exist_ok=True)
    for name in ('source_captures.json','agenda.html'):
        (out/name).unlink(missing_ok=True)
    for pattern in ('interfund_attachment_*.pdf','current_budget_attachment_*.pdf'):
        for path in out.glob(pattern):path.unlink()
    report={'schema_version':1,'case':case,'sources':[],
            'interpretation':'Proposal/approval/encumbrance evidence, not actual disbursement or legal finding.'}
    try:
        if case in ('interfund','current_budget'):
            html=fetch_agenda();(out/'agenda.html').write_text(html)
            item=(choose_interfund if case=='interfund' else choose_budget)(parse_agenda(html))
            report['discovery']={'url':AGENDA,'html_sha256':hashlib.sha256(html.encode()).hexdigest(),'item':item}
            specifications=[{'id':f'{case}_attachment_{n}','url':url,'archived_sha1':None,'review_pages':[1]}
                            for n,url in enumerate(item['attachment_urls'],1)]
        else:specifications=BUDGET
        for spec in specifications:
            (out/(spec['id']+'.pdf')).unlink(missing_ok=True)
            row=capture(spec,out)
            available=spec['archived_sha1'] is not None
            row['archive_baseline_available']=available
            if not available:row['matches_archived_sha1']=None
            if case=='current_budget' and row['status']=='captured-needs-review':
                hits=[p['page'] for p in row['pages'] if re.search(r'\b7782\b',p['text'])]
                row['contract_7782_page_hits']=hits
                row['review_pages']=sorted(set([1]+hits))
                row['omitted_review_pages']=[p['page'] for p in row['pages'] if p['page'] not in row['review_pages']]
            if case=='interfund' and row['status']=='captured-needs-review':
                row['review_pages']=[p['page'] for p in row['pages'][:8]]
                row['omitted_review_pages']=[p['page'] for p in row['pages'][8:]]
            report['sources'].append(row)
    except (OSError,ValueError) as exc:
        report['discovery_error']=str(exc)
    return report


def complete(report):
    return bool(report['sources']) and not report.get('discovery_error') and all(
        s['status']=='captured-needs-review' and
        (not s['archive_baseline_available'] or s['matches_archived_sha1'] is True)
        for s in report['sources'])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',choices=('interfund','reed_budget','current_budget'),required=True)
    parser.add_argument('--out',type=Path)
    args=parser.parse_args();out=args.out or Path('arena_workspace/follow-money')/args.case
    report=collect(args.case,out)
    (out/'source_captures.json').write_text(json.dumps(report,indent=2)+'\n')
    for packet in evidence_packets(report):
        message=json.dumps(packet)
        if len(message.encode())>3400:raise ValueError('Notice exceeds transport bound')
        print('::notice title=FOLLOW_MONEY_EVIDENCE::'+message.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
    return 0 if complete(report) else 2


if __name__=='__main__':raise SystemExit(main())
