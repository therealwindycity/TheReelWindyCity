# Civic evidence — hosted execution results

This update supersedes earlier statements that no live municipal sources had
been reached. The earlier Drive review and card reel remain historical,
archive-based artifacts, not a complete account of these later checks.

## GitHub execution

- [Pull request #34](https://github.com/therealwindycity/TheReelWindyCity/pull/34)
- [Completed hosted retrieval and official-video attempt](https://github.com/therealwindycity/TheReelWindyCity/actions/runs/41437221070)
- Branch: `arena/a243c6bf-thereelwindycity`

The hosted workflow retrieved all eight supplied document URLs, identified their
responses as PDFs, extracted their text, searched the existing compressed
720-record corpus, attempted the supplied YouTube clips, and attempted the four
publicly advertised official Granicus HLS streams. No private Drive credentials
or downloads were committed. No findings were automatically published.

The Actions run has an artifact named `civic-evidence-41437221070` containing
reports, extracted text and captured documents, retained for 14 days. A green
workflow result means the job and artifact collection completed; it does NOT
mean video extraction or factual verification succeeded. Detailed outcome files
and check annotations carry actual failure states.

## Confirmed document-content checks

1. **Debt packet:** The retrieved two-page draft contains the malformed
   `$1,000,0000.00` in an estimated annual payment clause, not the purported
   “Applicant debt service shall not exceed” sentence. Its title describes a
   loan application not exceeding $20 million. It is a draft, not proof of the
   signed final resolution. [Packet, page 2](https://cheyenne.granicus.com/MetaViewer.php?view_id=2&clip_id=1099&meta_id=148538).
2. **Fleet source labels:** Both supplied links return purchasing memos dated
   May 6, 2026, including the link originally labeled “minutes.” Their extracted
   text lists Fremont and Duval as bidders. The archived complete memo pages
   recommend Fremont, not Duval. [E-19 memo](https://cheyenne.granicus.com/MetaViewer.php?view_id=2&clip_id=1095&meta_id=147788),
   [E-20 memo](https://cheyenne.granicus.com/MetaViewer.php?view_id=2&clip_id=1095&meta_id=147790).
3. **Highlands incorrect minutes link:** The supplied DocumentViewer PDF is
   dated **July 14, 2025**, not July 13, 2026. [Incorrectly associated PDF](https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_6b34331c7eb6627291c3cdcfdee0ac7c.pdf&view=1).
   The supplied MinutesViewer link does return July 13, 2026 proceedings.
   [Correct-date minutes](https://cheyenne.granicus.com/MinutesViewer.php?view_id=2&clip_id=1120).
4. **Stormwater policy action:** The October 26, 2026 minutes, page 3, describe
   a resolution amending the General Fund Balance Policy for year-end review
   and **potential transfers** to the Stormwater Runoff Management System
   Account, up to an aggregate $10 million. They record:

   > Motion failed. Voting “no” – all members of the governing body with the
   > exception of Dr. Aldrich and Mr. White voting “yes”.

   This supports the failed policy-amendment action and those two explicitly
   named yes votes. It does not by itself prove that a specific immediate cash
   transfer was rejected or establish the supplied “7–2” tally.
   [October 26 minutes, page 3](https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_740ab3049f2e7e143ca88004317ff695.pdf&view=1).
5. **Other incorrect date association:** The second supplied stormwater
   DocumentViewer PDF is dated **March 23, 2026**, not October 26.
   [March proceedings](https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_2a5c2428a6390c52750d45788dfeb157.pdf&view=1).

## Linked transcript corpus

The compressed corpus already committed in `drive-import/` was searched in full:
720 records, 25 occurrences across seven target phrases. Its raw SHA-256 matches
the existing manifest. It is NOT byte-identical to the larger Drive JSON.

The June 1 Planning Commission transcript candidate contains the detailed-design
and “at my disposal” wording. Several later public-comment records repeat those
words as quotations. Candidate text needs original audio and speaker review;
repetition is not independent confirmation. Some attached-document arrays have
cross-year associations and cannot serve as verified citations.

## Actual media results

- All four supplied YouTube requests were rejected with a sign-in/bot challenge.
- Four official Granicus HLS URLs were discovered from the public player pages.
- All four direct FFmpeg attempts received **HTTP 403 Forbidden**.
- Therefore **no real-footage montage was produced**. Access controls were not
  bypassed, no browser cookies were requested, and unrelated video was not used.

The existing silent archive-card MP4 is an alternative explainer, not meeting
footage. Its unresolved October statement predates the hosted checks above and
must not be represented as the latest findings. Artifacts do not establish legal
violations or corrupt intent.

## Subsequent reliability audit

The pipeline now has a separate completion gate, source/date-role checks,
source-hashed named-vote extraction, safe parent-row UPSERTs, and a 56-test
regression suite. Routine workflow runs do not retry the known media barriers.
Source capture, inspection, render completion and editorial verification are
separate outcomes. A red source-association gate preserves artifacts and exposes
incorrect supplied links rather than treating artifact upload as full success.
