"use client";

import { useEffect, useState } from "react";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { getSnapshotFreshness, SNAPSHOT_STALE_AFTER_DAYS } from "@/lib/hub-sources";
import { LIVE_SOURCE_CHECK, MEETING_STATS, OFFICIAL_SCHEDULE_URL, UPCOMING_MEETINGS, evaluateMeetingCalendarAt, formatEvaluationTimestamp } from "@/lib/civic-data";

const BUILD_REFERENCE_DATE = MEETING_STATS.calendarStatusEvaluatedAt
  ? new Date(MEETING_STATS.calendarStatusEvaluatedAt)
  : new Date(0);
const SCHEDULE_CHECK_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function HubSnapshotFreshness({ note }: { note?: string }) {
  const [viewerNow, setViewerNow] = useState<Date | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setViewerNow(new Date()));
    const timer = window.setInterval(() => setViewerNow(new Date()), 60_000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);

  const reference = viewerNow ?? BUILD_REFERENCE_DATE;
  const freshness = getSnapshotFreshness(undefined, reference);
  const expiredMeetings = viewerNow
    ? UPCOMING_MEETINGS.filter((meeting) => evaluateMeetingCalendarAt(meeting, viewerNow).expired)
    : [];
  const checkMs = LIVE_SOURCE_CHECK?.observedAt ? Date.parse(LIVE_SOURCE_CHECK.observedAt) : NaN;
  const checkFailed = LIVE_SOURCE_CHECK?.ok === false;
  const checkUnknown = !LIVE_SOURCE_CHECK || !Number.isFinite(checkMs);
  const ageMs = reference.getTime() - checkMs;
  const checkOverdue = !checkUnknown && (ageMs > SCHEDULE_CHECK_MAX_AGE_MS || ageMs < -300_000 || LIVE_SOURCE_CHECK?.stale === true);
  const checkWarning = checkFailed || checkUnknown || checkOverdue;
  const staleOrExpired = freshness.stale || expiredMeetings.length > 0 || checkWarning;
  const evaluatedLabel = formatEvaluationTimestamp(freshness.calendarEvaluatedAt);
  const watcherLabel = formatEvaluationTimestamp(freshness.watcherCheckedAt);
  const scheduleLabel = formatEvaluationTimestamp(LIVE_SOURCE_CHECK?.observedAt);

  return (
    <p className={`gov-freshness${staleOrExpired ? " gov-freshness--stale" : ""}`} data-expired={expiredMeetings.length > 0 ? "true" : "false"} data-schedule-check={checkFailed ? "failed" : checkUnknown ? "unknown" : checkOverdue ? "overdue" : "recent"}>
      <span className="gov-freshness-icon" aria-hidden="true">{staleOrExpired ? <TriangleAlert size={14} /> : <CalendarClock size={14} />}</span>
      <span>
        <strong>{`Record snapshot · ${freshness.capturedLabel}`}</strong> ({freshness.ageLabel}
        {watcherLabel ? ` · watcher baseline ${watcherLabel}` : ""}
        {scheduleLabel ? ` · latest schedule check attempt ${scheduleLabel}` : ""}
        {evaluatedLabel ? ` · calendar evaluated ${evaluatedLabel}` : ""})
        {checkFailed ? <> — <strong>Latest official schedule check failed.</strong> Previously captured records are not confirmation of the current schedule.</>
          : checkUnknown ? <> — <strong>Official schedule check status unknown.</strong> No valid live-check timestamp is available in this build.</>
          : checkOverdue ? <> — <strong>Official schedule check is stale or its timestamp needs review.</strong> The check exceeds the two-hour freshness target, was marked stale, or has an inconsistent timestamp.</>
          : <> — Official schedule check succeeded within the two-hour freshness target as of this evaluation; later changes remain possible.</>}
        {expiredMeetings.length > 0 && <> — <strong>Snapshot validity window passed</strong> for {expiredMeetings.map((m) => `${m.bodyLabel} (${m.shortDate})`).join(", ")}. Scheduled time has passed; outcomes are not verified by this warning.</>}
        {freshness.stale && ` — Archive snapshot is at least ${SNAPSHOT_STALE_AFTER_DAYS} days old; a recent schedule check does not refresh archived agenda contents.`}
        {note ? ` — ${note}` : ""}
        {" "}<a href={OFFICIAL_SCHEDULE_URL} target="_blank" rel="noopener noreferrer">Confirm current postings on the official City of Cheyenne calendar</a>.
      </span>
    </p>
  );
}

export default HubSnapshotFreshness;
