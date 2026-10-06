# Locally archived meeting captions

This folder contains timestamped transcript files committed to the Civic Cheyenne repository. Files are named with the exact meeting ID from `src/data/meetings.json`; the build rejects unmatched IDs rather than guessing a date or government body.

Add genuine WebVTT captions with the opt-in importer:

```sh
node scripts/harvest-transcripts.mjs --report
node scripts/harvest-transcripts.mjs --fetch-youtube --limit 10
node scripts/harvest-transcripts.mjs --import-vtt ./captions.vtt --meeting <meeting-id>
```

`--fetch-youtube` downloads captions only, never audio or video, and is not part of a site build or page view. Granicus recordings are not fetched automatically; import a verified, locally obtained VTT when available. Imported text is labeled with its source and should be checked against the official minutes and recording before quotation.
