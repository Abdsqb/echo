import { desc } from "drizzle-orm";
import { addEvalCase, deleteEvalCase, runEval } from "@/app/actions";
import { AutoRefresh, FileToTextarea, SubmitButton } from "@/components/client";
import { Empty, fmtDate, fmtUsd, PageHeader, Status } from "@/components/ui";
import { MODEL_OPTIONS } from "@/lib/ai/claude";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export default async function EvalsPage() {
  const [cases, runs] = await Promise.all([
    db.select().from(schema.evalCases).orderBy(desc(schema.evalCases.createdAt)),
    db.select().from(schema.evalRuns).orderBy(desc(schema.evalRuns.createdAt)).limit(20),
  ]);
  const running = runs.some((r) => r.status === "running");

  return (
    <>
      <AutoRefresh active={running} />
      <PageHeader
        stage="gate · evals"
        title="Evals"
        sub="Past meetings re-run through the pipeline and scored against the email you actually sent. Run before changing a prompt, the voice profile, or the model."
      />

      <form action={runEval} className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div>
          <label className="label" htmlFor="model">
            Model
          </label>
          <select id="model" name="model" defaultValue={env.model()} className="input">
            {MODEL_OPTIONS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <SubmitButton pendingText="Starting…">Run eval on {cases.length} cases</SubmitButton>
        <p className="text-xs text-muted">Scores: action-item recall · invented facts (must be 0) · tone match 1–5.</p>
      </form>

      {runs.length > 0 && (
        <div className="card mb-10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr className="label">
                <th className="px-5 py-3">Run</th>
                <th>Model</th>
                <th>Voice</th>
                <th>Recall</th>
                <th>Invented</th>
                <th>Tone</th>
                <th>Cost</th>
                <th className="pr-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <details>
                      <summary className="cursor-pointer font-mono text-xs">
                        #{r.id} · {fmtDate(r.createdAt)}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {r.results.map((c) => (
                          <li key={c.caseId} className="font-mono text-[11px] text-muted">
                            {c.name}:{" "}
                            {c.error
                              ? <span className="text-danger">{c.error}</span>
                              : `${c.judge?.action_items_captured}/${c.judge?.action_items_expected} items · tone ${c.judge?.tone_score} · ${c.judge?.invented_facts.length} invented`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="py-3 font-mono text-xs">{r.model}</td>
                  <td className="py-3 font-mono text-xs">v{r.voiceVersion}</td>
                  <td className="py-3">{pct(r.recall)}</td>
                  <td className={`py-3 ${r.inventedFacts ? "text-danger" : ""}`}>{r.inventedFacts ?? "—"}</td>
                  <td className="py-3">{r.toneScore?.toFixed(1) ?? "—"}</td>
                  <td className="py-3">{fmtUsd(r.costUsd)}</td>
                  <td className="py-3 pr-5">
                    <Status value={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Cases</h2>
      {cases.length === 0 ? (
        <Empty title="No eval cases yet">Add past meetings with the email you sent for each.</Empty>
      ) : (
        <div className="card mb-6 divide-y divide-line">
          {cases.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3">
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="font-mono text-[11px] text-muted">{c.meetingType}</span>
              <form action={deleteEvalCase}>
                <input type="hidden" name="id" value={c.id} />
                <button className="font-mono text-[11px] text-muted hover:text-danger">remove</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={addEvalCase} className="card grid gap-4 p-6 md:grid-cols-2">
        <div className="stage md:col-span-2">Add a case</div>
        <input name="name" className="input" placeholder="Name, e.g. Globex renewal call" />
        <input name="meetingType" className="input" placeholder="Meeting type, e.g. client" />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0" htmlFor="case-transcript">
              Transcript
            </label>
            <FileToTextarea target="case-transcript" />
          </div>
          <textarea id="case-transcript" name="transcript" rows={8} required className="input font-mono text-xs" />
        </div>
        <div>
          <label className="label" htmlFor="case-email">
            Email you actually sent
          </label>
          <textarea id="case-email" name="sentEmail" rows={8} required className="input text-sm" />
        </div>
        <div className="flex justify-end md:col-span-2">
          <SubmitButton pendingText="Adding…">Add case</SubmitButton>
        </div>
      </form>
    </>
  );
}
