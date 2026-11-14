import Link from 'next/link';
import SiteTour from '@/components/site-tour';
import HubSnapshotFreshness from '@/components/hub-snapshot-freshness';
import { transcriptCountSummary, UPCOMING_MEETINGS, OFFICIAL_SCHEDULE_URL, noUpcomingMeetingNotice } from '@/lib/civic-data';
import styles from '@/components/public-shell.module.css';
export default function HomePage() {
  const notice = noUpcomingMeetingNotice();
  return <main className={styles.page} style={{ fontSize: '20px', color: '#142b3d' }}>
    <section className={styles.hero} aria-labelledby="welcome-title"><p className={styles.kicker}>Cheyenne & Laramie County</p><h1 id="welcome-title">Your community. The information to draw your own conclusions.</h1><p>Explore Cheyenne and Laramie County public records, meetings, and local information—all brought together for quick, easy viewing. Get the overview or go deeper into the facts, and find out where you can make a difference in your community.</p><p>Check the sources, dates, and gaps. Choose the level of depth and involvement that works for you.</p><div className={styles.actions}><a className={styles.button} href="#start-here">What&apos;s happening?</a><a className={styles.secondary} href="#site-tour">Take the site tour</a></div></section>
    <section aria-labelledby="upcoming-meetings-title" className={styles.note}>
      <p className={styles.kicker}>Official meeting postings</p>
      <h2 id="upcoming-meetings-title">Upcoming meetings in the published snapshot</h2>
      <HubSnapshotFreshness note="New postings, cancellations, and revised agendas may appear after this check; confirm details with the official source." />
      <div className={styles.grid}>
        {UPCOMING_MEETINGS.slice(0, 6).map((meeting) => <article className={styles.card} key={meeting.id}>
          <h3>{meeting.bodyLabel}</h3>
          <p>{meeting.dayLabel} · {meeting.dateLabel}{meeting.time ? ` · ${meeting.time}` : ' · Start time not verified'}{meeting.location ? ` · ${meeting.location}` : ''}</p>
          <p>{meeting.archiveUnavailable ? 'Official posting detected; detailed archive unavailable.' : 'Scheduled in the published snapshot; agenda content is not a verified outcome.'}</p>
          <a href={meeting.official.granicus || meeting.official.agenda || OFFICIAL_SCHEDULE_URL} target="_blank" rel="noopener noreferrer">Check official posting</a>
        </article>)}
      </div>
      {UPCOMING_MEETINGS.length === 0 && <div><h3>{notice.headline}</h3><p>{notice.detail}</p><p>{notice.provenanceLine}{notice.blockedPostingLine ? ` ${notice.blockedPostingLine}` : ''}</p></div>}
      <p>Calendar status uses America/Denver. A scheduled time passing does not establish that a meeting occurred, was canceled, or produced a decision.</p>
      <div className={styles.actions}><Link className={styles.button} href="/hub/meetings/">Meeting desk and agendas</Link><a className={styles.secondary} href={OFFICIAL_SCHEDULE_URL} target="_blank" rel="noopener noreferrer">Official city calendar</a></div>
    </section>
    <section id="start-here" aria-labelledby="start-title" className={styles.note}><p className={styles.kicker}>Need a starting point?</p><h2 id="start-title">What&apos;s happening in your community</h2><p>Start with current events, public meetings, and the records behind local decisions. Check each publisher&apos;s date before treating an item as current.</p><div className={styles.grid}><article className={styles.card}><h3>Current events & updates</h3><p>Visit the existing signal desk for reporting, public alerts, and source links. Publisher availability and update times vary.</p><Link href="/hub/signals/">Explore current events →</Link></article><article className={styles.card}><h3>Public meetings</h3><p>Find posted meeting information and agendas. Confirm upcoming dates with the official calendar linked from the meeting desk.</p><Link href="/hub/meetings/">Find a public meeting →</Link></article><article className={styles.card}><h3>Get involved</h3><p>Ask questions, share sources, and flag missing information or corrections.</p><Link href="/community/">Join the conversation →</Link></article></div></section>
    <SiteTour />
    <section><h2>Follow your interests. Choose your depth.</h2><p>Browse the available local-information collections, check original records and meeting transcripts, or use detailed research tools.</p><p>The transcript archive holds {transcriptCountSummary()}. Each transcript is dated from its meeting record, not from the file name, and automated transcripts can contain errors.</p><div className={styles.actions}><Link className={styles.button} href="/explore/">Explore collections</Link><Link className={styles.secondary} href="/transcripts/">Meeting transcripts</Link><Link className={styles.secondary} href="/workspace/">Research tools</Link></div></section>
    <section><h2>Put the numbers in context</h2><ul><li>Check the source, reporting period, and geographic area.</li><li>Look for units and the population behind each percentage.</li><li>Compare consistent definitions and coverage.</li><li>Check for estimates, missing data, and outdated figures. Missing data is not zero.</li></ul><p>When context is absent, treat that as a limitation rather than filling in the gaps.</p></section>
    <section className={styles.note}><h2>Facts, analysis, and gaps</h2><p>Original records, research interpretations, and community comments are different kinds of information. Research and discussion are not official findings. Automated transcripts can contain errors.</p><p>This site does not contain every relevant record. Check source links, dates, and review labels before drawing conclusions.</p><Link href="/about/">About this project →</Link></section>
  </main>;
}
