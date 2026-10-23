import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { regenerateDraft, saveDraft, setDraftStatus, syncNotion } from "@/app/actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { fmtDate, fmtUsd, GuardChip, PageHeader, Status } from "@/components/ui";
import { db, schema } from "@/lib/db";
import { integrations } from "@/lib/env";
import type { Facts } from "@/lib/types";

const FLAG_LABEL: Record<string, string> = {
  owner_unclear: "owner unclear",
  deadline_guessed: "no deadline",
  untraced_claim: "untraced claim",
  rule_violation: "rule",
  recipient_unmatched: "recipient",
  other: "check",
};

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.id, id));
  if (!draft) notFound();
  const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, draft.meetingId));
  const notion = integrations().notion;

  const mailto = `mailto:${encodeURIComponent(draft.to).replace(/%2C/g, ",")}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  const edited = draft.subject !== draft.aiEmail.subject || draft.body.trim() !== draft.aiEmail.body.trim();

  return (
    <>
      <PageHeader
        stage="04 · review"
        title={meeting.topic}
        sub={`${meeting.meetingType} · ${fmtDate(meeting.startTime ?? meeting.createdAt)} · ${draft.model} · voice v${draft.voiceVersion} · ${fmtUsd(draft.costUsd)}`}
        actions={
          <>
            <Status value={draft.status} />
            <Link href="/" className="btn">
              Back to inbox
            </Link>
          </>
        }
      />

      {draft.flags.length > 0 && (
        <div className="mb-6 rounded-xl border border-guard/60 bg-guard-bg p-5">
          <div className="stage mb-3 !text-guard-fg">Check before sending · {draft.flags.length}</div>
          <ul className="space-y-2">
            {draft.flags.map((f, i) => (
              <li key={i} className="flex flex-wrap items-start gap-3 text-sm">
                <GuardChip>{FLAG_LABEL[f.type] ?? f.type}</GuardChip>
                <span className="flex-1 text-soft">
                  {f.message}
                  {f.excerpt && <span className="mt-0.5 block font-mono text-xs text-muted">“{f.excerpt}”</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form action={saveDraft} className="card space-y-4 p-6">
          <input type="hidden" name="id" value={draft.id} />
          <div>
            <label className="label" htmlFor="to">
              To
            </label>
            <input id="to" name="to" defaultValue={draft.to} className="input font-mono" placeholder="No matched recipients; add them here" />
          </div>
          <div>
            <label className="label" htmlFor="subject">
              Subject
            </label>
            <input id="subject" name="subject" defaultValue={draft.subject} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="body">
              Email
            </label>
            <textarea id="body" name="body" defaultValue={draft.body} rows={18} className="input leading-relaxed" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton className="btn" pendingText="Saving…">
              Save edits
            </SubmitButton>
            <button formAction={setDraftStatus.bind(null, "reviewed")} className="btn">
              Mark reviewed
            </button>
            <button formAction={setDraftStatus.bind(null, "sent")} className="btn-primary">
              Mark sent
            </button>
            <span className="font-mono text-[11px] text-muted">{edited ? "edited · your changes teach the learning loop" : "unedited AI draft"}</span>
          </div>
        </form>

        <div className="space-y-4">
          <div className="card space-y-2 p-5">
            <div className="stage mb-2">Send it yourself</div>
            <CopyButton text={`Subject: ${draft.subject}\n\n${draft.body}`} />
            <a href={mailto} className="btn">
              Open in email app
            </a>
            <p className="pt-1 text-xs text-muted">Save edits first; these use the saved version. Then mark it sent.</p>
          </div>

          <div className="card space-y-2 p-5">
            <div className="stage mb-2">Actions</div>
            <form action={regenerateDraft}>
              <input type="hidden" name="meetingId" value={meeting.id} />
              <SubmitButton className="btn" pendingText="Queuing…">
                Regenerate draft
              </SubmitButton>
            </form>
            {notion && (
              <form action={syncNotion}>
                <input type="hidden" name="id" value={draft.id} />
                <SubmitButton className="btn" pendingText="Syncing…">
                  {draft.notionPageId ? "Re-sync to Notion" : "Sync to Notion"}
                </SubmitButton>
              </form>
            )}
          </div>

          <div className="card p-5">
            <div className="stage mb-2">Attendees</div>
            <ul className="space-y-1 text-sm">
              {meeting.attendees.map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{a.name}</span>
                  <span className={`font-mono text-xs ${a.email ? "text-muted" : "text-guard-fg"}`}>{a.email ?? "unmatched"}</span>
                </li>
              ))}
              {meeting.attendees.length === 0 && <li className="text-muted">None found</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <FactsPanel facts={draft.facts} />
        <details className="card p-5">
          <summary className="stage cursor-pointer">Original AI draft</summary>
          <pre className="mt-4 font-sans text-sm whitespace-pre-wrap text-soft">{`Subject: ${draft.aiEmail.subject}\n\n${draft.aiEmail.body}`}</pre>
        </details>
        <details className="card p-5">
          <summary className="stage cursor-pointer">Clean transcript</summary>
          <pre className="mt-4 max-h-[480px] overflow-auto font-mono text-xs whitespace-pre-wrap text-soft">{meeting.transcriptClean}</pre>
        </details>
      </div>
    </>
  );
}

function FactsPanel({ facts }: { facts: Facts }) {
  const Section = ({ title, items }: { title: string; items: { main: string; meta?: string; evidence?: string }[] }) =>
    items.length ? (
      <div>
        <div className="label">{title}</div>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm">
              <span className="text-fg">{it.main}</span>
              {it.meta && <span className="ml-2 font-mono text-xs text-accent">{it.meta}</span>}
              {it.evidence && <span className="mt-0.5 block border-l-2 border-line pl-2 font-mono text-xs text-muted">“{it.evidence}”</span>}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <details className="card p-5" open>
      <summary className="stage cursor-pointer">Extracted facts · every item carries its transcript evidence</summary>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <div className="label">Summary</div>
            <p className="text-sm text-soft">{facts.summary}</p>
          </div>
          <Section title="Decisions" items={facts.decisions.map((d) => ({ main: d.text, evidence: d.evidence }))} />
          <Section
            title="Action items"
            items={facts.action_items.map((a) => ({ main: a.task, meta: `${a.owner} · ${a.due}`, evidence: a.evidence }))}
          />
        </div>
        <div className="space-y-5">
          <Section title="Open questions" items={facts.open_questions.map((q) => ({ main: q.text, evidence: q.evidence }))} />
          <Section title="Personal notes" items={facts.personal_notes.map((p) => ({ main: p.text, evidence: p.evidence }))} />
          <Section title="Left out on purpose" items={facts.exclude.map((e) => ({ main: e.text, meta: e.reason }))} />
          <div>
            <div className="label">Next meeting</div>
            <p className="text-sm text-soft">{facts.next_meeting}</p>
          </div>
        </div>
      </div>
    </details>
  );
}
