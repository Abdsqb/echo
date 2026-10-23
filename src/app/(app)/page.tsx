import Link from "next/link";
import { desc, eq, gte, sum } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { AutoRefresh } from "@/components/client";
import { Empty, fmtDate, fmtUsd, GuardChip, PageHeader, Stat, Status } from "@/components/ui";

export default async function Inbox() {
  const rows = await db
    .select({ meeting: schema.meetings, draft: schema.drafts })
    .from(schema.meetings)
    .leftJoin(schema.drafts, eq(schema.drafts.meetingId, schema.meetings.id))
    .orderBy(desc(schema.meetings.createdAt))
    .limit(100);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ cost }] = await db.select({ cost: sum(schema.drafts.costUsd) }).from(schema.drafts).where(gte(schema.drafts.createdAt, monthStart));

  const toReview = rows.filter((r) => r.draft && r.draft.status !== "sent").length;
  const sent = rows.filter((r) => r.draft?.status === "sent" && r.draft.sentAt && r.draft.sentAt >= monthStart).length;
  const openFlags = rows.filter((r) => r.draft && r.draft.status !== "sent").reduce((n, r) => n + (r.draft?.flags.length ?? 0), 0);
  const working = rows.some((r) => r.meeting.status === "queued" || r.meeting.status === "processing");

  return (
    <>
      <AutoRefresh active={working} />
      <PageHeader
        stage="04 · review"
        title="Inbox"
        sub="Drafts waiting for you. Echo never sends; you review, copy and send."
        actions={
          <Link href="/meetings/new" className="btn-primary">
            New meeting
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To review" value={toReview} tone="accent" />
        <Stat label="Open flags" value={openFlags} tone="guard" />
        <Stat label="Sent this month" value={sent} tone="ctx" />
        <Stat label="AI cost this month" value={fmtUsd(Number(cost ?? 0))} />
      </div>

      {rows.length === 0 ? (
        <Empty title="No meetings yet" href="/meetings/new" cta="Upload a transcript">
          Drafts appear here automatically after Zoom meetings once the webhook is connected. Until then, upload a transcript to try it, or use the sample in <code className="font-mono">samples/</code>.
        </Empty>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {rows.map(({ meeting, draft }) => (
            <Link
              key={meeting.id}
              href={draft ? `/drafts/${draft.id}` : `/meetings/${meeting.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-panel-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{draft?.subject || meeting.topic}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted">
                  <span>{meeting.topic}</span>
                  <span>{fmtDate(meeting.startTime ?? meeting.createdAt)}</span>
                  <span>{meeting.meetingType}</span>
                  <span>{meeting.source}</span>
                </div>
              </div>
              {draft && draft.flags.length > 0 && draft.status !== "sent" && <GuardChip>{draft.flags.length} flags</GuardChip>}
              <Status value={draft ? draft.status : meeting.status} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
