#!/usr/bin/env python3
"""Inspect retrieved response types/text and discover official media candidates.
No bot challenges are bypassed. Media links remain unverified candidates.
"""
import html
import json
from pathlib import Path
import re
import sqlite3
from urllib.request import Request, urlopen
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT/'arena_workspace'
TERMS = ['stormwater', '1,000,0000', 'Fremont', '3-2', '4669', '6544', '5,650,000', 'Aldrich']


def notice(title, data):
    message = json.dumps(data,ensure_ascii=True).replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print(f'::notice title={title}::{message}')


def main():
    results = []
    with sqlite3.connect(f'file:{WORK / "cheyenne_records.sqlite3"}?mode=ro',uri=True) as db:
        rows = db.execute('SELECT case_id,kind,url,status,local_path FROM sources').fetchall()
    for case,kind,url,status,path in rows:
        record = {'case_id':case,'kind':kind,'url':url,'retrieval_status':status}
        if path:
            data = Path(path).read_bytes()
            record['bytes'] = len(data)
            if data.startswith(b'%PDF-'):
                reader = PdfReader(path)
                texts = [p.extract_text() or '' for p in reader.pages]
                record['response_type'] = 'PDF'
                record['pages'] = len(texts)
                record['excerpts'] = []
                for i,text in enumerate(texts,1):
                    for term in TERMS:
                        pos = text.lower().find(term.lower())
                        if pos>=0:
                            record['excerpts'].append({'page':i,'term':term,'text':text[max(0,pos-160):pos+450]})
                record['first_page_excerpt'] = texts[0][:500] if texts else ''
                target = WORK/'exports'/f'{case}-{kind}-extracted.txt'
                target.write_text('\n\n'.join(f'PAGE {i}\n{t}' for i,t in enumerate(texts,1)))
            else:
                text = data.decode('utf-8',errors='replace')
                record['response_type'] = 'non-PDF'
                record['response_excerpt'] = re.sub('<[^>]+>',' ',text)[:500]
                record['page_title'] = re.findall(r'<title[^>]*>(.*?)</title>',text,re.I|re.S)[:1]
        results.append(record)
        brief = {k:v for k,v in record.items() if k!='excerpts'}
        brief['excerpt_matches'] = sorted(record.get('excerpts',[]),key=lambda r: TERMS.index(r['term']))[:2]
        notice(f'Source inspection {case} {kind}',brief)
    media = []
    for clip in ('1099','1095','1120','1144'):
        url = f'https://cheyenne.granicus.com/MediaPlayer.php?view_id=2&clip_id={clip}'
        row = {'clip_id':clip,'page_url':url}
        try:
            with urlopen(Request(url,headers={'User-Agent':'CivicEvidenceResearch/1.0'}),timeout=15) as response:
                text = response.read(2*1024*1024).decode('utf-8',errors='replace')
            row['page_titles'] = re.findall(r'<title[^>]*>(.*?)</title>',text,re.I|re.S)[:1]
            row['official_media_candidates'] = sorted(set(html.unescape(s).replace('\\/','/') for s in
                re.findall(r'https?[^\s\x22\x27<>]+\.(?:mp4|m3u8)(?:\?[^\s\x22\x27<>]*)?',text,re.I)))[:5]
            row['youtube_ids'] = sorted(set(re.findall(r'(?:youtube.com/embed/|youtu.be/|videoId[\x22\x27 :]+)([\w-]{11})',text)))
        except Exception as exc:
            row['error']=str(exc)
        media.append(row)
        notice(f'Official media discovery {clip}',row)
    (WORK/'exports/source_content_inspection.json').write_text(json.dumps({'sources':results,'media':media},indent=2)+'\n')


if __name__=='__main__':
    main()
