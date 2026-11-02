#!/usr/bin/env python3
"""Create corrected archive-based social posts and a silent evidence-card reel.
Requires the output of review_drive_civic.py, Pillow and imageio-ffmpeg.
This is deliberately NOT a montage of meeting footage.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'arena_workspace/exports'
CARDS = ROOT / 'arena_workspace/review_cards'
SOURCES = {
    'debt': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1099&meta_id=148538',
    'debt_minutes': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1120&meta_id=149219',
    'fleet19': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147788',
    'fleet20': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147790',
    'highlands': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1120&meta_id=149235',
    'planning': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1120&meta_id=149247',
    'reed': 'https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147723',
}


def wrapped(draw, text, font, width):
    words = text.split()
    lines, line = [], ''
    for word in words:
        candidate = (line + ' ' + word).strip()
        if draw.textlength(candidate, font=font) > width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def main():
    report = json.loads((OUT / 'drive_database_review.json').read_text())
    pages = {(r['doc_id'], r['page']): r['text'] for r in report['selected_pages']}
    # Fail closed if expected archived passages changed.
    for key, needle in [((330,2), '$1,000,0000.00'), ((488,1), '$78,819.00'),
                        ((489,1), '$126,662.00'), ((148,1), '3-2'), ((441,2), '#4669')]:
        if needle not in pages[key]:
            raise ValueError(f'Expected excerpt missing: {key}, {needle}')
    posts = [
        ('A malformed figure, not evidence of a $10 billion loan',
         f"The archived packet text prints `$1,000,0000.00` in a clause estimating annual principal and interest. The same page limits the proposed loan application to $20 million. [Packet, page 2]({SOURCES['debt']}).\n\n"
         f"Archived minutes record adoption of Resolution 6544 and all members present voting yes. [Minutes, page 4]({SOURCES['debt_minutes']}).\n\n"
         'The packet’s adoption date is blank. The signed final resolution is needed to determine whether the malformed figure survived. The previously supplied debt-cap quotation does not match this page.'),
        ('The fleet memos recommend the Wyoming bidder',
         f"The E-19-26 purchasing memo recommends Fremont Motor Company for $78,819. [Memo, page 1]({SOURCES['fleet19']}). "
         f"The E-20-26 memo recommends Fremont for $126,662. [Memo, page 1]({SOURCES['fleet20']}).\n\n"
         'Both list Duval Ford as a bidder, but these recommendations do not support a claim that these two contracts favored Florida over Wyoming. Final award actions and applicable preference rules still require separate review.'),
        ('Highlands: distinguish annexation from the land-use amendment',
         f"The archived staff report describes a 3,459.99-acre annexation request. [Report, packet page 7]({SOURCES['highlands']}). "
         f"A separate memo says the Planning Commission voted 3–2 against the future land-use map amendment and describes an overruling process. [Memo, page 1]({SOURCES['planning']}).\n\n"
         'That distinction matters: the memo does not establish a blanket rejection of every annexation instrument. The supplied detailed-design quotation and video timestamp remain unauthenticated.'),
        ('Reed Avenue: correct the ordinance number before sharing',
         f"Archived April 27 minutes identify the Reed Avenue appropriation as Ordinance 4669, not 4662. They record Moody voting no and note that no vote was recorded for Rinne because of technical issues. [Minutes, page 2]({SOURCES['reed']}).\n\n"
         'The selected page does not establish the alleged $5.65 million amount. This municipal database’s indexed meetings end September 22, so the alleged October 26 stormwater vote remains unresolved.'),
    ]
    notice = ('**Source basis:** archived extracted text in your Drive copy of civic.db; '
              'original PDFs, live-link availability and meeting audio/video have not been authenticated. '
              'These posts describe what the archive contains, not findings of corruption.')
    text = ['# The Real Windy City — archive-check social posts', '', notice, '']
    for i, (title, body) in enumerate(posts, 1):
        text += [f'## Post {i}: {title}', '', body, '', notice, '', '---', '']
    text += ['## Reel description', '',
             'Silent 50-second archive-review reel. Five text cards; no meeting footage, speech, or simulated testimony. Source URLs and page locators are listed above. Source-link reachability is not verified.', '']
    (OUT / 'corrected_social_posts.md').write_text('\n'.join(text), encoding='utf-8')
    cards = [
        ('CHECK THE RECORD', 'Five Drive databases inspected. The initial allegations needed important corrections.',
         'ARCHIVED TEXT REVIEW\nNot a finding of corruption.'),
        ('THE DEBT FIGURE', 'A malformed $1,000,0000.00 appears in an estimated-payment clause. The loan application limit is $20 million.',
         'Packet page 2 | meta_id 148538\nSigned final version still needed.'),
        ('WYOMING BIDDER', 'E-19-26 recommends Fremont: $78,819. E-20-26 recommends Fremont: $126,662. These memos do not support the Florida-bypass claim.',
         'Memo page 1 | meta_ids 147788 / 147790\nRecommendations are not final awards.'),
        ('HIGHLANDS SCOPE', 'The 3-2 disapproval described in the memo concerns a future land-use map amendment. Do not conflate it with every annexation instrument.',
         'Memo page 1 | meta_id 149247\nDesign quote and video cue unverified.'),
        ('REED: CORRECTION', 'Archived minutes identify Ordinance 4669, not 4662. The alleged October 26 stormwater vote is unresolved in the reviewed database.',
         'Minutes page 2 | meta_id 147723\nFull sources in accompanying posts.'),
    ]
    CARDS.mkdir(parents=True, exist_ok=True)
    title_font, body_font, small_font = [ImageFont.load_default(size=size) for size in (48, 37, 24)]
    for i, (title, body, footer) in enumerate(cards):
        image = Image.new('RGB', (720,1280), '#101a28')
        draw = ImageDraw.Draw(image)
        draw.rectangle((0,0,720,18), fill='#36d7ba')
        draw.text((48,65), 'THE REAL WINDY CITY', font=small_font, fill='#36d7ba')
        y = 170
        for line in wrapped(draw,title,title_font,624):
            draw.text((48,y),line,font=title_font,fill='white'); y += 64
        y += 55
        for line in wrapped(draw,body,body_font,624):
            draw.text((48,y),line,font=body_font,fill='white'); y += 54
        if y > 930:
            raise ValueError('Card body exceeds safe area')
        draw.rectangle((32,967,688,1198), fill='#1f3247')
        y = 990
        for paragraph in footer.split('\n'):
            for line in wrapped(draw,paragraph,small_font,620):
                draw.text((48,y),line,font=small_font,fill='#e0e7ef'); y += 33
        draw.text((48,1150),'ARCHIVE EXTRACTS | NO MEETING FOOTAGE',font=small_font,fill='#36d7ba')
        draw.text((48,1230),f'{i+1}/5  |  Original PDFs/video not authenticated',font=small_font,fill='#b2c2d2')
        image.save(CARDS / f'card_{i:02d}.png')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    video = OUT / 'archive_evidence_review_reel.mp4'
    result = subprocess.run([ffmpeg,'-y','-framerate','1/10','-i',str(CARDS/'card_%02d.png'),
                            '-t','50','-vf','fps=30','-c:v','libx264','-preset','fast',
                            '-pix_fmt','yuv420p','-movflags','+faststart','-an',str(video)],
                            capture_output=True,text=True,timeout=180)
    if result.returncode:
        video.unlink(missing_ok=True)
        raise RuntimeError(result.stderr[-2000:])
    # Decode the complete rendered video, not just its first frame.
    subprocess.run([ffmpeg,'-v','error','-i',str(video),'-f','null','-'],check=True,
                   capture_output=True,timeout=120)
    status = {'original_meeting_montage': 'not-produced-no-authenticated-target-footage',
              'alternative_reel': video.name, 'reel_duration_seconds': 50,
              'reel_format': '720x1280 H.264, 30fps, silent text cards',
              'large_corpus': '143553641-byte JSON rejected by 25MB text extraction cap; download tool exposes no return_download_url argument',
              'live_source_verification': False, 'automatic_publication': False}
    (OUT/'completion_status.json').write_text(json.dumps(status,indent=2)+'\n')
    files = ['corrected_social_posts.md','archive_evidence_review_reel.mp4',
             'drive_database_review.md','drive_database_review.json','drive_evidence_review.sqlite3','completion_status.json']
    manifest = {name: hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in files}
    (OUT/'package_sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
    with zipfile.ZipFile(OUT/'civic_evidence_package.zip','w',compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in files+['package_sha256.json']:
            bundle.write(OUT/name,arcname=name)
    print(json.dumps(status,indent=2))


if __name__ == '__main__':
    main()
