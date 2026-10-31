import { citedWyomingStatutes, findLegalReview, matchedMinutes, minutesDiscovery, potentialShortReadingInterval } from "@/lib/legal-cross-reference";
import styles from "./legal-cross-reference.module.css";

const statusLabels = {
  unverified: "Not verified", partial: "Partial evidence", supported: "Supported by evidence",
  conflicting: "Conflicting evidence", "not-applicable": "Not applicable (reviewed)",
};

export default function LegalCrossReference({ meetingId, itemNumber, text, kind, sourceUrl }: { meetingId: string; itemNumber: string | number; text: string; kind?: string; sourceUrl?: string | null }) {
  const review = findLegalReview(meetingId, itemNumber, text);
  const citations = citedWyomingStatutes(text);
  const minutes = matchedMinutes(meetingId, itemNumber, text);
  const timingFlag = potentialShortReadingInterval(minutes);
  const discovery = minutesDiscovery(meetingId);
  const readingEvidence = minutes.some(e => e.reading !== null);
  const finalEvidence = minutes.some(e => e.reading === 3 && e.outcome.includes("approval motion recorded as carried"));
  const city = meetingId.startsWith("city-council-");
  const annexation = city && /\bannex(?:ation|ing|ed)?\b/i.test(text);
  const zoning = city && /\bzoning|unified development code\b/i.test(text);
  const councilOrdinance = city && (/^ordinance\b/i.test((kind ?? "").trim()) || /^ordinance\b/i.test(text.replace(/^\[CA\]\s*/i, "")));
  return (
    <details className={styles.panel}>
      <summary>Legal authority &amp; passage cross-reference <span>{review ? "Partial review" : "Automated check · unverified"}</span></summary>
      {review ? <div className={styles.content}>
        <p>Item {itemNumber} · {review.title} · reviewed {review.reviewedAt}. {review.note}</p>
        <p className={styles.caution}>This is a research checklist, not a finding of compliance or illegality. Authorities and requirements may not be exhaustive; confirm the law in force at each relevant date and consult counsel.</p>
        <h4>Authority and legal context</h4>
        <ul>{review.authorities.map((authority) => <li key={authority.citation}><a href={authority.url} target="_blank" rel="noreferrer">{authority.citation} ↗</a> — {authority.name}{authority.note ? ` ${authority.note}` : ""}</li>)}</ul>
        <h4>Requirements and evidence</h4>
        {review.requirements.map((requirement) => <section key={requirement.id} className={styles.requirement}>
          <h5>{requirement.title} <span>{statusLabels[requirement.status]}</span></h5>
          <p><strong>Law:</strong> {requirement.law}. {requirement.requirement}</p>
          <p><strong>Evidence / limitation:</strong> {requirement.finding}</p>
          {requirement.evidence.length > 0 && <p><strong>Record:</strong> {requirement.evidence.map((evidence, index) => <span key={evidence.url}>{index > 0 && " · "}<a href={evidence.url} target="_blank" rel="noreferrer">{evidence.label} ↗</a></span>)}</p>}
          <p><strong>Next:</strong> {requirement.next}</p>
        </section>)}
      </div> : <div className={styles.content}>
        <p><strong>Automated screening only — no finding of compliance or illegality.</strong> This does not establish which laws apply, identify every requirement, or assess the law in force at the action date.</p>
        {sourceUrl && <p><a href={sourceUrl} target="_blank" rel="noreferrer">Source agenda ↗</a></p>}
        {citations.length ? <><h4>Statutes cited in this agenda item</h4><ul>{citations.map((citation) => <li key={citation}><a href={`https://wyoleg.gov/statutes/compress/title${citation.split("-")[0]}.pdf`} target="_blank" rel="noreferrer">Wyo. Stat. § {citation} ↗</a> — cited in the agenda; authority and applicability not independently verified.</li>)}</ul></> : <p>No Wyoming statute citation was detected in the indexed agenda text. This does not mean none applies.</p>}
        {(annexation || zoning) && <><h4>Potential subject-specific authorities</h4><ul>{annexation && <li><a href="https://wyoleg.gov/statutes/compress/title15.pdf" target="_blank" rel="noreferrer">Wyo. Stat. §§ 15-1-401–410 ↗</a> — annexation authority, notices, hearing and conditions may be relevant; land ownership and statutory exceptions matter.</li>}{zoning && <li><a href="https://wyoleg.gov/statutes/compress/title15.pdf" target="_blank" rel="noreferrer">Wyo. Stat. §§ 15-1-601–611 ↗</a> — zoning powers and procedures may be relevant, together with the local UDC and law effective at the time.</li>}</ul><p>Notice, hearing, jurisdiction and applicable exceptions remain unverified.</p></>}
        {councilOrdinance && <><h4>Candidate ordinance passage checks</h4><p>For city ordinances, <a href="https://wyoleg.gov/statutes/compress/title15.pdf" target="_blank" rel="noreferrer">Wyo. Stat. §§ 15-1-115–117 ↗</a> address readings, vote, publication and amendment; confirm applicability, the law as of the action date, and any exceptions.</p><ul><li><strong>Three readings and elapsed time:</strong> {readingEvidence ? "Partial candidate evidence below; complete procedure not verified." : "Not verified; no matching reading records were found."}</li><li><strong>Passage vote:</strong> {finalEvidence ? "A final approval motion may be recorded below; the vote threshold is not verified." : "Not verified; no matching final approval was identified."}</li><li><strong>Publication and effective date:</strong> Not verified; locate the signed text and publication record.</li></ul></>}
        <p>For other requirements and governing authority, records have not yet been established. Not every agenda entry is an ordinance; no generic passage rule is assumed for non-ordinance items.</p>
        <p><a href="https://wyoleg.gov/statutes/compress/title15.pdf" target="_blank" rel="noreferrer">Browse Wyoming Title 15 ↗</a> · <a href="https://www.cheyennecity.org/Your-Government/Departments/City-Clerk/City-CodeUDC" target="_blank" rel="noreferrer">Cheyenne code and UDC ↗</a></p>
      </div>}
      {minutes.length === 0 && <div className={styles.content}><h4>Automated minutes search</h4><p>{discovery?.available ? "Minutes were indexed, but no sufficiently distinct item match was found; this is not evidence of a procedural failure." : discovery?.lastError ? `Minutes could not be extracted on ${discovery.lastAttempt}: ${discovery.lastError}.` : discovery?.sourceUrl ? "Minutes have not yet been indexed; automated attempts continue." : "No minutes source is indexed for this meeting."}</p>{discovery?.sourceUrl && <p><a href={discovery.sourceUrl} target="_blank" rel="noreferrer">Available minutes source ↗</a></p>}</div>}
      {minutes.length > 0 && <div className={styles.content}>
        <h4>Automated cross-reference to minutes</h4>
        <p>Possible text matches, not confirmed measure identity or compliance. Machine-extracted text and votes can be wrong; check each linked record. A reading listed on an agenda or in minutes is not necessarily an approved reading.</p>
        {timingFlag && <p className={styles.caution}><strong>Potential timing conflict for follow-up:</strong> candidate first reading {timingFlag.first} and a recorded final approval motion {timingFlag.last} are {timingFlag.days} days apart. Wyo. Stat. § 15-1-115(c) states a ten-day interval for ordinary ordinances. Confirm the measure identity, historical statute, action dates and any emergency exception before concluding there was a violation.</p>}
        <ul>{minutes.map((entry, index) => <li key={`${entry.date}-${entry.reading}-${index}`}><a href={entry.url} target="_blank" rel="noreferrer">Minutes · {entry.date} ↗</a>{entry.reading ? ` · ${entry.reading}${entry.reading === 1 ? "st" : entry.reading === 2 ? "nd" : "rd"} reading` : ""} · {entry.outcome}. {entry.transcription && <em>{entry.transcription} </em>}<blockquote>{entry.excerpt}</blockquote></li>)}</ul>
      </div>}
    </details>
  );
}
