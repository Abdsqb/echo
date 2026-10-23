import Link from "next/link";
import { desc } from "drizzle-orm";
import { runReconcile } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Empty, fmtDate, PageHeader, Status } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { integrations } from "@/lib/env";

export default async function RunsPage() {
  const rows = await db.select().from(schema.runs).orderBy(desc(schema.runs.id)).limit(200);
  const zoom = integrations().zoomApi;

  return (
    <>
      <PageHeader
        stage="ops · run log"
        title="Run log"
        sub="Every pipeline step with status and timing. Transcript and email text are never logged."
        actions={
          <form action={runReconcile}>
            <SubmitButton className="btn" pendingText="Queued…">
              {zoom ? "Run reconciliation now" : "Reconciliation (needs Zoom API)"}
            </SubmitButton>
          </form>
        }
      />
      {rows.length === 0 ? (
        <Empty title="Nothing has run yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr className="label">
                <th className="px-5 py-3">When</th>
                <th>Meeting</th>
                <th>Step</th>
                <th>Status</th>
                <th>Detail</th>
                <th className="pr-5 text-right">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-xs">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2 whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</td>
                  <td className="py-2">
                    {r.meetingId ? (
                      <Link href={`/meetings/${r.meetingId}`} className="text-accent">
                        #{r.meetingId}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2">{r.step}</td>
                  <td className="py-2">
                    <Status value={r.status} />
                  </td>
                  <td className="max-w-md truncate py-2 text-soft" title={r.detail}>
                    {r.detail}
                  </td>
                  <td className="py-2 pr-5 text-right text-muted">{r.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
