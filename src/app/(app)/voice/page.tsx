import { activateVoice, addExample, deleteExample, extractExampleFacts, saveVoice } from "@/app/actions";
import { FileToTextarea, SubmitButton } from "@/components/client";
import { fmtDate, PageHeader, Status } from "@/components/ui";
import { getActiveProfile, listExamples, listProfiles } from "@/lib/voice";

export default async function VoicePage() {
  const [profile, versions, examples] = await Promise.all([getActiveProfile(), listProfiles(), listExamples()]);
  const templatesText = profile.templates.map((t) => `${t.meetingType}: ${t.guidance}`).join("\n");

  return (
    <>
      <PageHeader
        stage="ctx · your voice"
        title="Voice profile"
        sub="How you turn a meeting into an email. Every save is a new version; roll back any time."
        actions={<span className="font-mono text-xs text-muted">active: v{profile.version}</span>}
      />

      <form action={saveVoice} className="card mb-8 grid gap-5 p-6 lg:grid-cols-2">
        <div className="lg:row-span-2">
          <label className="label" htmlFor="playbook">
            Conversion playbook
          </label>
          <textarea id="playbook" name="playbook" defaultValue={profile.playbook} rows={24} className="input font-mono text-xs leading-relaxed" />
        </div>
        <div>
          <label className="label" htmlFor="rules">
            Do / don&apos;t rules <span className="normal-case">(also enforced by the quality check)</span>
          </label>
          <textarea id="rules" name="rules" defaultValue={profile.rules} rows={9} className="input font-mono text-xs leading-relaxed" />
        </div>
        <div>
          <label className="label" htmlFor="templates">
            Meeting-type templates <span className="normal-case">(type: guidance, one per line)</span>
          </label>
          <textarea id="templates" name="templates" defaultValue={templatesText} rows={6} className="input font-mono text-xs leading-relaxed" />
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1">
              <label className="label" htmlFor="note">
                Change note
              </label>
              <input id="note" name="note" className="input" placeholder="What changed?" />
            </div>
            <SubmitButton pendingText="Saving…">Save as v{versions[0].version + 1}</SubmitButton>
          </div>
        </div>
      </form>

      <h2 className="mb-1 text-lg font-semibold">Example pairs</h2>
      <p className="mb-4 text-sm text-muted">
        Real emails you sent, paired with the facts from that meeting. These teach the writer your voice more than any rule. Aim for 3–10.
      </p>

      <div className="mb-6 space-y-3">
        {examples.map((ex) => (
          <details key={ex.id} className="card p-5">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3">
              <span className="font-medium">{ex.title}</span>
              <span className="font-mono text-[11px] text-muted">{ex.meetingType}</span>
              <span className={`font-mono text-[11px] ${ex.facts ? "text-ctx" : "text-guard-fg"}`}>{ex.facts ? "facts ready" : "facts missing"}</span>
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="label">Facts</div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-soft">{ex.facts || "Not extracted yet."}</pre>
              </div>
              <div>
                <div className="label">Email you sent</div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-bg p-3 font-sans text-sm whitespace-pre-wrap text-soft">{ex.email}</pre>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {ex.transcript && (
                <form action={extractExampleFacts}>
                  <input type="hidden" name="id" value={ex.id} />
                  <SubmitButton className="btn" pendingText="Extracting…">
                    {ex.facts ? "Re-extract facts" : "Extract facts from transcript"}
                  </SubmitButton>
                </form>
              )}
              <form action={deleteExample}>
                <input type="hidden" name="id" value={ex.id} />
                <button className="btn-danger">Delete</button>
              </form>
            </div>
          </details>
        ))}
      </div>

      <form action={addExample} className="card mb-10 grid gap-4 p-6 md:grid-cols-2">
        <div className="stage md:col-span-2">Add an example</div>
        <input name="title" className="input" placeholder="Title, e.g. Acme kickoff" />
        <input name="meetingType" className="input" placeholder="Meeting type, e.g. client" />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0" htmlFor="ex-transcript">
              Transcript (optional, facts are extracted from it)
            </label>
            <FileToTextarea target="ex-transcript" />
          </div>
          <textarea id="ex-transcript" name="transcript" rows={8} className="input font-mono text-xs" />
        </div>
        <div>
          <label className="label" htmlFor="ex-email">
            The email you actually sent
          </label>
          <textarea id="ex-email" name="email" rows={8} required className="input text-sm" />
        </div>
        <div className="flex justify-end md:col-span-2">
          <SubmitButton pendingText="Adding…">Add example</SubmitButton>
        </div>
      </form>

      <h2 className="mb-3 text-lg font-semibold">Version history</h2>
      <div className="card divide-y divide-line">
        {versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
            <span className="w-10 font-mono text-sm">v{v.version}</span>
            <span className="flex-1 text-sm text-soft">{v.note}</span>
            <span className="font-mono text-[11px] text-muted">{fmtDate(v.createdAt)}</span>
            {v.active ? (
              <Status value="active" />
            ) : (
              <form action={activateVoice}>
                <input type="hidden" name="version" value={v.version} />
                <button className="btn">Roll back to v{v.version}</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
