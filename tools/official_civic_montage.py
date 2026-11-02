#!/usr/bin/env python3
"""Use publicly advertised official HLS streams, never authenticated YouTube access.
Supplied cue timestamps and case associations remain unverified.
"""
import json
from pathlib import Path
import subprocess
from urllib.parse import parse_qs, urlparse
import civic_engine as engine

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT/'arena_workspace'


def main():
    targets = json.loads(engine.TARGETS.read_text())
    discovered = json.loads((WORK/'exports/source_content_inspection.json').read_text())
    lookup = {r['clip_id']:r for r in discovered['media']}
    results, clips = [], []
    for i,item in enumerate(targets,1):
        clip_id = parse_qs(urlparse(item['primary_url']).query).get('clip_id',[None])[0]
        if clip_id is None:
            clip_id = '1144'  # Supplied October case clip, not a verified association.
        media = lookup.get(clip_id,{}).get('official_media_candidates',[])
        result = {'case_id':item['id'],'clip_id':clip_id,'start':item['start'],
                  'verification':'unverified-supplied-cue-and-case-association'}
        output = WORK/'video_clips'/f'official_{i}.mp4'
        try:
            if not media:
                raise ValueError('No publicly advertised media URL found')
            source = media[0]
            result['media_url'] = source
            label = WORK/'video_clips'/f'official_label_{i}.txt'
            label.write_text(f"OFFICIAL ARCHIVE | Clip {clip_id} | {item['start']}\nUNVERIFIED CUE / CASE ASSOCIATION")
            vf = ("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,"
                  f"drawtext=textfile='{label.resolve()}':expansion=none:fontcolor=white:fontsize=22:box=1:boxcolor=black@0.8:x=24:y=h-80")
            engine.run(['ffmpeg','-y','-rw_timeout','20000000','-ss',str(engine.seconds(item['start'])),
                        '-i',source,'-t',str(item['duration']),'-map','0:v:0','-map','0:a:0',
                        '-vf',vf,'-r','30','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p',
                        '-c:a','aac','-ar','48000','-ac','2','-af','aresample=async=1:first_pts=0',
                        '-avoid_negative_ts','make_zero',str(output)])
            data = engine.probe(output)
            duration = float(data['format']['duration'])
            if duration < item['duration']-2:
                raise ValueError(f'Insufficient footage at supplied cue: {duration}s')
            clips.append(output)
            result.update(status='rendered-unverified-cue',duration=duration)
        except (ValueError,RuntimeError,OSError,subprocess.SubprocessError) as exc:
            output.unlink(missing_ok=True)
            result.update(status='failed',error=str(exc)[-1400:])
        results.append(result)
        message=json.dumps(result).replace('%','%25').replace('\n','%0A').replace('\r','%0D')
        print('::notice title=Official clip attempt::'+message,flush=True)
    final = WORK/'exports/official_archive_cue_montage.mp4'
    final.unlink(missing_ok=True)
    if len(clips)==len(targets):
        manifest=WORK/'official_concat.txt'
        manifest.write_text(''.join(f"file '{clip.resolve()}'\n" for clip in clips))
        engine.run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy','-movflags','+faststart',str(final)])
        engine.probe(final)
    report={'clips':results,'complete_montage':final.exists(),
            'warning':'Archive footage is not proof of the supplied allegation. Meeting dates, cue content and associations need review.'}
    (WORK/'exports/official_media_report.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':
    main()
