'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './public-shell.module.css';
const scenes = [
  { title: 'Local information, brought together', text: 'Start with an overview of Cheyenne and Laramie County information. Choose a subject and explore at your own pace.', href: '/explore/', label: 'Explore collections' },
  { title: 'Start with what is happening', text: 'Open current-event sources and public alerts. Check publication dates and follow links to the original publisher.', href: '/hub/signals/', label: 'Open current events' },
  { title: 'Follow public meetings', text: 'Explore posted meetings, agendas, and archived records. Verify upcoming dates with official sources.', href: '/hub/meetings/', label: 'Find a meeting' },
  { title: 'Go deeper into the evidence', text: 'Follow original records and available meeting transcripts. Check dates, coverage, and limitations before comparing figures.', href: '/explore/', label: 'Follow the records' },
  { title: 'Find where you can make a difference', text: 'Ask questions, contribute sources, and suggest corrections. Choose the level of involvement that works for you.', href: '/community/', label: 'Visit Community' }
];
export default function SiteTour() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (index === scenes.length - 1) setPlaying(false);
      else setIndex(index + 1);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [playing, index]);
  const scene = scenes[index];
  return <section id="site-tour" aria-labelledby="tour-title"><h2 id="tour-title">Start here: a 40-second site tour</h2><p>A captioned slide introduction—not a recorded video. Press play to advance through five stops, or read the transcript below.</p><div className={styles.card} role="group" aria-label="Site tour"><p>Stop {index + 1} of {scenes.length}</p><h3>{scene.title}</h3><p>{scene.text}</p><Link href={scene.href}>{scene.label} →</Link><div className={styles.actions}><button type="button" className={styles.button} style={{ font: 'inherit', cursor: 'pointer', border: 0 }} onClick={() => { if (!playing && index === scenes.length - 1) setIndex(0); setPlaying(!playing); }}>{playing ? 'Pause tour' : index === scenes.length - 1 ? 'Replay tour' : 'Play tour'}</button><button type="button" className={styles.secondary} style={{ font: 'inherit', cursor: 'pointer', background: '#fff' }} onClick={() => { setPlaying(false); setIndex((index + 1) % scenes.length); }}>Next stop</button></div></div><details><summary>Read the complete tour transcript</summary><ol>{scenes.map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.text}</p><Link href={item.href}>{item.label} →</Link></li>)}</ol></details></section>;
}
