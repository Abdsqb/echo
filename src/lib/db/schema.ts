import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { Attendee, Email, Facts, Flag, Judge, Proposal } from "../types";

const now = () => sql`(unixepoch() * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now());

export const meetings = sqliteTable(
  "meetings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Zoom meeting UUID, or "upload:<random>" for manual uploads. Unique, so
    // webhook retries and reconciliation can never create a second meeting.
    externalId: text("external_id").notNull(),
    source: text("source", { enum: ["webhook", "reconcile", "upload"] }).notNull(),
    topic: text("topic").notNull(),
    meetingType: text("meeting_type").notNull().default("general"),
    startTime: integer("start_time", { mode: "timestamp_ms" }),
    zoomMeetingId: text("zoom_meeting_id"),
    status: text("status", { enum: ["queued", "processing", "drafted", "failed", "skipped"] })
      .notNull()
      .default("queued"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    // Lets reconciliation detect runs that died mid-way (crash, deploy).
    processingStartedAt: integer("processing_started_at", { mode: "timestamp_ms" }),
    transcriptRaw: text("transcript_raw"),
    transcriptClean: text("transcript_clean"),
    attendees: text("attendees", { mode: "json" }).$type<Attendee[]>().notNull().default(sql`'[]'`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("meetings_external_id").on(t.externalId)],
);

export const drafts = sqliteTable("drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  meetingId: integer("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  voiceVersion: integer("voice_version").notNull(),
  model: text("model").notNull(),
  facts: text("facts", { mode: "json" }).$type<Facts>().notNull(),
  aiEmail: text("ai_email", { mode: "json" }).$type<Email>().notNull(),
  flags: text("flags", { mode: "json" }).$type<Flag[]>().notNull(),
  to: text("to").notNull().default(""),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["draft", "reviewed", "sent"] }).notNull().default("draft"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  notionPageId: text("notion_page_id"),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now()),
});

// Each save creates a new version; exactly one is active. Rollback = activate
// an older version.
export const voiceProfiles = sqliteTable("voice_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: integer("version").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  playbook: text("playbook").notNull(),
  rules: text("rules").notNull(),
  templates: text("templates", { mode: "json" })
    .$type<{ meetingType: string; guidance: string }[]>()
    .notNull()
    .default(sql`'[]'`),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

// Facts -> email pairs that teach the writer your voice.
export const examples = sqliteTable("examples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  meetingType: text("meeting_type").notNull().default("general"),
  title: text("title").notNull(),
  transcript: text("transcript"),
  facts: text("facts").notNull().default(""),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

export const proposals = sqliteTable("proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  proposal: text("proposal", { mode: "json" }).$type<Proposal>().notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  appliedVersion: integer("applied_version"),
  createdAt: createdAt(),
});

// Step-by-step run log. Never stores transcript text.
export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  meetingId: integer("meeting_id"),
  step: text("step").notNull(),
  status: text("status", { enum: ["ok", "error", "skipped"] }).notNull(),
  detail: text("detail").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: createdAt(),
});

export const evalCases = sqliteTable("eval_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  meetingType: text("meeting_type").notNull().default("general"),
  transcript: text("transcript").notNull(),
  sentEmail: text("sent_email").notNull(),
  createdAt: createdAt(),
});

export type EvalCaseResult = {
  caseId: number;
  name: string;
  email: Email | null;
  judge: Judge | null;
  error: string | null;
  costUsd: number;
};

export const evalRuns = sqliteTable("eval_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  model: text("model").notNull(),
  voiceVersion: integer("voice_version").notNull(),
  status: text("status", { enum: ["running", "done", "failed"] }).notNull().default("running"),
  results: text("results", { mode: "json" }).$type<EvalCaseResult[]>().notNull().default(sql`'[]'`),
  recall: real("recall"),
  inventedFacts: integer("invented_facts"),
  toneScore: real("tone_score"),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: createdAt(),
});

export type Meeting = typeof meetings.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type Example = typeof examples.$inferSelect;
