import { env } from "./env";
import { fetchJson, withRetry } from "./retry";
import type { Draft, Meeting } from "./db/schema";

// Optional mirror of drafts into a Notion database. Echo stays the source of
// truth; Notion gets a copy for reading on the go.

const API = "https://api.notion.com/v1";
const MAX_TEXT = 2000; // Notion's per-rich-text limit

const headers = () => ({
  Authorization: `Bearer ${env.notionToken()}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
});

export function chunkText(text: string, size = MAX_TEXT): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > size) {
    // Break on a newline or space near the limit so words aren't split.
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
    if (cut <= 0) cut = size;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

const paragraphs = (text: string) =>
  chunkText(text).map((c) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: c } }] } }));

const heading = (text: string) => ({ object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: text } }] } });

const toggle = (title: string, text: string) => ({
  object: "block",
  type: "toggle",
  toggle: { rich_text: [{ type: "text", text: { content: title } }], children: paragraphs(text).slice(0, 90) },
});

const statusName = (s: Draft["status"]) => ({ draft: "Draft", reviewed: "Reviewed", sent: "Sent" })[s];

export async function syncDraftToNotion(draft: Draft, meeting: Meeting): Promise<string> {
  const databaseId = env.notionDatabaseId();
  if (!env.notionToken() || !databaseId) throw new Error("Notion is not configured (NOTION_TOKEN / NOTION_DATABASE_ID)");

  const properties = {
    Meeting: { title: [{ text: { content: meeting.topic.slice(0, 200) } }] },
    Date: meeting.startTime ? { date: { start: meeting.startTime.toISOString() } } : undefined,
    "Meeting type": { select: { name: meeting.meetingType } },
    To: { rich_text: [{ text: { content: draft.to.slice(0, MAX_TEXT) } }] },
    Subject: { rich_text: [{ text: { content: draft.subject.slice(0, MAX_TEXT) } }] },
    Status: { select: { name: statusName(draft.status) } },
    Flags: { multi_select: [...new Set(draft.flags.map((f) => f.type))].map((name) => ({ name })) },
    "Echo link": { url: `${env.appUrl()}/drafts/${draft.id}` },
  };

  if (draft.notionPageId) {
    await withRetry(() => fetchJson(`${API}/pages/${draft.notionPageId}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) }));
    return draft.notionPageId;
  }

  const children = [
    ...(draft.flags.length ? [heading("Flags to check"), ...paragraphs(draft.flags.map((f) => `• ${f.message}`).join("\n"))] : []),
    heading("Email draft"),
    ...paragraphs(`Subject: ${draft.subject}\n\n${draft.body}`),
    toggle("Extracted facts", JSON.stringify(draft.facts, null, 2)),
    toggle("Original AI draft", `Subject: ${draft.aiEmail.subject}\n\n${draft.aiEmail.body}`),
  ];

  const page = await withRetry(() =>
    fetchJson<{ id: string }>(`${API}/pages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ parent: { database_id: databaseId }, properties, children }),
    }),
  );
  return page.id;
}

// One-time helper: creates the "Meeting follow-ups" database under a page
// shared with the integration. Put the returned id in NOTION_DATABASE_ID.
export async function createFollowupsDatabase(): Promise<string> {
  const parent = env.notionParentPageId();
  if (!env.notionToken() || !parent) throw new Error("Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID first");
  const db = await fetchJson<{ id: string }>(`${API}/databases`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parent },
      title: [{ type: "text", text: { content: "Meeting follow-ups" } }],
      properties: {
        Meeting: { title: {} },
        Date: { date: {} },
        "Meeting type": { select: {} },
        To: { rich_text: {} },
        Subject: { rich_text: {} },
        Status: { select: { options: [{ name: "Draft" }, { name: "Reviewed" }, { name: "Sent" }] } },
        Flags: { multi_select: {} },
        "Echo link": { url: {} },
      },
    }),
  });
  return db.id;
}
