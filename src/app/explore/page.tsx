import type { Metadata } from 'next';
import Link from 'next/link';
import { siteUrl } from '@/lib/site-config';
import styles from '@/components/public-shell.module.css';
export const metadata: Metadata = { title: 'Explore records | The Real Windy City', alternates: { canonical: siteUrl('explore/') } };
const collections = [
  { title: 'Meetings & decisions', text: 'Find meetings, agendas, and archived source documents.', href: '/meetings/', label: 'Browse meetings' },
  { title: 'Transcripts & research', text: 'Read available meeting transcripts and follow source-linked evidence.', href: '/transcripts/', label: 'Browse transcripts' },
  { title: 'Maps & local information', text: 'Explore the public-information hub and its source-linked collections. Availability varies by publisher.', href: '/hub/', label: 'Open the information hub' },
  { title: 'Research workspace', text: 'Use the original interactive experience and its detailed tools. This area contains advanced controls.', href: '/workspace/', label: 'Launch research workspace' }
];
export default function ExplorePage() {
  return <main className={styles.page}><section className={styles.hero}><p className={styles.kicker}>Choose a collection</p><h1>Explore at your own pace.</h1><p>Start with the subject, not the software. Every collection should lead you back to its evidence.</p></section><section className={styles.grid}>{collections.map(item => <article className={styles.card} key={item.title}><h2>{item.title}</h2><p>{item.text}</p><Link href={item.href}>{item.label} →</Link></article>)}</section><section className={styles.card}><h2>Scanner transcripts</h2><p>Review automated Broadcastify-feed transcriptions and available capture status. Text is unverified and coverage can have gaps.</p><a className={styles.button} href="https://therealwindycity.streamlit.app" target="_blank" rel="noopener noreferrer">Open scanner workspace ↗</a><p>Opens a separate site. Select Scanner Live in its sidebar. This is not an emergency service.</p></section><section className={styles.note}><h2>Need a starting point?</h2><Link href="/hub/learn/">Read the public-records field guide</Link><p>For a specific question or a missing source, visit <Link href="/community/">Community</Link>.</p></section></main>;
}
