"use client";

import { useEffect, useState } from "react";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { getSnapshotFreshness, SNAPSHOT_STALE_AFTER_DAYS } from "@/lib/hub-sources";
import {
  MEETING_STATS,
  OFFICIAL_SCHEDULE_URL,
  UPCOMING_MEETINGS,
  evaluateMeetingCalendarAt,
  formatEvaluationTimestamp,
} from "@/lib/civic-data";

const BUILD_REFERENCE_DATE = MEETING_STATS.calendarStatusEvaluatedAt
  ? new Date(MEETING_STATS.calendarStatusEvaluatedAt)
  : new Date();

/**
 * Reports the age of the underlying record snapshot and, after client hydration,
 * flags any pre-rendered upcoming meeting whose America/Denver validity window
 * has since passed even if scheduled rebuilds failed.
 */
export function HubSnapshotFreshness({ note }: { note?: string }) {
  const [viewerNow, setViewerNow] = useState<Date | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setViewerNow(new Date()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const freshness = getSnapshotFreshness(undefined, viewerNow ?? BUILD_REFERENCE_DATE);
  const expiredMeetings = viewerNow
    ? UPCOMING_MEETINGS.filter((meeting) => evaluateMeetingCalendarAt(meeting, viewerNow).expired)
    : [];
  const staleOrExpired = freshness.stale || expiredMeetings.length > 0;
  const evaluatedLabel = formatEvaluationTimestamp(freshness.calendarEvaluatedAt);
  const watcherLabel = formatEvaluationTimestamp(freshness.watcherCheckedAt);
  const scheduleLabel = formatEvaluationTimestamp(freshness.scheduleCheckedAt);

  return (
    <p
      className={`gov-freshness${staleOrExpired ? " gov-freshness--stale" : ""}`}
      data-expired={expiredMeetings.length > 0 ? "true" : "false"}
    >
      <span className="gov-freshness-icon" aria-hidden="true">
        {staleOrExpired ? <TriangleAlert size={14} /> : <CalendarClock size={14} />}
      </span>
      <span>
        <strong>{`Record snapshot · ${freshness.capturedLabel}`}</strong> ({freshness.ageLabel}
        {watcherLabel ? ` · watcher baseline ${watcherLabel}` : ""}
        {scheduleLabel ? ` · schedule check ${scheduleLabel}` : ""}
        {evaluatedLabel ? ` · calendar evaluated ${evaluatedLabel}` : ""})
        {expiredMeetings.length > 0 ? (
          <>
            {" "}
            — <strong>Snapshot validity window passed</strong> for{" "}
            {expiredMeetings.map((m) => `${m.bodyLabel} (${m.shortDate})`).join(", ")}. Scheduled time has passed without
            a verified outcome in this static build; confirm status on{" "}
            <a href={OFFICIAL_SCHEDULE_URL} target="_blank" rel="noopener noreferrer">
              the official City of Cheyenne calendar
            </a>
            .
          </>
        ) : freshness.stale ? (
          ` — older than ${SNAPSHOT_STALE_AFTER_DAYS} days. Confirm current postings on the official City of Cheyenne calendar before relying on these items.`
        ) : note ? (
          ` — ${note}`
        ) : (
          " — items and availability can change after this snapshot."
        )}
      </span>
    </p>
  );
}

export default HubSnapshotFreshness;
