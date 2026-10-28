import type { Metadata } from 'next';
import Link from 'next/link';
import { siteUrl } from '@/lib/site-config';
import styles from '@/components/public-shell.module.css';
export const metadata: Metadata = { title: 'Public safety & scanner | The Real Windy City', alternates: { canonical: siteUrl('explore/public-safety/') } };
export default function PublicSafetyPage() {
  return <main className={styles.page}><Link href="/explore/">← Explore collections</Link><section className={styles.hero}><p className={styles.kicker}>Explore · Public safety</p><h1>Scanner workspace</h1><p>Scanner access is separate from the homepage&apos;s local-information overview.</p></section><section className={styles.card}><h2>Scanner access & automated transcripts</h2><p>Open the separate workspace to review available Broadcastify-feed transcriptions and capture status. Select Scanner Live in its sidebar.</p><a className={styles.button} href="https://therealwindycity.streamlit.app" target="_blank" rel="noopener noreferrer">Open scanner workspace ↗</a><p>Opens a separate site. Availability and coverage can vary.</p></section><section className={styles.note}><h2>Coverage and verification</h2><p>Automated transcripts can contain errors, and capture can have gaps. Radio speech is not a verified incident report or an official finding. Check original sources before drawing conclusions.</p><p>This is not an emergency service. Incident-record correlation remains under development.</p></section></main>;
}
