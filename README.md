# Civic Cheyenne — Your city. Your seat at the table.

**Live site: [therealwindycity.github.io/TheReelWindyCity](https://therealwindycity.github.io/TheReelWindyCity/)**

An independent, source-backed civic learning experience built around **real Cheyenne, Wyoming
City Council sessions**. Step inside an actual archived meeting, read the original ordinances,
follow the recorded actions, and trace proposed impacts across the city — no invented officials,
decisions, or statistics.

The guided session covers the **January 26, 2026 regular City Council meeting** (five ordinances,
three reading stages), the meeting workspace opens on the **next scheduled meeting with a posted
agenda**, and the source library indexes the complete public-record archive below.

## Live Government Hub

The dedicated hub is published as its own small set of crawlable pages under [`/hub/`](https://therealwindycity.github.io/TheReelWindyCity/hub/):

* **Live desk (`/hub/`)** puts the current captured agenda beside a source-window switchboard for Granicus, an archived Council video, Broadcastify, the National Weather Service, and WYDOT. It loads one external iframe at a time, names the publisher, and keeps a direct-source link available when a publisher blocks embedding.
  * Publisher windows are **click-to-load**: the frame is present in the markup but carries no `src` until you press *Load window*, so nothing is requested from a third party on page view. Once open, a *Reload* control and the direct-source link stay available, and the address bar tracks the selected window (`/hub/#source-scanner`) so a single source can be linked and re-found.
  * Pages that show posted agenda items carry a **record-snapshot freshness note** with the snapshot date and its age, so a stale capture is visible rather than implied.
* **Meetings (`/hub/meetings/`)** summarizes posted agenda items and teaches the agenda → meeting → minutes/adopted-text sequence. Agenda entries remain proposals until the official record establishes an outcome.
* **Live signals (`/hub/signals/`)** reuses the Wyoming Pulse syndication desk for agency alerts, scanner metadata, weather, roads, wildfire/seismic sources, and Wyoming newsroom feeds. Inside the same desk, the **Incident Record Lens** reads the historical Cheyenne Police Department / Laramie County Sheriff Citizen Connect archive through weekday/hour patterns, per-day trends, call-type mix, and ward/response-area workload. Third-party relays are contextual, not official dispatch; the historical lens is not an emergency service.
* **Learn the record (`/hub/learn/`)** is a short civic field guide with an interactive knowledge check on source authority, meeting stages, and transcript verification.

The hub is an independent learning tool, not a City of Cheyenne service. External sites control their own availability, embedded-player policies, and update cadence; emergencies should be directed to 911 or the responsible authority.

## MyNewSpace profile page

[`/mynewspace/`](https://therealwindycity.github.io/TheReelWindyCity/mynewspace/) is a separate, self-contained
surface on the same Pages deployment: a 2006 profile-page format whose fields are filled from this repository's
archive, plus a **customization studio** so a visitor can restyle their own view.

* **The record is the content.** The identity table, the meeting count, the Top 8 (the eight largest Wyoming
  municipalities by the WAM directory figure), the "who I'd like to meet" list (the `fail-closed` majority of the
  catalog), and the Friend Space entries (the January 26, 2026 ordinance items with their recorded outcome and
  Granicus links) are read out of `src/data/meetings.json` and the ecosystem catalog at build time. Nothing on the
  page is invented to fit the theme, and the record-snapshot freshness note rides along.
* **Arena is the code generator.** The studio's Arena window is click-to-load and ships with no `src`, so no request
  leaves the browser until a visitor asks for it — and because Arena publishes no embed-widget endpoint, the frame URL
  is an editable setting with a direct-link fallback, and the page says plainly that a `frame-ancestors` refusal from
  the other origin is expected, not a bug. Four prompt recipes and a copyable **data sheet** of the page's real values
  go with it, so generated CSS is written against the actual numbers instead of placeholders.
* **The code console is the part that always works.** Pasted CSS and HTML are applied live. CSS is stripped of
  `expression()`, `behavior:`, `-moz-binding`, `@import`, `data:` URLs and any literal `</style>`; the HTML module is
  rendered in a `srcdoc` iframe with `sandbox` and no same-origin access, so a `<marquee>` still scrolls but the
  module cannot read the page or its storage. Module order and hiding are applied through CSS `order` and
  `display:none`, which means the exported document never changes shape for anybody else.
* **There is no server to save to.** Everything a visitor writes lives in `localStorage` under `mynewspace.custom.v1`
  and is labelled "yours" where it replaces a published value. The Friend Space composer is a note-to-self, not a
  comment system, and the masthead says so. The page is a format homage: wordmark, layout language, and palette are
  paraphrase, with a non-affiliation note in the chrome.

* **One image, clearly marked.** The blurb photo is a generated illustration in the register of a 2006 camera-phone
  snapshot, and the page stamps it "GENERATED ILLUSTRATION · NOT A RECORD PHOTO". A source-backed project does not get
  to pass a synthetic picture off as an archival document, so it is labelled at the point of use rather than in a
  footnote.

`tests/seo-audit.mjs` locks the export (canonical, single `<h1>`, unfired iframe, sanitization notes), and
`tests/civic-smoke.mjs` drives the studio in a browser: it asserts the frame has no `src` before the click, that a
hostile stylesheet payload cannot break out of the injected `<style>` tag, that the custom module stays sealed, and
that a saved theme survives a reload and can be reset back to the published profile.

## Wyoming ecosystem

Cheyenne is the only government whose watcher is switched on. The statewide catalog at [`/hub/wyoming/`](https://therealwindycity.github.io/TheReelWindyCity/hub/wyoming/) plots the other doors instead of pretending they are the same Granicus table.

* **23 counties and 99 incorporated municipalities.** County clerk sites come from the WYDOT county-clerk publication. Municipal phones, addresses, and directory figures come from the Wyoming Association of Municipalities 2026 directory, except La Barge, which that HTML listing omitted and which is included from Census/Wikipedia with no population figure (the Wikipedia page disagrees with itself).
* **Every county office in the WCCA handbook pattern** — commission, clerk, treasurer, assessor, clerk of district court, sheriff, county and prosecuting attorney, coroner — is listed as a pattern, not a roster of people. Municipal pages add a mayor and a council as a catalog model. Extra boards appear only where a public page was opened or this repository already indexed them.
* **Architecture is the difference.** Granicus ViewPublisher (Cheyenne, live), CivicPlus Agenda Center (Laramie, Green River), a CivicPlus CMS page that is not Agenda Center (Jackson), a clerk file index with two portals (Casper), a PDF packet folder (Gillette — a Granicus invoice inside a packet is not a ViewPublisher), an unidentified clerk page (Cody, Sheridan), and fail-closed everywhere else. County sites are published; commission software was not opened, so no county watcher is attached. Eight counties have more than one published host. A future watcher would pin one and fail closed on an unexpected redirect.
* **The watcher is not copied.** A daily job (`npm run sync:wyoming`, scheduled in `live_wyoming_watch.yml`) checks every government on its own door. Cheyenne stays on the hourly Granicus watch. Calibrated pages are hashed. County clerk hosts are checked for a move. Everyone else is recorded and not fetched. The job does not promote a meeting into the public snapshot. Downloadable reference points: [`public/maps/wyoming-government-sites.geojson`](public/maps/wyoming-government-sites.geojson). Markers are not boundaries. Tribal governments, school boards, and special districts are named as out of scope rather than folded into a county.
* **Clicking a city or county opens that civic.** `/civic/places/casper/` and `/civic/counties/albany/` are not a relabel of Cheyenne. The wordmark, archive, and links follow that government. Cheyenne’s guided ordinances stay on the homepage.
* **Copied documents get their own archive.** `live_place_archives.yml` copies same-host public files into `public/place-docs/<layer>/<id>/`. After 250 files it opens the next volume. A separate `civic-wy-*` GitHub repo is created when `PLACE_ARCHIVE_TOKEN` can create repositories. This checkout’s token cannot, so the files stay in this repository until that token is set.

`npm run data:ecosystem` rewrites the catalog JSON and GeoJSON from `scripts/data/wyoming-ecosystem-catalog.mjs`. `npm run test:ecosystem` locks the 23/99 counts, the single live watcher, and the map.

## Meeting coverage — indexed public records, 2008 → present

The meeting index (`src/data/meetings.json`, generated by `scripts/build-data.mjs`) combines the
committed archive snapshots, committee-document sets, timestamped transcripts, and a curated snapshot
of official links captured on October 3, 2026. It keeps same-day City Council sessions distinct.

| Body | Meetings | Coverage |
| --- | ---: | --- |
| City Council | 526 | **May 27, 2008 → September 28, 2026** (specials & budget sessions included) |
| Finance Committee | 123 | January 4, 2022 → **October 6, 2026 (upcoming)** |
| Public Services Committee | 119 | January 5, 2022 → **October 5, 2026 (upcoming)** |
| Work Sessions / Committee of the Whole | 115 | October 3, 2018 → August 28, 2026 |
| Board of County Commissioners | 58 | January 2, 2024 → March 17, 2026 |
| Planning Commission | 47 | January 11, 2024 → July 6, 2026 |
| Historic Preservation Board | 7 | January 13 → July 14, 2026 |
| Board of Adjustment | 6 | January 15 → July 16, 2026 |
| Urban Renewal Authority | 2 | February 5 → May 7, 2026 |

**1,003 meeting entries · 5,118 archived documents · 85 transcript files** (84 dated transcript
attachments across 82 meetings and one undated transcript whose meeting date is not established).
These are reproducible counts from the committed repository snapshots and official-links snapshot;
the former 948-entry README total was stale. Meeting IDs are keyed by government body, date, and
explicit session note; the archive is not padded with unverified placeholders to match another tally.
The next posted meetings are Public Services Committee, Monday October 5 (11 agenda items), and
Finance Committee, Tuesday October 6 (6 agenda items).

Each meeting links to available official agendas, minutes, and video, plus repository documents and
a timestamped transcript where one exists. The archive transcript snapshot currently covers 82
meetings; of 134 meeting records with video links, 83 have no transcript in the source material
(74 from 2025 and 9 from 2026: 46 YouTube and 37 Granicus). `npm run transcripts:fetch` can opt in to a caption-only YouTube import;
Granicus is not polled or scraped, and supplied VTT files can be imported by meeting ID. Imported
transcripts are stored in this repository and copied into the static site at build time. Meeting
pages do not load third-party video until a visitor explicitly chooses the player. Upcoming agendas
and their access details are shown as posted; agenda items are proposals, not recorded decisions.

## Data — built from the public-record repositories

Meeting records and transcripts shown by the site are drawn from these GitHub repositories
(all owned by [`therealwindycity`](https://github.com/therealwindycity)). The signals desk also
bundles public aggregate data from the official Citizen Connect publisher; it is documented below.

| Repository | Contents |
| --- | --- |
| [cheyenne-archives-2025-2026](https://github.com/therealwindycity/cheyenne-archives-2025-2026) | Council & other body meeting records, 2025–2026 |
| [The-Real-Windy-City-](https://github.com/therealwindycity/The-Real-Windy-City-) | Timestamped 2026 meeting transcripts and transcript variants |
| [TheReelWindyCity](https://github.com/therealwindycity/TheReelWindyCity) | Site source, generated caption imports, and the local transcript cache (when populated) |
| [cheyenne-archives-2023-2024](https://github.com/therealwindycity/cheyenne-archives-2023-2024) | Meeting records, 2023–2024 |
| [cheyenne-archives-2022](https://github.com/therealwindycity/cheyenne-archives-2022) | Meeting records, 2022 |
| [cheyenne-archives-2018-2021](https://github.com/therealwindycity/cheyenne-archives-2018-2021) | Meeting records, 2018–2021 |
| [cheyenne-archives-2014-2017](https://github.com/therealwindycity/cheyenne-archives-2014-2017) | Meeting records, 2014–2017 |
| [cheyenne-archives-2008-2013](https://github.com/therealwindycity/cheyenne-archives-2008-2013) | Meeting records, 2008–2013 |

* **Repository indexes** (`public/data/<repo>.json`) are complete git-tree snapshots, refreshed from
  GitHub with `npm run data:refresh` (requires the [`gh` CLI](https://cli.github.com)) and assembled
  by `npm run data:assemble`.
* **Meeting index** (`src/data/meetings.json`) merges meeting folders, committee documents, and
  transcripts from those repositories with the curated official-links snapshot
  (`src/data/official-meetings.json`), including meetings with posted agendas. The generated JSON is
  rebuilt during development, type-checking, and production builds; it is not committed.
* **Official documents for the guided session** ship with the site in `public/sources/`:
  the January 26 agenda capture (the archived agenda page), the official Record of Proceedings for
  January 26, 2026, and the Chapter 1.28 administrative-inspection-warrants policy brief.
* **Transcripts** preserve creator-provided or auto-generated captions, labeled by source and stored
  in Git. The opt-in `npm run transcripts:fetch` step uses `yt-dlp` to fetch subtitles only (never
  meeting audio/video); it is not part of `npm run build` or a page view. A WebVTT import can attach
  Granicus captions by exact meeting ID without polling that service. Locally committed caption
  files are served from the static site, shown as timestamp-linked excerpts, and included in the
  semantic-search compiler when `npm run data:embed` is run. Verify names and quotations against
  official minutes and video before quoting.
* **Wyoming Pulse** is the statewide news desk in the app. It groups source-linked headlines into
  nine moving sector streams (statewide, government, public safety, weather, roads, energy/land,
  schools/health, community/economy, and Wyoming sports). The ten publisher feeds are Oil City News,
  Cap City News, WyoFile, Buckrail, County 10, SweetwaterNOW, Wyoming Public Media, K2 Radio,
  Cowboy State Daily, and WyoPreps; NWS alerts and WYDOT travel events are checked separately. `scripts/build-pulse-data.mjs`
  collects RSS during static builds into an ignored `public/data/wyoming-pulse.json` asset, so the
  browser does not depend on publisher CORS support. The Pages workflow republishes that snapshot
  hourly; `npm run data:pulse` refreshes it manually. Each sector marquee opens its source-linked
  archive. The browser retains up to 12 months / 600 headlines locally, combining the publisher's
  current feed window with snapshots seen on that device; this is a reader-side archive, not a
  server-wide historical database. A dated, verified October 2026 seed keeps the desk populated
  when upstream feeds are unavailable, and is clearly labeled as a snapshot — the desk shows
  `DATED SNAPSHOT · <date>` unless at least one live source answered, and only then
  `LIVE SOURCES · UPDATED <time>`. Add newly verified stories to the fallback with
  `node scripts/refresh-pulse-seed.mjs <stories.json> [--captured-at YYYY-MM-DD]`, which rejects
  anything that is not an https, source-linked, dated story.
* **Presentation styles** are available from the sitewide Appearance control: Prairie, Newsroom, Field Notes, Terminal, Glacier, Sunset, High Contrast, Blueprint, Garden, and Monochrome. Each changes navigation and information layout as well as typography and palette: examples include an editorial top masthead, a narrow reading column, icon rails, a floating bottom dock, and a modular board. All styles keep the same records, source links, and tools. The selected style is stored in that browser and synchronized across its open tabs; the experience avoids engagement streaks and urgency tricks.
* **Client-side semantic search** (`src/lib/vectorSearch.ts`) runs MiniLM (`Xenova/all-MiniLM-L6-v2`)
  entirely in the browser via WebAssembly. `scripts/embed-transcripts.mjs` compiles `transcript-tree.json`
  plus timestamped caption chunks, ordinances, and recent meetings into `src/data/transcript-vectors.json`
  so the browser only embeds the query. No API keys, no server embeddings.

## Citizen Connect historical record lens

The `/hub/signals/` page places a historical record lens directly in the Wyoming Pulse desk, immediately
beneath the Cheyenne/Laramie scanner console. It uses the agencies’ own public
[Citizen Connect dashboard](https://laramiecounty-letmsp.connect.socrata.com/) and its public JSON API —
not scanner transcripts, third-party crime scores, or a scrape of private Socrata tables.
The filter selection follows the supplied dashboard link: both agencies, Incidents and Cases, the selected
category ranges, 2020-01-01 through the latest requested day, Wards, and no restricted-place layer.

The bundled seed (`src/data/citizen-connect.json`) includes exact full-window totals and the complete
7 × 24 weekday/hour grid. The scheduled `citizen_connect_sync.yml` then fills the date-by-date, monthly,
and yearly series from the publisher’s aggregate endpoint, and rebuilds call-type, agency, and boundary
counts from record-level public pins starting in 2023 (the substantive data era). Record-level responses
are checkpointed in the ignored `.cache/citizen-connect/`; raw detail rows are not committed. Only the
aggregate trends, grouped breakdowns, boundary totals, and a tiny illustrative sample are bundled into
the static site. Run the heavier first pass manually with `npm run data:citizen-connect:full`; rebuild the
public copy with `npm run data:assemble`. `npm run data:citizen-connect:plan -- --mode records --start 2020-01-01 --end 2026-10-04 --records-start 2023-01-01`
prints an offline request plan without contacting the publisher.

The lens compares per-occurrence weekdays, hours against their share of the clock, full-year per-day rates,
call-type concentration, and workload counts by boundary. It deliberately does **not** call dispatch volume
“crime,” treat Cases as a one-to-one conversion from Incidents, infer risk from unadjusted ward counts, or
claim the publisher’s blurred pin locations are addresses. The agencies say sexual assaults and juvenile
matters are withheld and names/addresses are removed; the source refreshes roughly every three days.
Read the Method & limits tab and open the original dashboard before citing a figure. This is historical
public information, not dispatch or emergency guidance.

## Live municipal sync pipeline

A red-teamed, fail-closed pipeline watches for newly posted agendas and prepares analysis and
citizen-action drafts — without ever letting a bad run touch the deployed site:

* **Watch** (`.github/workflows/live_city_watch.yml`, hourly): parses the city's Granicus
  "Upcoming Events" table into semantic records and hashes the **canonical content** — session ids,
  nonces and tracking parameters are invisible by design, so a churning DOM cannot spam builds.
  A broken fetch fails closed instead of reading as "no changes".
* **Sync** (`.github/workflows/live_city_sync.yml`): on a real change (or an external
  `repository_dispatch`), extracts the agenda PDF with a **layout-aware engine** (columns stay
  columns; scanned/password-protected/corrupt uploads fail with typed errors and write nothing),
  runs an **evidence-cited red-team analysis** (deterministic rules by default; an optional LLM
  pass is quarantined behind the same verbatim-quote gate), generates **mailto-only** objection
  drafts (no portal automation, no guessed addresses), and commits to `data/meetings/` only after a
  structural validator confirms every artifact — all under a single-flight concurrency group.

Pipeline artifacts live under `data/` and are never read by the site build, so the public site
cannot break from a sync. Promoting agenda data into the curated snapshot stays a human-reviewed
step. Full finding-by-finding design notes: [`docs/live-sync-architecture.md`](docs/live-sync-architecture.md).
Regression suite: `npm run test:sync` (runs in CI).

## Search indexing

The site publishes canonical URLs, descriptive search/social metadata, a square Civic Cheyenne
favicon, and truthful `WebSite` structured data from `src/app/layout.tsx`. In addition to the
interactive application, `/meetings/` is a crawlable archive directory and `/meetings/<meeting-id>/`
contains a statically rendered page for **every indexed meeting**. The `/transcripts/` directory
indexes all timestamped transcript files and preserved transcript variants. The sitemap at
`https://therealwindycity.github.io/TheReelWindyCity/sitemap.xml` lists the homepage, meeting and transcript directories, four standalone Live Government Hub pages, and all meeting pages. Each meeting page links to its official records, its associated repository documents, and every attached transcript without inventing actions or outcomes. Every sitemap entry
carries a `<lastmod>` set to the archive snapshot date (`captured` in `src/data/meetings.json`), not to
build time — Google discounts a lastmod that is simply "now" on each deploy — with `daily` change
frequency for still-changing posted agendas and `yearly` for settled historical records.

The interactive app is the same document for every meeting, so it does not mint a URL per record. The
"Open this meeting in Civic Cheyenne" links on each record page use `/?meeting=<meeting-id>`; while a
meeting is selected the app rewrites its canonical link to that meeting's `/meetings/<id>/` page, so the
parameterized deep link consolidates onto the crawlable record page instead of competing with the
homepage.

**Submit exactly this URL in Google Search Console:**
`https://therealwindycity.github.io/TheReelWindyCity/sitemap.xml`. The domain root
(`https://therealwindycity.github.io/sitemap.xml`) is not a sitemap — it is a GitHub Pages 404 — so a
root URL submitted there reports a fetch error instead of indexing the site. When a previously
submitted sitemap is listed in Search Console, remove the stale entry and resubmit the URL above so
Google re-reads the current file rather than reporting the old fetch.

`src/app/robots.ts` publishes `robots.txt` at the project path, naming that sitemap in full and
allowing all crawlers. Two limits are worth knowing before relying on it: crawlers read `robots.txt`
only from the host root, and GitHub Pages serves nothing at
`https://therealwindycity.github.io/robots.txt` for a project site — a 404 there means "no crawl
rules", so nothing in this repository can block or unblock Googlebot at the host root. The file exists
so the sitemap is discoverable to tools that read it, to make the intent explicit, and to be ready to
copy into a `therealwindycity.github.io` user-site repository if a host-root `robots.txt` is ever
wanted. Index/follow directives are emitted in page metadata. The Google HTML-file ownership check is
served from `public/googlee2d9fc23b9d6b0f7.html`.

`npm run seo:live` verifies the **published** files rather than the build output — that the deployed
sitemap is reachable, advertises this exact host and base path, lists at least as many pages as the
archive requires, and that `robots.txt` names it. The deploy workflow runs the same check after
`actions/deploy-pages`, so a deploy that would leave Search Console reading the wrong sitemap fails
loudly instead of going unnoticed. Use `--mirror` to audit a local export served under a different
host.

Search Console verification establishes site ownership but does not guarantee indexing. After
verification, submit the sitemap, inspect the archive and key meeting URLs, and use **Request
indexing** for priority pages if appropriate. Indexing is not the same as ranking: a page can be
crawled and still reported as *Crawled — currently not indexed* when Google judges it thin or
duplicative, so the audit below checks that every exported record page carries real content.

`npm run test:seo` audits the whole exported surface after `npm run build` (and runs in CI on every
push): that every meeting in the index has a static page with a unique title and canonical URL under
the project path, valid `WebPage`/`BreadcrumbList` structured data, a linked source document for every
document in the index, a link from the `/meetings/` archive, and a sitemap entry with an honest
lastmod. Run it locally with the same base path as the deployment:

```bash
NEXT_PUBLIC_BASE_PATH=/TheReelWindyCity npm run build
npm run test:seo
```

## Development

```bash
npm install
npm run dev            # http://localhost:3000
```

Other scripts:

```bash
npm run build          # static export into out/ (what GitHub Pages serves)
npm run preview        # serve the out/ directory locally
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run data:refresh   # re-pull repository indexes from GitHub
npm run data:assemble  # rebuild public/data from src/data snapshots
npm run data:embed     # compile repository + local transcript captions into MiniLM vectors
npm run transcripts:report # list video-linked meetings still missing transcript files
npm run transcripts:fetch  # opt-in: fetch YouTube subtitles only (requires yt-dlp)
# Local Granicus import: node scripts/harvest-transcripts.mjs --import-vtt ./captions.vtt --meeting '<meeting-id>'
npm run test:vectors   # schema + citation checks on the compiled semantic index
npm run test:e2e       # Playwright smoke tests (start the site first; see below)
npm run test:seo       # audit the exported out/ surface (run after npm run build)
```

Smoke tests expect the site at `http://127.0.0.1:3000` (override with `BASE_URL`):

```bash
npm run build && PORT=3000 node scripts/serve.mjs out &
npm run test:e2e
```

## Deployment — GitHub Pages

The site is a fully static export (`output: "export"`), deployed to **GitHub Pages** by
`.github/workflows/deploy-pages.yml` on every push to `main`. The workflow builds with
`NEXT_PUBLIC_BASE_PATH=/<repo-name>` so it works at `https://<owner>.github.io/<repo>/`.

To enable Pages for a fork: **Settings → Pages → Source: GitHub Actions** (the workflow also
enables this automatically via the API when run by a maintainer).

### How the static site replaces server features

| Original (server) | This deployment (static) |
| --- | --- |
| PostgreSQL notebook API | Browser `localStorage` notebook (reflections never leave the browser; exportable as JSON) |
| `/api/archive` live GitHub trees | Bundled repository indexes in `public/data/` |
| `/api/sources/content` proxy | Direct `raw.githubusercontent.com` loads in the visitor's browser, with client-side format sniffing (archived HTML-as-PDF pages render in sandboxed frames) |
| `/api/official-source` | Static documents in `public/sources/`, with graceful “open the original source” links where no local copy exists |
| Profile customization (accounts, profile-HTML box, comments) | Arena window + code console writing to browser `localStorage`; no accounts, no moderation queue, no upload path |

## Notes & disclaimers

* `/mynewspace/` is an affectionate parody of the 2006 profile-page *format*. It is not affiliated with, endorsed by,
  or derived from MySpace or its owner; the name, layout language, and colours are paraphrase.
* A civic learning experience, **not an official city service**. Proposed effects are described
  from the public record; no rent, tax, traffic, or development estimates are invented.
* Map markers and circles show general scope only — not surveyed parcel boundaries or the
  official zoning map.
* An agenda entry or second-reading approval is not proof of enactment; check later minutes and
  adopted text for current legal status.
* The DM Sans typeface is licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
  MapLibre GL JS is BSD-3-Clause (`public/maps/LICENSE-maplibre.txt`). Map tiles by
  [OpenFreeMap](https://openfreemap.org) (OpenStreetMap contributors).
