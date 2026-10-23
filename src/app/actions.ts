"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, safeEqual, SESSION_COOKIE, verifySession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { executeEvalRun, startEvalRun } from "@/lib/evals";
import { createUpload, reconcile } from "@/lib/ingest";
import { approveProposal, proposeFromDraft, rejectProposal } from "@/lib/learning";
import { logEvent } from "@/lib/log";
import { createFollowupsDatabase, syncDraftToNotion } from "@/lib/notion";
import { processMeeting } from "@/lib/pipeline/run";
import { extractFacts } from "@/lib/pipeline/steps";
import { cleanTranscript } from "@/lib/pipeline/vtt";
import type { Attendee } from "@/lib/types";
import { activateVersion, getActiveProfile, saveProfileVersion } from "@/lib/voice";

// Middleware already guards these routes; actions check again so a
// misconfigured matcher can never expose a write.
async function assertAuth() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(SESSION_COOKIE)?.value))) redirect("/login");
}

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const num = (f: FormData, key: string) => Number(f.get(key));

// ---------- auth ----------

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const password = env.appPassword();
  if (!password) return { error: "APP_PASSWORD is not set on the server." };
  if (!safeEqual(str(form, "password"), password)) return { error: "Wrong password." };
  const { token, maxAge } = await createSession();
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge, path: "/" });
  const next = str(form, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- meetings ----------

function parseAttendees(text: string): Attendee[] {
  return text
    .split(/\n|,(?![^<]*>)/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const angle = line.match(/^(.*)<([^>]+@[^>]+)>$/);
      if (angle) return { name: angle[1].trim() || angle[2], email: angle[2].trim().toLowerCase(), source: "manual" as const };
      if (/^\S+@\S+$/.test(line)) return { name: line.split("@")[0], email: line.toLowerCase(), source: "manual" as const };
      return { name: line, email: null, source: "manual" as const };
    });
}

export async function uploadMeeting(form: FormData) {
  await assertAuth();
  const transcript = str(form, "transcript");
  if (!transcript) throw new Error("Paste or upload a transcript first.");
  const date = str(form, "date");
  const { id } = await createUpload({
    topic: str(form, "topic") || "Untitled meeting",
    meetingType: str(form, "meetingType") || "general",
    transcript,
    attendees: parseAttendees(str(form, "attendees")),
    startTime: date ? new Date(date) : null,
  });
  await logEvent(id, "upload", "ok", "Transcript uploaded");
  after(() => processMeeting(id));
  redirect(`/meetings/${id}`);
}

export async function retryMeeting(form: FormData) {
  await assertAuth();
  const id = num(form, "id");
  after(() => processMeeting(id, { force: true }));
  await db.update(schema.meetings).set({ status: "queued", error: null }).where(eq(schema.meetings.id, id));
  redirect(`/meetings/${id}`);
}

export async function deleteMeeting(form: FormData) {
  await assertAuth();
  await db.delete(schema.meetings).where(eq(schema.meetings.id, num(form, "id")));
  redirect("/");
}

// ---------- drafts ----------

// Browsers submit textarea newlines as \r\n; store \n so the learning loop's
// "did the user edit this?" comparison is exact.
const body = (f: FormData) => String(f.get("body") ?? "").replace(/\r\n?/g, "\n");

export async function saveDraft(form: FormData) {
  await assertAuth();
  const id = num(form, "id");
  await db
    .update(schema.drafts)
    .set({ to: str(form, "to"), subject: str(form, "subject"), body: body(form), updatedAt: new Date() })
    .where(eq(schema.drafts.id, id));
  revalidatePath(`/drafts/${id}`);
}

// Bound per button (setDraftStatus.bind(null, "sent")) so the status never
// depends on which submitter the browser reports.
export async function setDraftStatus(status: "draft" | "reviewed" | "sent", form: FormData) {
  await assertAuth();
  if (!["draft", "reviewed", "sent"].includes(status)) throw new Error(`Invalid status: ${status}`);
  const id = num(form, "id");
  if (form.has("body")) {
    await db
      .update(schema.drafts)
      .set({ to: str(form, "to"), subject: str(form, "subject"), body: body(form) })
      .where(eq(schema.drafts.id, id));
  }
  await db
    .update(schema.drafts)
    .set({ status, sentAt: status === "sent" ? new Date() : null, updatedAt: new Date() })
    .where(eq(schema.drafts.id, id));

  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.id, id));
  if (status === "sent") after(() => proposeFromDraft(id));
  if (draft?.notionPageId) {
    const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, draft.meetingId));
    after(() => syncDraftToNotion(draft, meeting).catch(() => undefined));
  }
  revalidatePath(`/drafts/${id}`);
  revalidatePath("/");
}

export async function regenerateDraft(form: FormData) {
  await assertAuth();
  const meetingId = num(form, "meetingId");
  await db.update(schema.meetings).set({ status: "queued" }).where(eq(schema.meetings.id, meetingId));
  after(() => processMeeting(meetingId, { force: true }));
  redirect(`/meetings/${meetingId}`);
}

export async function syncNotion(form: FormData) {
  await assertAuth();
  const id = num(form, "id");
  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.id, id));
  const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, draft.meetingId));
  const pageId = await syncDraftToNotion(draft, meeting);
  await db.update(schema.drafts).set({ notionPageId: pageId }).where(eq(schema.drafts.id, id));
  revalidatePath(`/drafts/${id}`);
}

// ---------- voice profile ----------

export async function saveVoice(form: FormData) {
  await assertAuth();
  const templates = str(form, "templates")
    .split("\n")
    .map((l) => l.match(/^\s*([\w -]+?)\s*:\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ meetingType: m[1].trim().toLowerCase(), guidance: m[2].trim() }));
  await saveProfileVersion({ playbook: String(form.get("playbook") ?? ""), rules: String(form.get("rules") ?? ""), templates, note: str(form, "note") || "Manual edit" });
  revalidatePath("/voice");
}

export async function activateVoice(form: FormData) {
  await assertAuth();
  await activateVersion(num(form, "version"));
  revalidatePath("/voice");
}

export async function addExample(form: FormData) {
  await assertAuth();
  const email = str(form, "email");
  if (!email) throw new Error("The sent email is required.");
  await db.insert(schema.examples).values({
    title: str(form, "title") || "Untitled example",
    meetingType: str(form, "meetingType") || "general",
    transcript: str(form, "transcript") || null,
    facts: str(form, "facts"),
    email,
  });
  revalidatePath("/voice");
}

export async function deleteExample(form: FormData) {
  await assertAuth();
  await db.delete(schema.examples).where(eq(schema.examples.id, num(form, "id")));
  revalidatePath("/voice");
}

// Turns an example's transcript into facts with the same extractor the
// pipeline uses, so examples teach "facts -> email" exactly.
export async function extractExampleFacts(form: FormData) {
  await assertAuth();
  const id = num(form, "id");
  const [ex] = await db.select().from(schema.examples).where(eq(schema.examples.id, id));
  if (!ex?.transcript) return;
  const facts = await extractFacts(cleanTranscript(ex.transcript).text, await getActiveProfile(), ex.meetingType);
  await db.update(schema.examples).set({ facts: JSON.stringify(facts.data, null, 2) }).where(eq(schema.examples.id, id));
  revalidatePath("/voice");
}

// ---------- learning ----------

export async function approve(form: FormData) {
  await assertAuth();
  await approveProposal(num(form, "id"));
  revalidatePath("/learning");
}

export async function reject(form: FormData) {
  await assertAuth();
  await rejectProposal(num(form, "id"));
  revalidatePath("/learning");
}

// ---------- evals ----------

export async function addEvalCase(form: FormData) {
  await assertAuth();
  const transcript = str(form, "transcript");
  const sentEmail = str(form, "sentEmail");
  if (!transcript || !sentEmail) throw new Error("Transcript and sent email are both required.");
  await db.insert(schema.evalCases).values({ name: str(form, "name") || "Untitled case", meetingType: str(form, "meetingType") || "general", transcript, sentEmail });
  revalidatePath("/evals");
}

export async function deleteEvalCase(form: FormData) {
  await assertAuth();
  await db.delete(schema.evalCases).where(eq(schema.evalCases.id, num(form, "id")));
  revalidatePath("/evals");
}

export async function runEval(form: FormData) {
  await assertAuth();
  const runId = await startEvalRun(str(form, "model") || env.model());
  after(() => executeEvalRun(runId));
  revalidatePath("/evals");
}

// ---------- operations ----------

export async function runReconcile() {
  await assertAuth();
  after(() => reconcile().catch((err) => logEvent(null, "reconcile", "error", err instanceof Error ? err.message : String(err))));
  revalidatePath("/runs");
}

export async function setupNotionDatabase() {
  await assertAuth();
  const id = await createFollowupsDatabase();
  redirect(`/settings?notionDb=${encodeURIComponent(id)}`);
}
