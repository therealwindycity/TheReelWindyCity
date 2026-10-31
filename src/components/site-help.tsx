'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './site-help.module.css';
const topics = [
  { label: 'Current events', pattern: /news|current|event|happening|alert/i, text: 'Open the signal desk for reporting and updates. Check the original publisher and publication date.', href: '/hub/signals/' },
  { label: 'Public meetings', pattern: /meeting|agenda|council|minutes|vote/i, text: 'Start with the meeting desk for posted meeting information and agendas. Verify upcoming dates with official sources.', href: '/hub/meetings/' },
  { label: 'Records & statistics', pattern: /record|statistic|data|number|source|budget|housing|road|tax/i, text: 'Explore the available collections. Check sources, dates, geographic coverage, and missing data before comparing figures. I cannot verify a statistic in this navigation-only guide.', href: '/explore/' },
  { label: 'Get involved', pattern: /involve|community|help|question|contribut|correct|difference/i, text: 'Visit Community to ask questions, share sources, and flag corrections. For official public participation, check the relevant agency or meeting instructions.', href: '/community/' },
  { label: 'Research tools', pattern: /research|workspace|detail|deep/i, text: 'The research workspace offers the detailed tools. Start with Explore if you prefer a simpler overview.', href: '/workspace/' },
  { label: 'Site tour', pattern: /tour|start|navigate|website|how.*use/i, text: 'The homepage has a captioned site tour with play, pause, and a complete transcript.', href: '/#site-tour' },
  { label: 'Scanner', pattern: /scanner|radio|police|safety/i, text: 'Scanner access is on the separate Public safety page. Transcripts can contain errors and are not verified incident reports. This is not an emergency service.', href: '/explore/public-safety/' }
];
type Message = { role: 'visitor' | 'guide'; text: string; href?: string; label?: string };
export default function SiteHelp() {
  const [open, setOpen] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'guide', text: 'Hi! Need help finding your way around? Choose a topic or type what you are looking for.' }]);
  const field = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { if (sessionStorage.getItem('site-help-greeted')) return; } catch {}
    const timer = window.setTimeout(() => {
      setGreeting(true);
      try { sessionStorage.setItem('site-help-greeted', '1'); } catch {}
    }, 6000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (open) { setGreeting(false); field.current?.focus(); } }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, open]);
  function close() { setOpen(false); setGreeting(false); launcher.current?.focus(); }
  function ask(question: string) {
    const text = question.trim().slice(0, 500);
    if (!text) return;
    const topic = topics.find(item => item.pattern.test(text));
    const reply: Message = topic ? { role: 'guide', text: topic.text, href: topic.href, label: topic.label } : { role: 'guide', text: 'I can help you find pages, but I do not have live AI or document search connected. Try a topic below, or bring your question to Community.', href: '/community/', label: 'Ask in Community' };
    const visitor: Message = { role: 'visitor', text };
    setMessages(previous => [...previous, visitor, reply].slice(-20));
    setInput('');
  }
  return <aside className={styles.widget} aria-label="Site assistance">
    {greeting && !open && <div className={styles.greeting}><p>Need help finding your way around?</p><button type="button" onClick={() => setOpen(true)}>Show me around</button><button type="button" aria-label="Dismiss greeting" onClick={() => setGreeting(false)}>No thanks</button></div>}
    {open && <div id="site-help-panel" role="dialog" aria-modal="false" aria-labelledby="site-help-title" className={styles.panel} onKeyDown={event => { if (event.key === 'Escape') close(); }}><header className={styles.header}><h2 id="site-help-title">Site guide</h2><button type="button" onClick={close} aria-label="Close site guide">Close</button></header><p className={styles.notice}>Preset navigation help, not live AI. Messages stay in this page&apos;s memory and are not sent to an AI service. Do not enter personal information.</p><div className={styles.log} ref={log} role="log" aria-live="polite" aria-relevant="additions">{messages.map((message, index) => <div className={message.role === 'visitor' ? styles.visitor : styles.reply} key={index}><span>{message.role === 'visitor' ? 'You' : 'Site guide'}</span><p>{message.text}</p>{message.href && <Link href={message.href} onClick={close}>{message.label} →</Link>}</div>)}</div><div className={styles.topics} aria-label="Suggested topics">{topics.map(topic => <button type="button" key={topic.label} onClick={() => ask(topic.label)}>{topic.label}</button>)}</div><form className={styles.form} onSubmit={event => { event.preventDefault(); ask(input); }}><label htmlFor="site-help-question">What are you looking for?</label><div><input id="site-help-question" ref={field} value={input} maxLength={500} autoComplete="off" onChange={event => setInput(event.target.value)} /><button type="submit" disabled={!input.trim()}>Send</button></div></form></div>}
    <button type="button" className={styles.launcher} ref={launcher} aria-expanded={open} aria-controls={open ? 'site-help-panel' : undefined} onClick={() => { if (open) close(); else setOpen(true); }}>{open ? 'Close help' : 'Need help?'}</button>
  </aside>;
}
