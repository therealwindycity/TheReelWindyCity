"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, FileText, Home, Landmark, Layers, LoaderCircle, Map, MapPin, MessageSquareText, Play, ShieldCheck, Trees, Video, AlertCircle, Lightbulb, ArrowLeft } from "lucide-react";
import ImpactMap from "./impact-map";
import ClickToLoadYouTube from "./click-to-load-youtube";
import { SmartCivicSearch } from "./smart-civic-search";
import { type SourceDocument } from "./source-library";
import { DEFAULT_MEETING_ID, GUIDED_MEETING_ID, MEETING, MEETINGS, NEXT_MEETING, ORDINANCES, TRANSCRIPT_REPO, UPCOMING_MEETINGS, asset, githubUrl, meetingGroupLabel, officialSourcePath, rawUrl, readableName, type CivicProgress, type Meeting, type Ordinance } from "@/lib/civic-data";
import { sourceContentUrl } from "@/lib/source-content";

export function OrdinanceIcon({ ordinance, size = 21 }: { ordinance: Ordinance; size?: number }) {
  if (ordinance.icon === "home") return <Home size={size}/>;
  if (ordinance.icon === "map") return <Map size={size}/>;
  if (ordinance.icon === "trees") return <Trees size={size}/>;
  if (ordinance.icon === "shield") return <ShieldCheck size={size}/>;
  return <Layers size={size}/>;
}
export function officialDocument(id: string, title: string, originalUrl: string): SourceDocument {
  const local = officialSourcePath(id);
  return { title, kind: "document", url: local ? asset(local) : originalUrl, originalUrl, downloadUrl: originalUrl, external: !local };
}
export const transcriptDocument: SourceDocument = { title: "City Council transcript · January 26, 2026", kind: "text", url: sourceContentUrl(TRANSCRIPT_REPO, MEETING.transcriptPath), originalUrl: githubUrl(TRANSCRIPT_REPO, MEETING.transcriptPath), downloadUrl: rawUrl(TRANSCRIPT_REPO, MEETING.transcriptPath), repo: TRANSCRIPT_REPO, path: MEETING.transcriptPath, warning: "Auto-generated captions can contain errors, particularly names. Verify quotations against the official meeting video." };
const STAGES = [{ id: "read", label: "Read the record", icon: BookOpen }, { id: "watch", label: "Follow the session", icon: Play }, { id: "impact", label: "Explore the impact", icon: MapPin }, { id: "reflect", label: "Your perspective", icon: MessageSquareText }];
const CHECKPOINTS: Record<string, { question: string; answers: string[]; correct: number }> = {
  home: { question: "What does this accessory-dwelling proposal remove?", answers: ["The owner-occupancy requirement", "Every building permit requirement", "All residential zoning rules"], correct: 0 },
  map: { question: "What would this annexation change if enacted?", answers: ["The price of every home", "Municipal jurisdiction over the described tracts", "Approval of every future building"], correct: 1 },
  trees: { question: "What is the subject of proposed Chapter 8.72?", answers: ["All activity in public parks", "Private displays inside homes", "Unauthorized private displays on public property"], correct: 2 },
  shield: { question: "Does a third-reading agenda entry prove an ordinance was adopted?", answers: ["Yes, adoption is automatic", "No — the recorded action must be checked", "Yes, if public testimony is given"], correct: 1 },
  layers: { question: "What would AG and MR zoning classifications establish?", answers: ["Automatic permits for every development", "The price of each parcel", "Land-use classifications for the specified tracts"], correct: 2 },
};

export function ImpactSummary({ ordinance, proposed = true }: { ordinance: Ordinance; proposed?: boolean }) {
  return <div className="impact-summary"><div className="impact-evidence-label"><span className={`evidence-dot ${proposed ? "" : "muted"}`}/>{proposed ? "PROPOSED RULE CHANGE" : "EXISTING-RULE CONTEXT"}</div><h3>{proposed ? "What would change?" : "Before this proposal"}</h3><p>{proposed ? ordinance.proposed : ordinance.baseline}</p><div className="uncertainty-box"><AlertCircle size={17}/><div><strong>What the record doesn’t establish</strong><p>{ordinance.uncertainty}</p></div></div><div className="recorded-action"><CheckCircle2 size={17}/><div><strong>At the January 26 session</strong><p>{ordinance.outcome}</p></div></div></div>;
}

type GuidedSessionProps = {
  selected: Ordinance;
  progress: CivicProgress[];
  onSelect: (id: string) => void;
  onOpen: (doc: SourceDocument) => void;
  onSave: (ordinanceId: string, stage: string, position: string | null, reflection: string) => Promise<boolean>;
  onMap: (id: string) => void;
  onBack: () => void;
};

function GuidedSession(props: GuidedSessionProps) {
  return <GuidedSessionState key={props.selected.id} {...props}/>;
}

function GuidedSessionState({ selected, progress, onSelect, onOpen, onSave, onMap, onBack }: GuidedSessionProps) {
  const existing = progress.find((p) => p.ordinanceId === selected.id);
  const [stage, setStage] = useState(existing?.stage || "read");
  const [position, setPosition] = useState<string | null>(existing?.position || null);
  const [reflection, setReflection] = useState(existing?.reflection || "");
  const [saving, setSaving] = useState(false);
  const [proposed, setProposed] = useState(true);
  const [answer, setAnswer] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  async function save(nextStage: string) {
    setSaving(true);
    const ok = await onSave(selected.id, nextStage, position, reflection);
    setSaving(false);
    if (ok) { setStage(nextStage); if (nextStage === "reflect" && (position || reflection.trim())) setSaved(true); }
  }
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const checkpoint = CHECKPOINTS[selected.icon];
  return <section className="session-page page-enter"><div className="page-intro"><div><div className="eyebrow"><Landmark size={13}/> YOUR SEAT AT CITY HALL</div><h1>Inside Council Chambers.</h1><p>A real session. The original agenda. A closer look at what’s at stake.</p></div><button className="button button-outline" onClick={onBack}><ArrowLeft size={15}/> Back to overview</button></div>
    <div className="session-location-banner"><div><Landmark size={19}/><strong>Cheyenne Municipal Building</strong><span>2101 O’Neil Avenue · Council Chambers</span></div><span className="pill pill-neutral">Archived session · {MEETING.shortDate}</span></div>
    <div className="session-workspace"><aside className="session-agenda"><div className="session-agenda-heading"><span className="eyebrow">ON THE AGENDA</span><h3>January 26, 2026</h3><p>Regular council meeting · 6:00 PM</p></div><div className="session-agenda-list">{[...ORDINANCES].sort((a,b) => a.item-b.item).map((o) => <button className={`agenda-ordinance ${o.id === selected.id ? "active" : ""}`} key={o.id} onClick={() => onSelect(o.id)}><span className="agenda-number">{String(o.item).padStart(2,"0")}</span><span><strong>{o.title}</strong><small>{o.reading}{progress.some((p) => p.ordinanceId === o.id) && <> · <Check size={10}/> Explored</>}</small></span><ChevronRight size={14}/></button>)}</div><button className="agenda-source-link" onClick={() => onOpen(officialDocument("agenda", "Official meeting agenda · January 26, 2026", MEETING.agendaUrl))}><FileText size={15}/> Open the complete agenda <ArrowUpRight size={14}/></button><div className="session-hall-photo"><Image src={asset("images/council-chambers.png")} alt="The real Cheyenne City Council Chambers at City Hall, 2101 O’Neil Avenue" fill sizes="(max-width: 900px) 100vw, 320px"/><span><Landmark size={12}/> The real Council Chambers</span></div><div className="session-seat-note"><ShieldCheck size={19}/><strong>Explore, don’t impersonate.</strong><p>Your choices are personal reflections. They do not change the real meeting or cast an official vote.</p></div></aside>
      <div className="ordinance-workspace"><div className="workspace-heading"><div className={`ordinance-icon ${selected.color}`}><OrdinanceIcon ordinance={selected} size={23}/></div><div><span className="eyebrow">AGENDA ITEM {String(selected.item).padStart(2,"0")} · {selected.category.toUpperCase()}</span><h2>{selected.title}</h2></div><span className="pill pill-neutral">{selected.reading}</span></div><div className="workspace-steps">{STAGES.map((s, i) => <button key={s.id} className={`${stage === s.id ? "active" : ""} ${i < stageIndex ? "completed" : ""}`} onClick={() => { setStage(s.id); setSaved(false); }}><span>{i < stageIndex ? <Check size={13}/> : i+1}</span><s.icon size={14}/><strong>{s.label}</strong></button>)}</div>
        <div className="workspace-stage">
          {stage === "read" && <div className="read-stage"><div className="evidence-caption"><span className="status-dot"/> From the official January 26 agenda</div><h3>Start with the actual ordinance.</h3><p className="stage-introduction">{selected.description} Here is the agenda language, without a fictional storyline.</p><blockquote className="ordinance-text"><span className="eyebrow">ORDINANCE · {selected.reading.toUpperCase()}</span><p>{selected.fullTitle}</p><footer>{selected.committee}</footer></blockquote><div className="record-facts"><div><MapPin size={16}/><span>Geographic scope<strong>{selected.area}</strong></span></div><div><Landmark size={16}/><span>Legislative stage<strong>{selected.outcomeLabel}</strong></span></div></div><button className="button button-outline" onClick={() => onOpen(officialDocument(selected.id, `${selected.title} · supporting document`, selected.sourceUrl))}><FileText size={16}/> Read the supporting document <ArrowUpRight size={15}/></button><div className="stage-source-note"><ShieldCheck size={16}/><p>An agenda is a proposal record, not proof of enactment. Follow the session and check the minutes for the recorded action.</p></div></div>}
          {stage === "watch" && <div className="watch-stage"><div className="evidence-caption"><span className="status-dot"/> Official City of Cheyenne meeting video</div><h3>Hear the discussion in the room.</h3><p className="stage-introduction">Watch the archived meeting{selected.timestamp ? " from this ordinance’s agenda segment" : " and follow the agenda"}. Public testimony is a speaker’s perspective, not a verified impact finding.</p><div className="meeting-video"><ClickToLoadYouTube videoId={MEETING.youtubeId} startSeconds={selected.timestamp} title={`Official Cheyenne City Council meeting: ${selected.title}`}/></div><div className="watch-source-actions"><button className="button button-outline" onClick={() => onOpen(transcriptDocument)}><FileText size={16}/> Read timestamped transcript</button><a className="button button-outline" href={`${MEETING.videoUrl}`} target="_blank" rel="noreferrer"><Video size={16}/> Official video <ArrowUpRight size={14}/></a></div><div className="stage-source-note"><AlertCircle size={16}/><p>Captions are automatically generated and may misidentify people. The official video and minutes are the primary records.</p></div></div>}
          {stage === "impact" && <div className="impact-stage"><div className="stage-heading-row"><div><div className="evidence-caption"><span className="status-dot"/> An evidence-led look beyond the chamber</div><h3>Follow the change into Cheyenne.</h3></div><div className="scenario-control"><button className={!proposed ? "active" : ""} onClick={() => setProposed(false)}>Before</button><button className={proposed ? "active" : ""} onClick={() => setProposed(true)}>If enacted</button></div></div><ImpactSummary ordinance={selected} proposed={proposed}/><ImpactMap selected={selected} onSelect={onSelect} proposed={proposed}/><div className="map-scope-note"><MapPin size={14}/> General locations only · not legal parcel or city boundaries<button onClick={() => onMap(selected.id)}>Open full impact map <ArrowUpRight size={13}/></button></div><div className="knowledge-check"><div className="knowledge-check-title"><Lightbulb size={18}/><span>RECORD CHECK</span></div><h4>{checkpoint.question}</h4><div className="knowledge-answers">{checkpoint.answers.map((choice, i) => <button key={choice} className={answer === i ? i === checkpoint.correct ? "correct" : "incorrect" : ""} onClick={() => setAnswer(i)}><span>{answer === i && i === checkpoint.correct ? <Check size={13}/> : String.fromCharCode(65+i)}</span>{choice}</button>)}</div>{answer !== null && <p className={answer === checkpoint.correct ? "answer-correct" : "answer-incorrect"}>{answer === checkpoint.correct ? "That’s right. The answer follows the original agenda and meeting record." : "Not quite. Revisit the ordinance language above and try again."}</p>}</div></div>}
          {stage === "reflect" && <div className="reflect-stage"><div className="evidence-caption"><MessageSquareText size={14}/> Your personal civic notebook</div><h3>What’s your perspective?</h3><p className="stage-introduction">You’ve seen the record. Save where you stand and the questions you’d bring to the real conversation.</p><div className="position-choices">{[{ id:"support", label:"I support this", icon: CheckCircle2 },{id:"questions",label:"I have questions",icon: MessageSquareText},{id:"oppose",label:"I’m concerned",icon: AlertCircle}].map((p) => <button key={p.id} className={position === p.id ? "selected" : ""} onClick={() => { setPosition(p.id); setSaved(false); }}><p.icon size={20}/>{p.label}</button>)}</div><label className="reflection-label" htmlFor="reflection">Your notes, questions, or reasoning<span>Optional · {reflection.length.toLocaleString()} / 5,000</span></label><textarea id="reflection" className="reflection-input" rows={7} value={reflection} maxLength={5000} onChange={(e) => { setReflection(e.target.value); setSaved(false); }} placeholder="What does this mean for your neighborhood? Which details would you want the council to clarify?"/><div className="suggested-questions"><strong>Questions worth exploring</strong>{selected.questions.map((q) => <button key={q} onClick={() => { setReflection((r) => `${r}${r ? "\n" : ""}${q}`.slice(0,5000)); setSaved(false); }}><PlusQuestion/> {q}</button>)}</div><button className="button button-primary" disabled={saving || (!position && !reflection.trim())} onClick={() => void save("reflect")}>{saving ? <LoaderCircle className="spin" size={16}/> : saved ? <Check size={16}/> : <BookOpen size={16}/>} {saved ? "Saved to your notebook" : "Save my perspective"}</button><div className="stage-source-note"><ShieldCheck size={16}/><p>Saved to your anonymous visitor notebook. This is not an official vote or public comment and is not submitted to the city.</p></div></div>}
        </div>
        {stage !== "reflect" && <div className="workspace-footer"><span><ShieldCheck size={15}/> Real records. Your own understanding.</span><button className="button button-primary" disabled={saving} onClick={() => void save(STAGES[Math.min(stageIndex+1,3)].id)}>{saving ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {stage === "read" ? "Read & continue" : stage === "watch" ? "Continue to impacts" : "Add my perspective"}<ArrowRight size={15}/></button></div>}
      </div>
    </div>
  </section>;
}
function PlusQuestion() { return <ChevronRight size={13}/>; }


function youtubeId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([\w-]{6,})/);
  return match ? match[1] : null;
}

function meetingTranscriptDoc(meeting: Meeting): SourceDocument | null {
  if (!meeting.transcript) return null;
  const { repo, path } = meeting.transcript;
  return {
    title: `${meeting.bodyLabel} transcript · ${meeting.shortDate}`,
    kind: "text",
    url: meeting.transcript.local && meeting.transcript.publicPath
      ? asset(meeting.transcript.publicPath)
      : sourceContentUrl(repo, path),
    originalUrl: githubUrl(repo, path),
    downloadUrl: rawUrl(repo, path),
    repo,
    path,
    warning: "Auto-generated captions can contain errors, particularly names. Verify quotations against the official meeting video.",
  };
}

function repoDocument(ref: { repo: string; path: string }): SourceDocument {
  const name = readableName(ref.path).replace(/\.pdf$/i, "");
  return {
    title: name.length > 68 ? `${name.slice(0, 66)}…` : name,
    kind: /\.md$/i.test(ref.path) ? "text" : "document",
    url: sourceContentUrl(ref.repo, ref.path),
    originalUrl: githubUrl(ref.repo, ref.path),
    downloadUrl: rawUrl(ref.repo, ref.path),
    repo: ref.repo,
    path: ref.path,
  };
}

/** All openable records for a meeting, with official links before repository files. */
export function meetingDocuments(meeting: Meeting): SourceDocument[] {
  const docs: SourceDocument[] = [];
  if (meeting.id === GUIDED_MEETING_ID) {
    docs.push(officialDocument("agenda", "Official meeting agenda · January 26, 2026", MEETING.agendaUrl));
    docs.push(officialDocument("minutes", "Official meeting minutes · January 26, 2026", MEETING.minutesUrl));
    const transcript = meetingTranscriptDoc(meeting);
    if (transcript) docs.push(transcript);
  } else {
    if (meeting.official.agenda) docs.push({ title: `Official agenda · ${meeting.shortDate}`, kind: "document", url: meeting.official.agenda, originalUrl: meeting.official.agenda, downloadUrl: meeting.official.agenda, external: true });
    if (meeting.official.minutes) docs.push({ title: `Official minutes · ${meeting.shortDate}`, kind: "document", url: meeting.official.minutes, originalUrl: meeting.official.minutes, downloadUrl: meeting.official.minutes, external: true });
    const transcript = meetingTranscriptDoc(meeting);
    if (transcript) docs.push(transcript);
  }
  for (const ref of meeting.docs) docs.push(repoDocument(ref));
  return docs;
}

/* ------------------------------------------------------------------ */
/* Meeting switcher: every meeting in the record, most current first.  */
/* ------------------------------------------------------------------ */

export function MeetingSwitcher({ currentId, onSelect }: { currentId: string; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const result: { label: string; list: Meeting[] }[] = [];
    for (const meeting of MEETINGS) {
      const label = meetingGroupLabel(meeting);
      const last = result[result.length - 1];
      if (last && last.label === label) last.list.push(meeting);
      else result.push({ label, list: [meeting] });
    }
    return result;
  }, []);
  return (
    <div className="meeting-switcher">
      <div className="meeting-switcher-quick">
        {UPCOMING_MEETINGS.map((meeting) => (
          <button key={meeting.id} className={meeting.id === currentId ? "active" : ""} onClick={() => onSelect(meeting.id)}>
            <CalendarDays size={13}/> {meeting.bodyLabel.replace(" Committee", "")} · {(meeting.dayLabel ?? meeting.dateLabel.split(",")[0]).slice(0, 3)}, {meeting.shortDate.replace(/, \d{4}$/, "")}
          </button>
        ))}
        <button className={currentId === GUIDED_MEETING_ID ? "active" : ""} onClick={() => onSelect(GUIDED_MEETING_ID)}>
          <Landmark size={13}/> Guided session · Jan 26
        </button>
      </div>
      <label className="meeting-switcher-select">
        <span className="sr-only">Choose a meeting</span>
        <select value={currentId} onChange={(event) => onSelect(event.target.value)} aria-label="Choose a meeting">
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.list.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {meeting.upcoming ? "▶ " : ""}{meeting.shortDate} · {meeting.bodyLabel}{meeting.notes?.length ? ` (${meeting.notes[0]})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generic meeting browser (everything except the guided session).     */
/* ------------------------------------------------------------------ */

function MeetingBrowser({ meeting, onOpen, onBack }: { meeting: Meeting; onOpen: (doc: SourceDocument) => void; onBack: () => void }) {
  const [activeItem, setActiveItem] = useState(0);
  const docs = meetingDocuments(meeting);
  const transcript = meetingTranscriptDoc(meeting);
  const videoId = youtubeId(meeting.official.video);
  const officialSourceUrl = meeting.official.granicus || meeting.official.video;
  const items = meeting.items ?? [];
  return (
    <section className="session-page page-enter">
      <div className="page-intro">
        <div>
          <div className="eyebrow"><Landmark size={13}/> {meeting.upcoming ? "THE NEXT MEETING ON THE CALENDAR" : "INSIDE THE PUBLIC RECORD"}</div>
          <h1>{meeting.upcoming ? "The agenda is posted. Take a look before it happens." : "Everything the city kept from this meeting."}</h1>
          <p>{meeting.upcoming ? "Real agenda items from the City of Cheyenne — read them now, then watch the meeting live or after." : "Original agendas, minutes, supporting documents, video, and transcripts — nothing invented."}</p>
        </div>
        <button className="button button-outline" onClick={onBack}><ArrowLeft size={15}/> Back to overview</button>
      </div>
      <div className="session-location-banner">
        <div><Landmark size={19}/><strong>{meeting.bodyLabel}</strong><span>{meeting.location ?? "Location is stated in the official record"}</span></div>
        <span className={`pill ${meeting.upcoming ? "pill-soft-green" : "pill-neutral"}`}>{meeting.upcoming ? `Next meeting · ${meeting.dayLabel}, ${meeting.shortDate}` : `Archived session · ${meeting.shortDate}`}</span>
      </div>
      <div className="session-workspace">
        <aside className="session-agenda">
          <div className="session-agenda-heading">
            <span className="eyebrow">{meeting.upcoming ? "ON THE AGENDA" : "THE RECORD"}</span>
            <h3>{meeting.shortDate}</h3>
            <p>{meeting.bodyLabel}{meeting.time ? ` · ${meeting.time}` : meeting.upcoming ? "" : " · Archived meeting"}{meeting.notes?.length ? ` · ${meeting.notes.join(" · ")}` : ""}</p>
          </div>
          <div className="session-agenda-list">
            {meeting.upcoming && items.length > 0
              ? items.map((item, index) => (
                  <button key={item.number} className={`agenda-ordinance ${index === activeItem ? "active" : ""}`} onClick={() => setActiveItem(index)}>
                    <span className="agenda-number">{item.number}</span>
                    <span><strong>{item.kind}</strong><small>{item.text.slice(0, 64)}{item.text.length > 64 ? "…" : ""}</small></span>
                    <ChevronRight size={14}/>
                  </button>
                ))
              : docs.map((doc, index) => (
                  <button key={`${doc.title}-${index}`} className={`agenda-ordinance ${index === activeItem ? "active" : ""}`} onClick={() => { setActiveItem(index); onOpen(doc); }}>
                    <span className="agenda-number">{String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{doc.title}</strong><small>{doc.external ? "Official city source" : doc.repo === TRANSCRIPT_REPO ? "Timestamped transcript" : "Archived document"}</small></span>
                    <ChevronRight size={14}/>
                  </button>
                ))}
          </div>
          {meeting.official.agenda && (
            <button className="agenda-source-link" onClick={() => onOpen({ title: `Official agenda · ${meeting.shortDate}`, kind: "document", url: meeting.official.agenda!, originalUrl: meeting.official.agenda!, downloadUrl: meeting.official.agenda!, external: true })}>
              <FileText size={15}/> Open the complete agenda <ArrowUpRight size={14}/>
            </button>
          )}
          {(meeting.upcoming || meeting.body === "city-council") && (
            <div className="session-hall-photo"><Image src={asset("images/council-chambers.png")} alt="The real Cheyenne City Council Chambers at City Hall" fill sizes="(max-width: 900px) 100vw, 320px"/><span><Landmark size={12}/> The Council Chambers</span></div>
          )}
          <div className="session-seat-note"><ShieldCheck size={19}/><strong>Explore, don’t impersonate.</strong><p>Everything here links to real public records. Your notes are personal reflections, never official votes.</p></div>
        </aside>
        <div className="ordinance-workspace">
          <div className="workspace-heading">
            <div className="ordinance-icon lime"><CalendarDays size={23}/></div>
            <div>
              <span className="eyebrow">{meeting.upcoming ? "POSTED AGENDA · ITEMS AS FILED" : "ARCHIVED MEETING"}</span>
              <h2>{meeting.bodyLabel} · {meeting.dateLabel}</h2>
            </div>
            <span className={`pill ${meeting.upcoming ? "pill-soft-green" : "pill-neutral"}`}>{meeting.upcoming ? "Upcoming" : "In the record"}</span>
          </div>
          <div className="workspace-stage">
            {meeting.upcoming ? (
              <div className="read-stage">
                <div className="evidence-caption"><span className="status-dot"/> Posted by the City of Cheyenne</div>
                <h3>{meeting.dayLabel}, {meeting.shortDate} · {meeting.time ?? ""} · {meeting.location ?? "Council Chambers"}</h3>
                <p className="stage-introduction">{items.length} posted agenda items. Read the official agenda language below — the same document the committee will work from.</p>
                {items.length > 0 ? (
                  <div className="meeting-item-stack">
                    {items.map((item, index) => (
                      <button key={item.number} className={`meeting-item ${index === activeItem ? "active" : ""}`} onClick={() => setActiveItem(index)}>
                        <span className="meeting-item-number">{item.number}</span>
                        <div><span className="eyebrow">{item.kind.toUpperCase()}</span><p>{item.text}</p></div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <blockquote className="ordinance-text"><span className="eyebrow">AGENDA</span><p>Open the official agenda for the posted item list.</p></blockquote>
                )}
                <div className="watch-source-actions">
                  {meeting.official.agenda && <button className="button button-outline" onClick={() => onOpen({ title: `Official agenda · ${meeting.shortDate}`, kind: "document", url: meeting.official.agenda!, originalUrl: meeting.official.agenda!, downloadUrl: meeting.official.agenda!, external: true })}><FileText size={16}/> Official agenda PDF</button>}
                  {meeting.zoom && <a className="button button-primary" href={meeting.zoom.joinUrl} target="_blank" rel="noreferrer"><Video size={16}/> Join on Zoom <ArrowUpRight size={14}/></a>}
                  {meeting.official.granicus && <a className="button button-outline" href={meeting.official.granicus} target="_blank" rel="noreferrer"><ArrowUpRight size={15}/> Granicus agenda page</a>}
                </div>
                {meeting.zoom && <div className="stage-source-note"><Video size={16}/><p>Zoom webinar {meeting.zoom.webinarId} · Zoom passcode {meeting.zoom.passcode} · call in {meeting.zoom.callIn} · phone passcode {meeting.zoom.callInPasscode}. See the official agenda for public-comment instructions.</p></div>}
                <div className="stage-source-note"><ShieldCheck size={16}/><p>Agenda items are proposals. Committee recommendations and final Council action are separate; check the recorded minutes and later readings to confirm what was approved.</p></div>
              </div>
            ) : (
              <div className="watch-stage">
                <div className="evidence-caption"><span className="status-dot"/> {videoId ? "Official meeting video" : "Official meeting record"}</div>
                <h3>{meeting.dateLabel}.</h3>
                <p className="stage-introduction">This meeting is part of a preserved public record. Open any source below — every link leads to the original city or repository document.</p>
                {videoId ? (
                  <div className="meeting-video"><ClickToLoadYouTube videoId={videoId} title={`Official meeting video: ${meeting.bodyLabel}, ${meeting.shortDate}`}/></div>
                ) : (
                  <div className="meeting-video meeting-video-placeholder"><Video size={28}/><p>{meeting.official.video ? "This meeting’s video is hosted on the official archive." : meeting.notes?.includes("Meeting Cancelled") ? "This meeting was cancelled." : "No video is on file for this meeting."}</p></div>
                )}
                <div className="watch-source-actions">
                  {meeting.official.agenda && <button className="button button-outline" onClick={() => onOpen({ title: `Official agenda · ${meeting.shortDate}`, kind: "document", url: meeting.official.agenda!, originalUrl: meeting.official.agenda!, downloadUrl: meeting.official.agenda!, external: true })}><FileText size={16}/> Official agenda</button>}
                  {meeting.official.minutes && <button className="button button-outline" onClick={() => onOpen({ title: `Official minutes · ${meeting.shortDate}`, kind: "document", url: meeting.official.minutes!, originalUrl: meeting.official.minutes!, downloadUrl: meeting.official.minutes!, external: true })}><FileText size={16}/> Official minutes</button>}
                  {transcript && <button className="button button-outline" onClick={() => onOpen(transcript)}><MessageSquareText size={16}/> Read transcript</button>}
                  {meeting.official.video && <a className="button button-outline" href={meeting.official.video} target="_blank" rel="noreferrer"><Video size={16}/> Official video <ArrowUpRight size={14}/></a>}
                </div>
                <div className="record-facts">
                  <div><BookOpen size={16}/><span>Archived documents<strong>{meeting.docs.length} file{meeting.docs.length === 1 ? "" : "s"} in the archive</strong></span></div>
                  <div><Landmark size={16}/><span>Body<strong>{meeting.bodyLabel}</strong></span></div>
                  {transcript && <div><MessageSquareText size={16}/><span>Transcript<strong>Timestamped captions on file</strong></span></div>}
                </div>
                {meeting.docs.length > 0 && <div className="meeting-docs-strip">{meeting.docs.slice(0, 8).map((ref, index) => { const doc = repoDocument(ref); return <button key={`${ref.path}-${index}`} onClick={() => onOpen(doc)}><FileText size={15}/><span>{doc.title}</span><ArrowUpRight size={13}/></button>; })}</div>}
                <div className="stage-source-note"><AlertCircle size={16}/><p>Captions and transcripts are automatically generated and may misidentify people. The official video and minutes are the primary records.</p></div>
              </div>
            )}
          </div>
          <div className="workspace-footer"><span><ShieldCheck size={15}/> Real records. Your own understanding.</span>{officialSourceUrl ? <a className="button button-outline" href={officialSourceUrl} target="_blank" rel="noreferrer">Official source <ArrowUpRight size={15}/></a> : null}</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Guided session: January 26, 2026 source-guided experience.          */
/* ------------------------------------------------------------------ */

export default function SessionWorkspace({ meetingId = DEFAULT_MEETING_ID, onSelectMeeting, selected, progress, onSelect, onOpen, onSave, onMap, onBack }: { meetingId?: string; onSelectMeeting?: (id: string) => void; selected: Ordinance; progress: CivicProgress[]; onSelect: (id: string) => void; onOpen: (doc: SourceDocument) => void; onSave: (ordinanceId: string, stage: string, position: string | null, reflection: string) => Promise<boolean>; onMap: (id: string) => void; onBack: () => void }) {
  const meeting = MEETINGS.find((item) => item.id === meetingId) ?? NEXT_MEETING;
  return (
    <>
      {onSelectMeeting && <MeetingSwitcher currentId={meeting.id} onSelect={onSelectMeeting}/>}
      <SmartCivicSearch compact onOpenSource={onOpen} onOpenMeeting={onSelectMeeting} onOpenOrdinance={onSelect} />
      {meeting.id === GUIDED_MEETING_ID
        ? <GuidedSession selected={selected} progress={progress} onSelect={onSelect} onOpen={onOpen} onSave={onSave} onMap={onMap} onBack={onBack}/>
        : <MeetingBrowser key={meeting.id} meeting={meeting} onOpen={onOpen} onBack={onBack}/>}
    </>
  );
}
