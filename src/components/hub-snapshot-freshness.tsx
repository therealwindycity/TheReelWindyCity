import { CalendarClock, TriangleAlert } from "lucide-react";
import { getSnapshotFreshness, SNAPSHOT_STALE_AFTER_DAYS } from "@/lib/hub-sources";

/**
 * Tells a visitor how old the underlying record snapshot is.
 *
 * The hub is a static export, so the numbers here describe the last time these
 * records were reconciled with the city's postings — never a live reading.
 */
export default function HubSnapshotFreshness({ note }: { note?: string }) {
  const freshness = getSnapshotFreshness();

  return (
    <p className={`gov-freshness${freshness.stale ? " gov-freshness--stale" : ""}`}>
      <span className="gov-freshness-icon" aria-hidden="true">
        {freshness.stale ? <TriangleAlert size={14} /> : <CalendarClock size={14} />}
      </span>
      <span>
        <strong>Record snapshot · {freshness.capturedLabel}</strong> ({freshness.ageLabel})
        {freshness.stale
          ? ` — older than ${SNAPSHOT_STALE_AFTER_DAYS} days. Confirm current postings with the city before relying on these items.`
          : note
            ? ` — ${note}`
            : " — items and availability can change after this snapshot."}
      </span>
    </p>
  );
}
