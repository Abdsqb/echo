import { setupNotionDatabase } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { env, integrations } from "@/lib/env";

type Item = { name: string; on: boolean; vars: string[]; note: string; required?: boolean };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notionDb?: string }> }) {
  const { notionDb } = await searchParams;
  const i = integrations();

  const items: Item[] = [
    { name: "Claude API", on: i.claude, vars: ["ANTHROPIC_API_KEY", "CLAUDE_MODEL"], note: i.claude ? `Using ${env.model()}` : "Mock AI mode until a key is set", required: true },
    { name: "Zoom webhook", on: i.zoomWebhook, vars: ["ZOOM_WEBHOOK_SECRET_TOKEN"], note: "Signature-verified; receives recording.transcript_completed" },
    { name: "Zoom API", on: i.zoomApi, vars: ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"], note: "Transcript download, participants, reconciliation" },
    { name: "Reconciliation cron", on: i.cron, vars: ["CRON_SECRET"], note: "Daily GET /api/cron/reconcile with Bearer token" },
    { name: "Google Calendar", on: i.googleCalendar, vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"], note: "Real attendee emails from the invite" },
    { name: "Notion sync", on: i.notion, vars: ["NOTION_TOKEN", "NOTION_DATABASE_ID"], note: "Optional mirror of drafts" },
  ];

  return (
    <>
      <PageHeader stage="cfg · settings" title="Settings" sub="Integrations are configured with environment variables (.env.local locally, your host's settings in production)." />

      <div className="card mb-8 divide-y divide-line">
        {items.map((it) => (
          <div key={it.name} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className={`h-2.5 w-2.5 rounded-full ${it.on ? "bg-ok" : it.required ? "bg-guard" : "bg-line"}`} />
            <div className="min-w-48 flex-1">
              <div className="font-medium">{it.name}</div>
              <div className="text-xs text-muted">{it.note}</div>
            </div>
            <div className="flex flex-wrap gap-1">
              {it.vars.map((v) => (
                <code key={v} className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-soft">
                  {v}
                </code>
              ))}
            </div>
            <span className={`w-24 text-right font-mono text-xs ${it.on ? "text-ok" : "text-muted"}`}>{it.on ? "configured" : "not set"}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <div className="stage mb-2">Zoom webhook URL</div>
          <code className="block rounded-lg bg-bg p-3 font-mono text-xs break-all text-soft">{env.appUrl()}/api/zoom/webhook</code>
          <p className="mt-2 text-xs text-muted">
            In your Zoom Server-to-Server app → Feature → Event subscriptions, add this URL and subscribe to <code className="font-mono">recording.transcript_completed</code>. Zoom validates it on save.
          </p>
        </div>

        <div className="card p-5">
          <div className="stage mb-2">Notion database</div>
          {notionDb ? (
            <p className="text-sm">
              Created. Set <code className="font-mono">NOTION_DATABASE_ID={notionDb}</code> and restart.
            </p>
          ) : i.notionSetup ? (
            <form action={setupNotionDatabase}>
              <p className="mb-3 text-xs text-muted">Creates a &quot;Meeting follow-ups&quot; database under NOTION_PARENT_PAGE_ID with the right properties.</p>
              <SubmitButton className="btn" pendingText="Creating…">
                Create database
              </SubmitButton>
            </form>
          ) : (
            <p className="text-xs text-muted">Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID (a page shared with your integration), then create the database here.</p>
          )}
        </div>
      </div>
    </>
  );
}
