# Live meeting transcript pusher

`live_capture.py` records a meeting's audio from a loopback device, transcribes each 30-second window locally, and commits and pushes the text to `live-transcripts/<date>-<meeting>/` on your checked-out branch.

It runs on **your** machine. The build sandbox cannot reach zoom.us or the city's Granicus portal.

## One-time setup (about 5 minutes)

1. Install ffmpeg and the transcriber:
   - macOS: `brew install ffmpeg && pip3 install faster-whisper`
   - Linux: `sudo apt install ffmpeg && pip3 install faster-whisper`
   - Windows: install ffmpeg, then `pip install faster-whisper`
2. Route meeting audio to a loopback device:
   - macOS: install BlackHole 2ch. In Audio MIDI Setup, create a Multi-Output Device that includes your speakers and BlackHole so you can still hear the meeting. Find the device name with `ffmpeg -f avfoundation -list_devices true -i ""`.
   - Linux: use the PulseAudio monitor of your output (`pactl list short sources`, then the `.monitor` name).
   - Windows: enable "Stereo Mix" or install VB-Cable.
3. Confirm git can push to the branch without prompts: `git push --dry-run origin <branch>`.

## Run

```bash
cd TheReelWindyCity/scripts/live-meeting
python3 live_capture.py --platform avfoundation --input ":BlackHole 2ch" --repo ../.. --meeting cheyenne-council
```

Use `--no-push` to test without pushing. Use `--model base.en` on slower laptops. Ctrl+C stops recording and flushes the last window.

## What gets pushed

- `live-transcripts/<date>-cheyenne-council/transcript.md`: running transcript with clock times.
- `live-transcripts/<date>-cheyenne-council/chunks/NNNN.md`: one file per 30-second window.

Raw audio stays in a temp folder outside the repo and is deleted after each window unless you pass `--keep-audio`.

## Accuracy limits

- This is automatic speech recognition. Names, dollar figures, and ordinance numbers will contain errors. Before you quote anything in a public comment, check it against the official recording or the agenda packet.
- Timestamps are wall-clock times on your machine, not the meeting's internal clock.
- Pushes are public if the repo is public. Check the meeting's recording and public-comment rules before publishing.

## Self-test (no audio hardware)

```bash
python3 live_capture.py --replay ./samples --stub --no-push --repo ../..
```
