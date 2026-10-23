import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { deleteMeeting, retryMeeting } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { fmtDate, PageHeader, Status } from "@/components/ui";
import { db, schema } from "@/lib/db";

const STEPS = ["fetch_transcript", "clean_transcript", "match_attendees", "extract_facts", "write_email", "quality_check"];

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id));
  if (!meeting) notFound();

  const [draft] = await db.select({ id: schema.drafts.id }).from(schema.drafts).where(eq(schema.drafts.meetingId, id));
  if (draft && meeting.status === "drafted") redirect(`/drafts/${draft.id}`);

  const log = await db.select().from(schema.runs).where(eq(schema.runs.meetingId, id)).orderBy(asc(schema.runs.id));
  const working = meeting.status === "queued" || meeting.status === "processing";
  const steps = STEPS.filter((s) => !(s === "fetch_transcript" && meeting.source === "upload"));

  return (
    <>
      <AutoRefresh active={working} ms={1500} />
      <PageHeader stage="pipeline" title={meeting.topic} sub={`${meeting.source} · ${meeting.meetingType} · ${fmtDate(meeting.startTime ?? meeting.createdAt)}`} actions={<Status value={meeting.status} />} />

      <div className="card p-6">
        <ol className="space-y-3">
          {steps.map((step) => {
            const entry = log.filter((l) => l.step === step).at(-1);
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    entry?.status === "ok" ? "bg-ok" : entry?.status === "error" ? "bg-danger" : working ? "animate-pulse bg-accent" : "bg-line"
                  }`}
                />
                <span className="w-40 font-mono text-xs">{step}</span>
                <span className="font-mono text-xs text-muted">{entry ? `${entry.detail} · ${entry.durationMs}ms` : "…"}</span>
              </li>
            );
          })}
        </ol>

        {meeting.status === "failed" && (
          <div className="mt-6 rounded-lg border border-danger/50 bg-danger-bg p-4">
            <div className="mb-1 font-medium text-danger">Pipeline failed (attempt {meeting.attempts})</div>
            <div className="font-mono text-xs text-soft">{meeting.error}</div>
            <div className="mt-4 flex gap-2">
              <form action={retryMeeting}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton pendingText="Retrying…">Retry</SubmitButton>
              </form>
              <form action={deleteMeeting}>
                <input type="hidden" name="id" value={id} />
                <button className="btn-danger">Delete</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
