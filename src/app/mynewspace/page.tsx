import type { Metadata } from "next";
import {
  Building2,
  CalendarClock,
  FolderLock,
  Heart,
  Music2,
  Phone,
  Star,
  Users,
} from "lucide-react";
import HubSnapshotFreshness from "@/components/hub-snapshot-freshness";
import NewspaceStudio from "@/components/newspace-studio";
import NewspaceWall, { type WallEntry } from "@/components/newspace-wall";
import { NewspaceCustomModule, NewspaceSong, NewspaceText } from "@/components/newspace-live";
import {
  DEFAULT_ARENA_URL,
  NEWSPACE_DEFAULTS,
  type NewspaceModule,
} from "@/lib/newspace";
import {
  GUIDED_MEETING_ID,
  MEETINGS,
  MEETINGS_CAPTURED,
  MEETING_STATS,
  NEXT_MEETING,
  ORDINANCES,
  UPCOMING_MEETINGS,
  asset,
  getMeeting,
} from "@/lib/civic-data";
import { COUNTIES, ECOSYSTEM_CAPTURED, MUNICIPALITIES, countyById, placeById } from "@/lib/wyoming-ecosystem";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

const canonical = siteUrl("mynewspace/");
const CHEYENNE = placeById("cheyenne");
const CHEYENNE_COUNTY = CHEYENNE ? countyById(CHEYENNE.countyId) : undefined;

/**
 * The profile's published text. These five strings are the fallbacks the studio
 * offers to overwrite, so they are declared once and shared with both halves.
 */
const MODULE: NewspaceModule = {
  name: "mynewspace",
  headline: "Your city. Your seat at the table. Your own tablecloth, too.",
  status: NEXT_MEETING.upcoming
    ? `Next posted meeting · ${NEXT_MEETING.bodyLabel}, ${NEXT_MEETING.dateLabel}${NEXT_MEETING.time ? ` at ${NEXT_MEETING.time}` : ""}`
    : `Nothing posted for this body · last indexed meeting was ${MEETINGS[0]?.dateLabel ?? "on record"}`,
  song: "no profile song — silent since 2006 by design",
  location: CHEYENNE ? `${CHEYENNE.name}, WY · ${CHEYENNE.address}` : "Cheyenne, Wyoming",
  accent: NEWSPACE_DEFAULTS.accent,
  pattern: NEWSPACE_DEFAULTS.pattern,
  css: "",
  html: "",
  allowScripts: false,
  arenaUrl: DEFAULT_ARENA_URL,
};

const description =
  "A 2006-style MySpace profile for Cheyenne's public record, customizable with an Arena code window: restyle the modules, move them, paste generated CSS and HTML, and it stays on your own machine.";

export const metadata: Metadata = {
  title: `${MODULE.name} · Cheyenne's public record, blurbed`,
  description,
  alternates: { canonical },
  openGraph: {
    type: "profile",
    url: canonical,
    siteName: SITE_NAME,
    title: "MyNewSpace · mynewspace",
    description,
    images: [
      {
        url: siteUrl("images/mynewspace-blurb.jpg"),
        alt: "Generated 2006 camera-phone style illustration of the Cheyenne water tower, used as this profile's blurb photo",
      },
    ],
  },
  robots: { index: true, follow: true },
};

/* ------------------------------------------------------------------ */
/* Every figure below is read out of the committed record at build.     */
/* ------------------------------------------------------------------ */

const BODY_INTERESTS = Object.values(MEETING_STATS.byBody)
  .sort((left, right) => right.count - left.count)
  .map((body) => ({
    label: `${body.label} · ${body.count.toLocaleString()} meetings`,
    detail: `${body.first} → ${body.last}`,
  }));

const FRIENDS = MUNICIPALITIES.filter((place) => place.id !== "cheyenne" && place.population !== null)
  .sort((left, right) => (right.population ?? 0) - (left.population ?? 0))
  .slice(0, 8)
  .map((place) => ({
    id: place.id,
    name: place.name,
    kind: place.kind,
    population: place.population as number,
    county: countyById(place.countyId)?.name ?? "Wyoming",
    href: asset(`civic/places/${place.id}/`),
    reached: place.tacticStatus === "live",
  }));

const UNREACHED = MUNICIPALITIES.filter((place) => place.tacticStatus === "fail-closed");
const REACHED = MUNICIPALITIES.filter((place) => place.tacticStatus !== "fail-closed");

const GUIDED = getMeeting(GUIDED_MEETING_ID);
const WALL_ENTRIES: WallEntry[] = ORDINANCES.map((ordinance) => ({
  id: ordinance.id,
  author: "City Council · item " + ordinance.item,
  role: `${ordinance.category} · ${ordinance.reading} · ${ordinance.outcomeLabel}`,
  at: GUIDED?.dateLabel ?? "January 26, 2026",
  body: ordinance.description,
  sourceLabel: "Ordinance text and meta record on Granicus",
  href: ordinance.sourceUrl,
}));

const RECENT = MEETINGS.filter((meeting) => !meeting.upcoming && meeting.body === "city-council")
  .slice(0, 5)
  .map((meeting) => ({
    id: meeting.id,
    label: meeting.dateLabel,
    docs: meeting.docs.length,
    href: asset(`meetings/${meeting.id}/`),
  }));

const FACTS: Record<string, string> = {
  name: MODULE.name,
  headline: MODULE.headline,
  status: MODULE.status,
  song: MODULE.song,
  location: MODULE.location,
  accent: MODULE.accent,
  site: SITE_NAME,
  indexedMeetings: MEETING_STATS.totalMeetings.toLocaleString(),
  archivedDocuments: MEETING_STATS.totalDocuments.toLocaleString(),
  linkedTranscripts: String(MEETING_STATS.totalTranscripts),
  coverage: `${MEETING_STATS.earliest} → ${MEETING_STATS.latest}`,
  recordSnapshot: MEETINGS_CAPTURED,
  ecosystemSnapshot: ECOSYSTEM_CAPTURED,
  counties: String(COUNTIES.length),
  incorporatedMunicipalities: String(MUNICIPALITIES.length),
  municipalitiesWithAWatcher: String(REACHED.length),
  municipalitiesFailClosed: String(UNREACHED.length),
  postedAgendasAhead: String(UPCOMING_MEETINGS.length),
  layoutHooks:
    "#nsp-modules, #nsp-sec-about, #nsp-sec-agenda, #nsp-sec-interests, #nsp-sec-meet, #nsp-sec-friends, #nsp-sec-wall, #nsp-sec-custom, .nsp-card-head, .nsp-module-body, --nsp-accent",
};

export default function MyNewSpaceProfile() {
  return (
    <main className="nsp-main">
      <div className="nsp-card nsp-head">
        <div className="nsp-head-row">
          <h1>
            <NewspaceText field="name" module={MODULE} />
            <span> · Cheyenne, Wyoming</span>
          </h1>
          <p className="nsp-age">
            {CHEYENNE?.kind === "city" ? "City" : "Town"} · population {CHEYENNE?.population?.toLocaleString()} ·{" "}
            {MEETING_STATS.totalMeetings.toLocaleString()} meetings on this profile
          </p>
        </div>
        <div className="nsp-links-row">
          <a href="#nsp-sec-about">View My</a>
          <span aria-hidden="true">|</span>
          <a href="#nsp-sec-friends">Top Friends</a>
          <span aria-hidden="true">|</span>
          <a href="#nsp-studio">Update Info</a>
          <span aria-hidden="true">|</span>
          <a href="#nsp-studio">Edit Photos</a>
          <span aria-hidden="true">|</span>
          <a href="#nsp-sec-wall">Friend Space</a>
          <span aria-hidden="true">|</span>
          <a href="#nsp-sec-interests">My Interests</a>
          <span aria-hidden="true">|</span>
          <a href={asset("meetings/")}>Browse the Archive</a>
          <span aria-hidden="true">|</span>
          <a href={asset("")}>Report a Problem</a>
        </div>
        <p className="nsp-ticker">
          <b>STATUS</b>
          <span className="nsp-ticker-track">
            <NewspaceText field="status" module={MODULE} /> · record snapshot {MEETINGS_CAPTURED} · nothing on this
            page posts anywhere · your customization stays in this browser
          </span>
        </p>
        <div className="nsp-snapshot">
          <HubSnapshotFreshness note="the profile text below is copied from the same snapshot" />
        </div>
      </div>

      <div className="nsp-cols" style={{ marginTop: 11 }}>
        <div>
          <section className="nsp-card" aria-label="Profile photograph and identity">
            <figure className="nsp-blurb">
              <img
                src={asset("images/mynewspace-blurb.jpg")}
                alt="Generated illustration in the style of a 2006 camera-phone snapshot: the Cheyenne water tower at dusk from a parking lot. Not an archival photograph and not a public record."
                width={640}
                height={420}
              />
              <span className="nsp-offline">GENERATED ILLUSTRATION · NOT A RECORD PHOTO</span>
              <figcaption>
                <strong>Nothing on this profile is a photo of a real event.</strong> The blurb image is a generated
                stand-in for the 1.3-megapixel camera-phone portrait every 2006 profile had: low resolution, harsh
                flash, no idea what the council just voted on. Everything else on this page is copied from the archive
                and links back to it.
              </figcaption>
            </figure>

            <table className="nsp-id-table">
              <caption className="sr-only">Profile identity details</caption>
              <tbody>
                <tr>
                  <th>Here for</th>
                  <td>Friends, records, agenda packets</td>
                </tr>
                <tr>
                  <th>County</th>
                  <td>{CHEYENNE_COUNTY ? `${CHEYENNE_COUNTY.name} County` : "Laramie County"}</td>
                </tr>
                <tr>
                  <th>City Hall</th>
                  <td>{CHEYENNE?.address}</td>
                </tr>
                <tr>
                  <th>Location</th>
                  <td>
                    <NewspaceText field="location" module={MODULE} />
                  </td>
                </tr>
                {CHEYENNE?.website?.url && (
                  <tr>
                    <th>Homepage</th>
                    <td>
                      <a href={CHEYENNE.website.url} target="_blank" rel="noopener noreferrer">
                        cheyennecity.org
                      </a>
                    </td>
                  </tr>
                )}
                <tr>
                  <th>Occupation</th>
                  <td>Being the public record</td>
                </tr>
                <tr>
                  <th>Single since</th>
                  <td>{MEETING_STATS.earliest}, when indexing begins</td>
                </tr>
              </tbody>
            </table>

            <div className="nsp-contact-row">
              <a href="#nsp-sec-wall">
                <Users size={12} aria-hidden="true" /> Leave a note
              </a>
              <a href="#nsp-studio">
                <Heart size={12} aria-hidden="true" /> Customize profile
              </a>
              <a href={asset("hub/")}>
                <FolderLock size={12} aria-hidden="true" /> Open the live desk
              </a>
              {CHEYENNE?.phone && (
                <a href={`tel:${CHEYENNE.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone size={12} aria-hidden="true" /> {CHEYENNE.phone}
                </a>
              )}
            </div>
          </section>

          <section className="nsp-card" aria-labelledby="nsp-online-title">
            <h2 className="nsp-card-head" id="nsp-online-title">
              <span>
                <Star size={11} aria-hidden="true" /> On the docket
              </span>
              <span>{UPCOMING_MEETINGS.length} posted</span>
            </h2>
            <div className="nsp-online">
              <p>
                A posted agenda is a plan, not a decision. These are the meetings with an agenda in this snapshot.
              </p>
              <ul>
                {UPCOMING_MEETINGS.map((meeting) => (
                  <li key={meeting.id}>
                    <span className="nsp-dot" aria-hidden="true" />
                    <a href={asset(`meetings/${meeting.id}/`)}>{meeting.bodyLabel}</a>
                    <span>· {meeting.shortDate}</span>
                  </li>
                ))}
                {UPCOMING_MEETINGS.length === 0 && <li>No agenda is posted in this snapshot.</li>}
              </ul>
            </div>
          </section>

          <NewspaceSong fallback={MODULE.song} />

          <section className="nsp-card" aria-labelledby="nsp-details-title">
            <h2 className="nsp-card-head" id="nsp-details-title">
              <span>
                <CalendarClock size={11} aria-hidden="true" /> My Details
              </span>
            </h2>
            <table className="nsp-id-table">
              <caption className="sr-only">Archive details</caption>
              <tbody>
                <tr>
                  <th>Meetings indexed</th>
                  <td>{MEETING_STATS.totalMeetings.toLocaleString()}</td>
                </tr>
                <tr>
                  <th>Source documents</th>
                  <td>{MEETING_STATS.totalDocuments.toLocaleString()}</td>
                </tr>
                <tr>
                  <th>Linked transcripts</th>
                  <td>{MEETING_STATS.totalTranscripts}</td>
                </tr>
                <tr>
                  <th>Coverage</th>
                  <td>
                    {MEETING_STATS.earliest} → {MEETING_STATS.latest}
                  </td>
                </tr>
                <tr>
                  <th>Statewide catalog</th>
                  <td>
                    {COUNTIES.length} counties · {MUNICIPALITIES.length} towns
                  </td>
                </tr>
                <tr>
                  <th>Profile built</th>
                  <td>from snapshot {MEETINGS_CAPTURED}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <div id="nsp-modules">
          <section className="nsp-card nsp-module" id="nsp-sec-about" aria-labelledby="nsp-about-title">
            <h2 className="nsp-card-head" id="nsp-about-title">
              <span>About Me</span>
              <span>read-only</span>
            </h2>
            <div className="nsp-module-body">
              <p>
                I am the profile page this city never had: <NewspaceText field="headline" module={MODULE} />{" "}
                Everything in these modules is copied out of the same archive the rest of {SITE_NAME} publishes —{" "}
                {MEETING_STATS.totalMeetings.toLocaleString()} indexed public meetings, {MEETING_STATS.totalDocuments.toLocaleString()}{" "}
                archived documents, {MEETING_STATS.totalTranscripts} linked transcripts, {COUNTIES.length} counties and{" "}
                {MUNICIPALITIES.length} incorporated municipalities in the statewide catalog.
              </p>
              <p>
                What is new here is the layout, not the record. The old profile box let you paste HTML and make a page
                yours; this one lets you ask <strong>Arena</strong> to write the CSS, then paste the answer. Your
                theme, your module order, your hidden sections, and your custom module live in{" "}
                <code>localStorage</code> in this browser. Nobody else sees them, and the exported page keeps every
                word printed below.
              </p>
              <h3>
                <Building2 size={12} aria-hidden="true" /> The one rule
              </h3>
              <p>
                A profile can be restyled; an agenda item cannot be upgraded by enthusiasm. Items stay proposals until
                the official record establishes an outcome, and the outcome line under each ordinance below is quoted
                from the minutes as this snapshot found them.
              </p>
              <div className="nsp-quote">
                {ORDINANCES[0]?.fullTitle ?? "See the guided session for the full ordinance text."}
                <footer>
                  The first guided item — {ORDINANCES[0]?.outcomeLabel}, from the official January 26, 2026 minutes.
                </footer>
              </div>
            </div>
          </section>

          <section className="nsp-card nsp-module" id="nsp-sec-agenda" aria-labelledby="nsp-agenda-title">
            <h2 className="nsp-card-head" id="nsp-agenda-title">
              <span>Next public meeting</span>
              <span>{NEXT_MEETING.items?.length ?? 0} posted items</span>
            </h2>
            <div className="nsp-module-body">
              <dl className="nsp-facts">
                <div>
                  <dt>Body</dt>
                  <dd>
                    {NEXT_MEETING.bodyLabel}
                    <small>{NEXT_MEETING.upcoming ? "agenda posted" : "most recent indexed meeting"}</small>
                  </dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>
                    {NEXT_MEETING.shortDate}
                    <small>{NEXT_MEETING.time ?? "time not in this snapshot"}</small>
                  </dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>
                    {NEXT_MEETING.location ?? "Council Chambers"}
                    <small>2101 O’Neil Avenue, Cheyenne</small>
                  </dd>
                </div>
              </dl>
              {NEXT_MEETING.items && NEXT_MEETING.items.length > 0 && (
                <>
                  <h3>Posted agenda, in order</h3>
                  <ol className="nsp-topic-list">
                    {NEXT_MEETING.items.slice(0, 11).map((item) => (
                      <li key={`${item.number}-${item.kind}`}>
                        {item.number}. {item.kind}: {item.text}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <div className="nsp-facts" style={{ marginTop: 10 }}>
                <div>
                  <dt>Agenda</dt>
                  <dd>
                    {NEXT_MEETING.official.agenda ? (
                      <a href={NEXT_MEETING.official.agenda} target="_blank" rel="noopener noreferrer">
                        posted PDF
                      </a>
                    ) : (
                      <span>not in this snapshot</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Minutes</dt>
                  <dd>
                    {NEXT_MEETING.official.minutes ? (
                      <a href={NEXT_MEETING.official.minutes} target="_blank" rel="noopener noreferrer">
                        official minutes
                      </a>
                    ) : (
                      <span>not yet posted</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Recording</dt>
                  <dd>
                    <a href={NEXT_MEETING.official.granicus} target="_blank" rel="noopener noreferrer">
                      Granicus viewer
                    </a>
                  </dd>
                </div>
              </div>
            </div>
          </section>

          <section className="nsp-card nsp-module" id="nsp-sec-interests" aria-labelledby="nsp-interests-title">
            <h2 className="nsp-card-head" id="nsp-interests-title">
              <span>My Interests</span>
            </h2>
            <div className="nsp-module-body">
              <h3>General interests</h3>
              <p>
                Reading agendas. Waiting for minutes. Comparing what a posted item says with what the recorded action
                says, which is the entire hobby.
              </p>
              <h3>Boards I follow, by how much is on record</h3>
              <ul className="nsp-topic-list">
                {BODY_INTERESTS.map((body) => (
                  <li key={body.label} title={`First indexed ${body.detail}`}>
                    {body.label}
                  </li>
                ))}
              </ul>
              <h3>
                <Music2 size={12} aria-hidden="true" /> Favourite songs
              </h3>
              <p>
                The profile song slot above is deliberately empty. A static civic page should not fetch media you did
                not ask for — that is the <code>&lt;bgsound&gt;</code> lesson.
              </p>
            </div>
          </section>

          <section className="nsp-card nsp-module" id="nsp-sec-meet" aria-labelledby="nsp-meet-title">
            <h2 className="nsp-card-head" id="nsp-meet-title">
              <span>Who I’d like to meet</span>
              <span>{UNREACHED.length} of {MUNICIPALITIES.length}</span>
            </h2>
            <div className="nsp-module-body">
              <p>
                Every other Wyoming municipality in the catalog. {REACHED.length} of {MUNICIPALITIES.length} have a
                publishing door this project has described — Cheyenne alone has a watcher calibrated to it. The other{" "}
                {UNREACHED.length} are recorded and <strong>not fetched</strong>, because pointing a parser at a
                guessing-typed host is how a civic tool starts inventing meetings.
              </p>
              <ul className="nsp-topic-list">
                {UNREACHED.slice(0, 8).map((place) => (
                  <li key={place.id}>
                    {place.name} · {place.architectureId.replace(/-/g, " ")}
                  </li>
                ))}
                {UNREACHED.length > 8 && <li>+{UNREACHED.length - 8} more, still unobserved</li>}
              </ul>
              <p className="nsp-empty">
                Rock Springs, Evanston, Riverton and Rawlins are the four largest of them. None is a fail-closed
                because the town is unimportant; it is unimportant <em>as a data source</em> until somebody opens its
                page and records what it actually is.
              </p>
            </div>
          </section>

          <section className="nsp-card nsp-module" id="nsp-sec-friends" aria-labelledby="nsp-friends-title">
            <h2 className="nsp-card-head" id="nsp-friends-title">
              <span>My Top 8 Friends</span>
              <span>
                <a href={asset("hub/wyoming/")} style={{ color: "#fff", textDecoration: "underline" }}>
                  see all {MUNICIPALITIES.length}
                </a>
              </span>
            </h2>
            <div className="nsp-module-body">
              <div className="nsp-friend-grid">
                {FRIENDS.map((friend, index) => (
                  <a className="nsp-friend" key={friend.id} href={friend.href}>
                    <span className="nsp-friend-avatar" aria-hidden="true">
                      {friend.name.slice(0, 1)}
                    </span>
                    <strong>
                      {index + 1}. {friend.name}
                    </strong>
                    <small>
                      {friend.kind} · {friend.population.toLocaleString()} people
                      <br />
                      {friend.county} County
                      <br />
                      {friend.reached ? "watched here" : "no watcher — catalog only"}
                    </small>
                  </a>
                ))}
              </div>
              <p className="nsp-field-note" style={{ marginTop: 8 }}>
                Ranked by the population figure the Wyoming Association of Municipalities directory published for each
                town. Ordering a Top 8 by anything else would be a rumour.
              </p>
            </div>
          </section>

          <section className="nsp-card nsp-module" id="nsp-sec-wall" aria-labelledby="nsp-wall-title">
            <h2 className="nsp-card-head" id="nsp-wall-title">
              <span>Friend Space</span>
              <span>{WALL_ENTRIES.length} comments · {GUIDED?.shortDate ?? "guided session"}</span>
            </h2>
            <div className="nsp-module-body">
              <NewspaceWall entries={WALL_ENTRIES} />
            </div>
          </section>

          <section className="nsp-card nsp-module" id="nsp-sec-custom" aria-labelledby="nsp-custom-title">
            <h2 className="nsp-card-head" id="nsp-custom-title">
              <span>My Profile HTML</span>
              <span>sandboxed</span>
            </h2>
            <div className="nsp-module-body">
              <NewspaceCustomModule fallbackNote="Empty. Ask Arena for a theme, paste the HTML into the code console, save it, and this box becomes yours — table layouts, marquees, tiled backgrounds, the lot." />
            </div>
          </section>
        </div>
      </div>

      <NewspaceStudio facts={FACTS} />

      <div className="nsp-card" style={{ marginTop: 11 }}>
        <h2 className="nsp-card-head">
          <span>
            <FolderLock size={11} aria-hidden="true" /> Recently on the boards
          </span>
          <span>City Council</span>
        </h2>
        <div className="nsp-module-body">
          <ol className="nsp-topic-list">
            {RECENT.map((meeting) => (
              <li key={meeting.id}>
                <a href={meeting.href}>{meeting.label}</a> · {meeting.docs} documents
              </li>
            ))}
          </ol>
          <p className="nsp-field-note" style={{ marginTop: 8 }}>
            The five newest City Council meetings in the index, newest first. Each page carries its agenda, minutes,
            and every archived document behind it.
          </p>
        </div>
      </div>
    </main>
  );
}
