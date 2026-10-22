import Link from 'next/link';
import styles from '@/components/public-shell.module.css';
export default function HomePage() {
  return <main className={styles.page}>
    <section className={styles.hero} aria-labelledby="welcome-title">
      <p className={styles.kicker}>Cheyenne & Laramie County · Start here</p>
      <h1 id="welcome-title">Your community. The records behind its decisions.</h1>
      <p>The Real Windy City helps you explore public records, follow local decisions, and discuss what the evidence shows.</p>
      <p>Find meeting records, follow an issue across time, and check the original sources. You do not need to understand government databases or research software to begin.</p>
      <div className={styles.actions}><Link className={styles.button} href="/explore/">Explore the records</Link><a className={styles.secondary} href="#how-it-works">See how it works</a><Link className={styles.secondary} href="/community/">Join the discussion</Link></div>
    </section>
    <section aria-labelledby="choose-title"><h2 id="choose-title">What would you like to do?</h2><div className={styles.grid}>
      <article className={styles.card}><h3>Understand a local decision</h3><p>Find public meetings, agendas, minutes, and supporting documents. Separate a proposal from a recorded decision.</p><Link href="/meetings/">Explore meetings →</Link></article>
      <article className={styles.card}><h3>Follow the evidence</h3><p>Explore transcripts and source-linked research. Use the detailed workspace when you are ready to go deeper.</p><Link href="/explore/">Explore records →</Link></article>
      <article className={styles.card}><h3>Ask, discuss, or contribute</h3><p>Ask a question, share a source, suggest an improvement, or flag something that needs correction.</p><Link href="/community/">Open community →</Link></article>
    </div></section>
    <section id="how-it-works"><h2>From a question to the record</h2><ol><li>Choose a meeting, topic, or collection.</li><li>Read the explanation alongside the linked source.</li><li>Check dates, coverage, and review labels before drawing a conclusion.</li><li>Bring questions or corrections to the community board.</li></ol><p>There is no required tutorial or sign-in to browse the public pages.</p></section>
    <section><h2>Know what you are reading</h2><div className={styles.grid}>
      <article className={styles.card}><h3>Source record</h3><p>Material from the originating agency or publisher. Follow its source link to verify context.</p></article>
      <article className={styles.card}><h3>Automated transcript</h3><p>Machine-generated text that can contain errors. Radio speech is not a verified incident report.</p></article>
      <article className={styles.card}><h3>Research & discussion</h3><p>Interpretation and community contributions are not official findings. A candidate connection between records is not a confirmed match.</p></article>
    </div></section>
    <section className={styles.note}><h2>What is available?</h2><p>Browse the meeting archive, transcripts, public-information hub, and detailed research workspace. Scanner transcripts open in a separate workspace; capture can have gaps.</p><p>Freshness varies by collection. Check the source and its update date. A scheduled workflow or a page that loads does not prove that its data is current. Incident-record correlation is still under development.</p><Link href="/explore/">Choose a collection →</Link></section>
  </main>;
}
