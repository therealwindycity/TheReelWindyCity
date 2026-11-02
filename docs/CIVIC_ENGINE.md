# Civic evidence engine

Run from the repository root:

```sh
python3 tools/civic_engine.py --restricted-network
python3 -m unittest discover -s tools -p test_civic_engine.py -v
```

The first command records this Arena sandbox's network restrictions without
attempting forbidden municipal/video hosts. Exit 2 means incomplete/blocked,
not a successful montage. The standard-library-only index/report needs no pip install.

Outputs (regenerable, Git-ignored):

- `arena_workspace/cheyenne_records.sqlite3`: four user-supplied case leads,
  eight document URL/status rows, and a votes schema. **No verified votes imported.**
- `arena_workspace/exports/evidence_posts_with_links.md`: explicitly unverified
  research drafts with supplied links and integer-second video deep links.
- `arena_workspace/exports/run_report.json`: retrieval and rendering outcomes.
- `arena_workspace/sources/`: bounded source captures with SHA-256 provenance
  when retrieval is possible. HTTP success does not authenticate content or claims.

## On a machine permitted to reach municipal and video hosts

Install FFmpeg (including ffprobe and the drawtext filter) using the platform's
package manager, then:

```sh
python3 -m pip install yt-dlp
python3 tools/civic_engine.py
```

This attempts bounded document retrieval and four video windows. Downloads use
explicit numeric start/end sections, not the supplied `start-+duration` syntax.
Clips are re-encoded to common 720p/30fps H.264/AAC streams with burned-in
**unverified research cue** lower thirds before concat. Missing audio, download,
normalization or concat failures are reported. No final MP4 is delivered unless
all four clips succeed. Outputs retain the requested montage filename, but that
filename is not a finding of corruption. No footage is fabricated or substituted.

Full network/video rendering was **not tested in this sandbox**: yt-dlp, ffmpeg
and ffprobe were absent, and municipal/YouTube hosts are outside its allowlist.
The unit tests cover indexing, timestamp generation, truthful drafts, restriction
handling, retrieval errors and missing tools; they do not establish video validity.

## Editorial limits

Targets are a user-supplied registry, not verified municipal evidence. Quotation,
date, document type, roll-call, legal applicability and clip context need review.
A malformed numeric string does not alone establish a $10 billion obligation;
an out-of-state bid does not alone establish a preference violation. A URL is
not a citation supporting every proposition merely because it is clickable.

The engine never promotes claims automatically to verified findings and does
not parse/verify votes from downloaded PDFs. The votes table remains empty until
source-grounded import is implemented; do not infer names or votes from prose.
No posts are published, messages sent, or videos uploaded by this tool.

## Finished archive-review package (Drive-based)

After downloading the five named Drive databases into the ignored `google_drive/`
folder, run:

```sh
python3 tools/review_drive_civic.py
python3 -m venv .venv
.venv/bin/python -m pip install Pillow imageio-ffmpeg
.venv/bin/python tools/package_civic_review.py
```

The packaging tool makes corrected social copy, a 50-second silent vertical
text-card MP4, and `arena_workspace/exports/civic_evidence_package.zip`. The video
is explicitly **not meeting footage** and does not authenticate the supplied
meeting cues. It uses the FFmpeg binary distributed by imageio-ffmpeg through
PyPI, without requiring a system-wide install. A complete decode is checked.

The ZIP includes the read-only review's derived SQLite index, full selected-page
excerpts, inventory and hashes, status report and corrected posts. Drive originals
are not modified. No automatic posting or uploading occurs.

On November 2 the Drive text-extraction tool explicitly rejected the
143,553,641-byte linked JSON because of its 25 MB extraction cap. The advised
`return_download_url` option is absent from the exposed download tool schema;
there is no supported override in this session. The large JSON and vault remain
unsearched. Original source PDFs and target meeting footage remain unavailable.

## GitHub-hosted retrieval (outside Arena's network allowlist)

`.github/workflows/civic-evidence.yml` runs on this session branch when its
pipeline files change, or by manual dispatch once registered by GitHub. It
installs FFmpeg/yt-dlp, runs tests, searches the committed compressed corpus,
attempts public Granicus retrieval and the supplied video sections, and retains
reports/source captures as a 14-day Actions artifact. It does not commit media,
change the private Drive originals, publish allegations, or upload to social
accounts. Its job summary explicitly reports incomplete video outcomes even
when the artifact-upload job succeeds. Downloaded sources remain unverified.

```sh
gh run list --workflow civic-evidence.yml --branch arena/a243c6bf-thereelwindycity
gh run download RUN_ID --dir arena_workspace/github-run
```

The repository ALREADY contains a compressed linked corpus at
`drive-import/master_meetings_database_linked.json.gz`: 720 records, raw SHA-256
`912c801ca8fd9e965a454dd1d3ec9c85dff22b69445e8ec3f09caef966d4fbec`.
`python tools/search_linked_civic.py` searches the text and exports contextual
passages with record, turn and character-offset locators. This older local copy
has 143,461,727 raw bytes, not the Drive copy's 143,553,641 bytes, so they must
not be represented as identical. A seven-term full search found 25 occurrences.

Important update to the earlier bounded review: Highlands design/disposal
wording DOES occur in the local linked corpus. The June 1 Planning Commission
record is a candidate for original context; several other occurrences are later
public commenters quoting it. Speaker/date/audio verification is still needed.
Some document-association arrays include unrelated years; those arrays cannot
be treated as verified source links. Earlier statements that the large corpus
was unsearched applied to the Drive download, not this subsequently discovered
compressed repository copy.
