import type { Metadata } from 'next';
import Link from 'next/link';
import { siteUrl } from '@/lib/site-config';
import styles from '@/components/public-shell.module.css';
export const metadata: Metadata = { title: 'Explore records | The Real Windy City', alternates: { canonical: siteUrl('explore/') } };
const collections = [
  { title: 'Meetings & decisions', text: 'Find meetings, agendas, and archived source documents.', href: '/meetings/' },
  { title: 'Meeting transcripts & research', text: 'Read available meeting transcripts and follow source-linked evidence.', href: '/transcripts/' },
  { title: 'Maps & local information', text: 'Explore the public-information hub. Availability varies by publisher.', href: '/hub/' },
  { title: 'Research workspace', text: 'Explore detailed research tools and advanced controls.', href: '/workspace/' },
  { title: 'Public safety', text: 'Visit the separate public-safety page for scanner access and coverage limitations.', href: '/explore/public-safety/' }
];
export default function ExplorePage() {
  return <main className={styles.page}><section className={styles.hero}><p className={styles.kicker}>Choose a collection</p><h1>Explore at your own pace.</h1><p>Start with a subject, follow its sources, and check dates, geographic coverage, and limitations before comparing figures.</p></section><section className={styles.grid} aria-label="Record collections">{collections.map(item => <article className={styles.card} key={item.title}><h2>{item.title}</h2><p>{item.text}</p><Link href={item.href}>Explore collection →</Link></article>)}</section><section className={styles.note}><h2>Need a starting point?</h2><Link href="/hub/learn/">Read the public-records field guide</Link><p>For a specific question or a missing source, visit <Link href="/community/">Community</Link>.</p></section></main>;
}
