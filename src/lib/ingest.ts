import crypto from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { logEvent } from "./log";
import { MAX_ATTEMPTS, processMeeting } from "./pipeline/run";
import { findTranscriptFile, listRecordings, type ZoomRecording } from "./zoom/client";
import type { Attendee } from "./types";

// Inserts a meeting once. The unique external id is the dedupe guard: Zoom
// webhook retries and the reconciliation job both land here.
async function insertOnce(values: typeof schema.meetings.$inferInsert) {
  const inserted = await db.insert(schema.meetings).values(values).onConflictDoNothing().returning({ id: schema.meetings.id });
  if (inserted.length) return { id: inserted[0].id, isNew: true };
  const [existing] = await db.select({ id: schema.meetings.id }).from(schema.meetings).where(eq(schema.meetings.externalId, values.externalId));
  return { id: existing.id, isNew: false };
}

export async function ingestZoomRecording(rec: ZoomRecording, source: "webhook" | "reconcile") {
  return insertOnce({
    externalId: rec.uuid,
    source,
    topic: rec.topic || "Zoom meeting",
    startTime: rec.start_time ? new Date(rec.start_time) : null,
    zoomMeetingId: String(rec.id ?? ""),
  });
}

export async function createUpload(input: { topic: string; meetingType: string; transcript: string; attendees: Attendee[]; startTime: Date | null }) {
  return insertOnce({
    externalId: `upload:${crypto.randomUUID()}`,
    source: "upload",
    topic: input.topic,
    meetingType: input.meetingType,
    transcriptRaw: input.transcript,
    attendees: input.attendees,
    startTime: input.startTime,
  });
}

// Daily safety net: picks up any recording whose webhook was missed, and
// retries failed meetings that still have attempts left.
export async function reconcile(days = 2) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const recordings = await listRecordings(iso(from), iso(to));
  let added = 0;
  for (const rec of recordings) {
    if (!findTranscriptFile(rec.recording_files)) continue;
    const { id, isNew } = await ingestZoomRecording(rec, "reconcile");
    if (isNew) {
      added++;
      await processMeeting(id);
    }
  }

  const retryable = await db
    .select({ id: schema.meetings.id })
    .from(schema.meetings)
    .where(and(inArray(schema.meetings.status, ["failed", "queued"]), lt(schema.meetings.attempts, MAX_ATTEMPTS)));
  for (const m of retryable) await processMeeting(m.id);

  // Runs stuck in "processing" for 15+ minutes died mid-way; restart them.
  const stuck = await db
    .select({ id: schema.meetings.id })
    .from(schema.meetings)
    .where(
      and(
        eq(schema.meetings.status, "processing"),
        lt(schema.meetings.processingStartedAt, new Date(Date.now() - 15 * 60 * 1000)),
        lt(schema.meetings.attempts, MAX_ATTEMPTS),
      ),
    );
  for (const m of stuck) await processMeeting(m.id, { force: true });

  const summary = `${recordings.length} recordings checked, ${added} missed meetings added, ${retryable.length} retried, ${stuck.length} stuck runs restarted`;
  await logEvent(null, "reconcile", "ok", summary);
  return summary;
}
