#!/usr/bin/env python3
"""Opt-in public-stream clipping. Access barriers are recorded, never bypassed."""
import argparse
import json
import hashlib
from pathlib import Path
import subprocess
import civic_engine as engine
from inspect_civic_sources import trusted_media_url

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'arena_workspace'


def render_montage(workspace, targets_path=engine.TARGETS):
    workspace = workspace.resolve()
    exports, clips_dir = workspace / 'exports', workspace / 'video_clips'
    exports.mkdir(parents=True, exist_ok=True)
    clips_dir.mkdir(parents=True, exist_ok=True)
    final = exports / 'official_archive_cue_montage.mp4'
    final.unlink(missing_ok=True)
    report_path = exports / 'official_media_report.json'
    report_path.unlink(missing_ok=True)
    report = {'run_id': None, 'clips': [], 'complete_montage': False,
              'warning': 'Supplied timestamps and case associations remain unverified. Footage is not proof of wrongdoing.'}
    try:
        targets = json.loads(targets_path.read_text())
        engine.validate_targets(targets)
        run = json.loads((exports / 'run_report.json').read_text())
        report['run_id'] = run['run_id']
        discovered = json.loads((exports / 'source_content_inspection.json').read_text())
        if not run['run_id'] or discovered.get('run_id') != run['run_id']:
            raise ValueError('Media discovery and retrieval belong to different runs')
        lookup = {r['clip_id']: r for r in discovered['media']}
        if len(lookup) != len(discovered['media']):
            raise ValueError('Duplicate media discovery clip IDs')
        clips = []
        for i, item in enumerate(targets, 1):
            clip_id = item.get('granicus_clip_id')
            result = {'case_id': item['id'], 'clip_id': clip_id, 'start': item['start'],
                      'verification': 'unverified-supplied-cue-and-case-association'}
            output = clips_dir / f'official_{i}.mp4'
            output.unlink(missing_ok=True)
            try:
                if not isinstance(clip_id, str) or not clip_id.isascii() or not clip_id.isdigit():
                    raise ValueError('Explicit supplied Granicus clip ID required')
                candidates = lookup.get(clip_id, {}).get('official_media_candidates', [])
                media = [s for s in candidates if isinstance(s, str) and trusted_media_url(s)]
                if not media:
                    raise ValueError('No approved publicly advertised official stream')
                result['media_url'] = media[0]
                label = clips_dir / f'official_label_{i}.txt'
                label.write_text(f"OFFICIAL ARCHIVE | Clip {clip_id} | {item['start']}\nUNVERIFIED CUE / CASE ASSOCIATION")
                vf = ('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,'
                      f'drawtext=textfile={label.name}:expansion=none:fontcolor=white:fontsize=22:box=1:boxcolor=black@0.8:x=24:y=h-80')
                engine.run(['ffmpeg', '-y', '-rw_timeout', '20000000', '-ss', str(engine.seconds(item['start'])),
                            '-i', media[0], '-t', str(item['duration']), '-map', '0:v:0', '-map', '0:a:0',
                            '-vf', vf, '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
                            '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-af', 'aresample=async=1:first_pts=0',
                            '-avoid_negative_ts', 'make_zero', str(output)], cwd=clips_dir)
                metadata = engine.probe(output)
                duration = float(metadata['format']['duration'])
                if abs(duration - item['duration']) > 2:
                    raise ValueError(f'Incomplete or oversized clip duration: {duration}s')
                if not any(s.get('codec_type') == 'audio' for s in metadata['streams']):
                    raise ValueError('No audio stream in normalized clip')
                result.update(status='rendered-unverified-cue', duration=duration)
                clips.append(output)
            except (ValueError, KeyError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
                output.unlink(missing_ok=True)
                result.update(status='failed', error=str(exc)[-1400:])
            report['clips'].append(result)
            print('::notice title=Official clip attempt::' + json.dumps(result).replace('%', '%25').replace('\n', '%0A'), flush=True)
        if len(clips) == len(targets):
            # Relative generated filenames avoid concat quoting bugs in workspace paths.
            manifest = clips_dir / 'official_concat.txt'
            manifest.write_text(''.join(f"file '{clip.name}'\n" for clip in clips))
            engine.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '1', '-i', str(manifest),
                        '-c', 'copy', '-movflags', '+faststart', str(final)], cwd=clips_dir)
            metadata = engine.probe(final)
            expected = sum(float(r['duration']) for r in report['clips'])
            if abs(float(metadata['format']['duration']) - expected) > 2:
                raise ValueError('Final montage duration differs from component durations')
            engine.run(['ffmpeg', '-v', 'error', '-i', str(final), '-f', 'null', '-'])
            report['complete_montage'] = True
            report['output_sha256'] = hashlib.sha256(final.read_bytes()).hexdigest()
    except (ValueError, KeyError, TypeError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        final.unlink(missing_ok=True)
        report['error'] = str(exc)[-2000:]
    temporary = report_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(report_path)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=WORK)
    parser.add_argument('--targets', type=Path, default=engine.TARGETS)
    args = parser.parse_args()
    report = render_montage(args.workspace, args.targets)
    return 0 if report['complete_montage'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
