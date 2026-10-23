import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { addUsage } from "../ai/claude";
import { calendarAttendees, mergeAttendees } from "../calendar";
import { integrations } from "../env";
import { logEvent, logStep } from "../log";
import { syncDraftToNotion } from "../notion";
import { downloadTranscript, findTranscriptFile, getParticipants, getRecording } from "../zoom/client";
import { getActiveProfile, listExamples } from "../voice";
import type { Attendee } from "../types";
import { cleanTranscript } from "./vtt";
import { extractFacts, qualityCheck, writeEmail } from "./steps";

export const MAX_ATTEMPTS = 3;

type Options = { force?: boolean; download?: { url: string; token?: string } };

// Runs one meeting through the whole pipeline. Safe to call twice: a meeting
// that already has a draft is skipped unless `force` is set.
export async function processMeeting(meetingId: number, opts: Options = {}) {
  const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId));
  if (!meeting) return;
  if (meeting.status === "processing" && !opts.force) return;

  const existing = await db.select({ id: schema.drafts.id }).from(schema.drafts).where(eq(schema.drafts.meetingId, meetingId));
  if (existing.length && !opts.force) {
    await logEvent(meetingId, "pipeline", "skipped", "Draft already exists");
    return;
  }

  await db
    .update(schema.meetings)
    .set({ status: "processing", error: null, attempts: meeting.attempts + 1, processingStartedAt: new Date() })
    .where(eq(schema.meetings.id, meetingId));

  try {
    // 1. Transcript
    let raw = meeting.transcriptRaw;
    if (!raw) {
      raw = await logStep(meetingId, "fetch_transcript", async () => {
        let url = opts.download?.url;
        if (!url) {
          const rec = await getRecording(meeting.externalId);
          url = findTranscriptFile(rec.recording_files)?.download_url;
        }
        if (!url) throw new Error("No transcript file on this recording yet");
        return downloadTranscript(url, opts.download?.token);
      }, (t) => `${t.length} chars`);
    }
    const clean = await logStep(meetingId, "clean_transcript", async () => cleanTranscript(raw!), (c) => `${c.speakers.length} speakers`);
    await db.update(schema.meetings).set({ transcriptRaw: raw, transcriptClean: clean.text }).where(eq(schema.meetings.id, meetingId));

    // 2. Attendees: manual entries, calendar invite, Zoom participants, speakers.
    const attendees = await logStep(meetingId, "match_attendees", async () => {
      const calendar = meeting.startTime
        ? await calendarAttendees(meeting.startTime, meeting.zoomMeetingId, meeting.topic).catch(() => null)
        : null;
      const zoom: Attendee[] | null =
        meeting.source !== "upload" && integrations().zoomApi
          ? (await getParticipants(meeting.externalId)).map((p) => ({ name: p.name, email: p.user_email?.toLowerCase() || null, source: "zoom" as const }))
          : null;
      const speakers: Attendee[] = clean.speakers.map((name) => ({ name, email: null, source: "zoom" }));
      return mergeAttendees([meeting.attendees, calendar, zoom, speakers]);
    }, (a) => `${a.length} attendees, ${a.filter((x) => !x.email).length} unmatched`);
    await db.update(schema.meetings).set({ attendees }).where(eq(schema.meetings.id, meetingId));

    // 3. AI steps
    const profile = await getActiveProfile();
    const examples = await listExamples();

    const facts = await logStep(meetingId, "extract_facts", () => extractFacts(clean.text, profile, meeting.meetingType),
      (r) => `${r.data.action_items.length} action items, ${r.data.decisions.length} decisions, $${r.usage.costUsd.toFixed(4)}`);
    const email = await logStep(meetingId, "write_email",
      () => writeEmail(facts.data, attendees, profile, examples, meeting.meetingType, meeting.topic),
      (r) => `$${r.usage.costUsd.toFixed(4)}`);
    const quality = await logStep(meetingId, "quality_check", () => qualityCheck(facts.data, email.data, attendees, profile),
      (r) => `${r.flags.length} flags`);

    const usage = addUsage(addUsage(facts.usage, email.usage), quality.usage);
    const to = attendees.filter((a) => a.email).map((a) => a.email).join(", ");

    if (opts.force) await db.delete(schema.drafts).where(eq(schema.drafts.meetingId, meetingId));
    const [draft] = await db
      .insert(schema.drafts)
      .values({
        meetingId,
        voiceVersion: profile.version,
        model: email.model,
        facts: facts.data,
        aiEmail: email.data,
        flags: quality.flags,
        to,
        subject: email.data.subject,
        body: email.data.body,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      })
      .returning();
    await db.update(schema.meetings).set({ status: "drafted" }).where(eq(schema.meetings.id, meetingId));

    // 4. Optional Notion mirror; a failure here never loses the draft.
    if (integrations().notion) {
      await logStep(meetingId, "notion_sync", async () => {
        const pageId = await syncDraftToNotion(draft, meeting);
        await db.update(schema.drafts).set({ notionPageId: pageId }).where(eq(schema.drafts.id, draft.id));
      }).catch(() => undefined);
    }
    return draft;
  } catch (err) {
    await db
      .update(schema.meetings)
      .set({ status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : String(err) })
      .where(eq(schema.meetings.id, meetingId));
  }
}
