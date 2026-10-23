import Link from "next/link";
import { desc } from "drizzle-orm";
import { approve, reject } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Empty, fmtDate, PageHeader, Status } from "@/components/ui";
import { db, schema } from "@/lib/db";

const KIND: Record<string, string> = { add_rule: "+ rule", remove_rule: "− rule", edit_playbook: "playbook" };

export default async function LearningPage() {
  const rows = await db.select().from(schema.proposals).orderBy(desc(schema.proposals.createdAt)).limit(50);
  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader
        stage="loop · learning"
        title="Learning"
        sub="When you mark a draft sent, Echo compares its draft with what you actually sent and proposes changes. Nothing changes until you approve."
      />

      {pending.length === 0 ? (
        <Empty title="No pending proposals">Edit a draft, then mark it sent. If your edits show a reusable preference, a proposal shows up here.</Empty>
      ) : (
        <div className="space-y-4">
          {pending.map((p) => (
            <div key={p.id} className="card p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-soft">{p.proposal.summary}</p>
                <Link href={`/drafts/${p.draftId}`} className="font-mono text-[11px] text-accent">
                  from draft #{p.draftId}
                </Link>
              </div>
              <ul className="mb-5 space-y-3">
                {p.proposal.changes.map((c, i) => (
                  <li key={i} className="rounded-lg border border-line bg-bg p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-accent-bg px-1.5 font-mono text-[11px] text-accent">{KIND[c.kind]}</span>
                      <span className="text-sm">{c.text}</span>
                    </div>
                    <div className="text-xs text-muted">{c.rationale}</div>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <form action={approve}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton pendingText="Applying…">Approve → new voice version</SubmitButton>
                </form>
                <form action={reject}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn">Reject</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold">History</h2>
          <div className="card divide-y divide-line">
            {history.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <span className="flex-1 text-sm text-soft">{p.proposal.summary}</span>
                {p.appliedVersion && <span className="font-mono text-[11px] text-muted">→ v{p.appliedVersion}</span>}
                <span className="font-mono text-[11px] text-muted">{fmtDate(p.createdAt)}</span>
                <Status value={p.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
