# Civic Cheyenne — Your city. Your seat at the table.

An independent, source-backed civic learning experience built around **real Cheyenne, Wyoming
City Council sessions**. Step inside an actual archived meeting, read the original ordinances,
follow the recorded actions, and trace proposed impacts across the city — no invented officials,
decisions, or statistics.

The guided session covers the **January 26, 2026 regular City Council meeting** (five ordinances,
three reading stages), and the source library indexes the complete public-record archive below.

## Data — built from the public-record repositories

Every record shown by the site is drawn from these GitHub repositories
(all owned by [`therealwindycity`](https://github.com/therealwindycity)):

| Repository | Contents |
| --- | --- |
| [cheyenne-archives-2025-2026](https://github.com/therealwindycity/cheyenne-archives-2025-2026) | Council & other body meeting records, 2025–2026 |
| [The-Real-Windy-City-](https://github.com/therealwindycity/The-Real-Windy-City-) | Verbatim timestamped 2026 meeting transcripts (with official video links) |
| [cheyenne-archives-2023-2024](https://github.com/therealwindycity/cheyenne-archives-2023-2024) | Meeting records, 2023–2024 |
| [cheyenne-archives-2022](https://github.com/therealwindycity/cheyenne-archives-2022) | Meeting records, 2022 |
| [cheyenne-archives-2018-2021](https://github.com/therealwindycity/cheyenne-archives-2018-2021) | Meeting records, 2018–2021 |
| [cheyenne-archives-2014-2017](https://github.com/therealwindycity/cheyenne-archives-2014-2017) | Meeting records, 2014–2017 |
| [cheyenne-archives-2008-2013](https://github.com/therealwindycity/cheyenne-archives-2008-2013) | Meeting records, 2008–2013 |

* **Repository indexes** (`public/data/<repo>.json`) are complete git-tree snapshots, refreshed from
  GitHub with `npm run data:refresh` (requires the [`gh` CLI](https://cli.github.com)) and assembled
  by `npm run data:assemble`.
* **Official documents for the guided session** ship with the site in `public/sources/`:
  the January 26 agenda capture (the archived agenda page), the official Record of Proceedings for
  January 26, 2026, and the Chapter 1.28 administrative-inspection-warrants policy brief.
* **Transcripts** are auto-generated captions, lightly de-duplicated — names and quotations should
  be verified against the official meeting video.

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
npm run test:e2e       # Playwright smoke tests (start the site first; see below)
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

## Notes & disclaimers

* A civic learning experience, **not an official city service**. Proposed effects are described
  from the public record; no rent, tax, traffic, or development estimates are invented.
* Map markers and circles show general scope only — not surveyed parcel boundaries or the
  official zoning map.
* An agenda entry or second-reading approval is not proof of enactment; check later minutes and
  adopted text for current legal status.
* The DM Sans typeface is licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
  MapLibre GL JS is BSD-3-Clause (`public/maps/LICENSE-maplibre.txt`). Map tiles by
  [OpenFreeMap](https://openfreemap.org) (OpenStreetMap contributors).
