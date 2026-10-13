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

## Run it in GitHub Actions (no laptop needed)

`stream_transcribe.py` listens to a public live stream on a GitHub runner, transcribes each 30-second window, and commits and pushes it to the branch you start from. Workflow: `.github/workflows/live_meeting_transcribe.yml` (manual trigger only).

1. Start it from the Actions tab: **Live Meeting Transcribe (stream to transcript)** > **Run workflow**. Choose the branch, paste the stream URL if it differs from the default, and set minutes (up to 300).
2. Commits land on that branch under `live-transcripts/<date>-cheyenne-council/`.
3. Refresh the branch on your phone or in the repo, or ask the session to read the newest `chunks/` files.

Limits:

- **Zoom is not supported.** Zoom meetings are not public streams, and a bot joining as a participant is not something this repo does. The City streams Council meetings on YouTube and Facebook. The default URL is `https://www.youtube.com/@TheCityofCheyenne/live`. If the live URL changes, paste the exact `watch?v=` link into `stream_url`.
- **YouTube may refuse datacenter IPs.** GitHub runners can get "confirm you're not a bot" errors from YouTube. If the run logs show that, the fallback is to run `stream_transcribe.py` from your own machine, or to use the City's own HLS URL.
- **YouTube terms.** Downloading media from YouTube outside its download features is restricted by its terms of service. Using yt-dlp this way is a gray area. Use it for your own transcription of a public meeting, don't redistribute the audio, and consider asking the City for an official feed.
- **Timing.** Windows are timestamped in Mountain time (`TZ` is set in the workflow). After a restart, the timeline is approximate and the restart is logged.
