import { eq } from "drizzle-orm";
import { structured } from "./ai/claude";
import { db, schema } from "./db";
import { env } from "./env";
import { logStep } from "./log";
import { ProposalSchema, type Proposal } from "./types";
import { getActiveProfile, saveProfileVersion } from "./voice";

// When a draft is marked sent, compare what the AI wrote with what the user
// actually sent and propose playbook/rule changes. Nothing is applied until
// the user approves it.
export async function proposeFromDraft(draftId: number) {
  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.id, draftId));
  if (!draft) return;
  const unchanged = draft.subject === draft.aiEmail.subject && draft.body.trim() === draft.aiEmail.body.trim();
  if (unchanged) return;

  const profile = await getActiveProfile();
  const me = env.myName() ?? "the user";

  const result = await logStep(draft.meetingId, "learning_proposal", () =>
    structured({
      schema: ProposalSchema,
      effort: "medium",
      system: `You help ${me} improve the playbook an AI uses to write follow-up emails in ${me}'s voice.
Compare the AI draft with the version ${me} actually sent. Identify consistent, reusable preferences (structure, length, tone, phrasing, what to include or leave out).
Propose at most 3 concrete changes. Ignore one-off factual corrections that wouldn't apply to other meetings. Do not propose a rule that already exists.`,
      cachedContext: `<playbook>\n${profile.playbook}\n</playbook>\n\n<rules>\n${profile.rules}\n</rules>`,
      user: `<ai_draft>\nSubject: ${draft.aiEmail.subject}\n\n${draft.aiEmail.body}\n</ai_draft>\n\n<sent_version>\nSubject: ${draft.subject}\n\n${draft.body}\n</sent_version>`,
      mock: (): Proposal => ({
        summary: `[mock] The sent version is ${draft.body.length < draft.aiEmail.body.length ? "shorter" : "longer"} than the AI draft.`,
        changes: [
          {
            kind: "add_rule",
            text: draft.body.length < draft.aiEmail.body.length ? "Keep follow-ups shorter; cut any sentence that repeats the recap." : "Include a little more context in the recap.",
            rationale: "Mock proposal based on draft length difference.",
          },
        ],
      }),
    }), (r) => `${r.data.changes.length} proposed changes`);

  if (!result.data.changes.length) return;
  await db.insert(schema.proposals).values({ draftId, proposal: result.data });
}

export function applyChanges(playbook: string, rules: string, changes: Proposal["changes"]) {
  let nextRules = rules.trimEnd();
  let nextPlaybook = playbook.trimEnd();
  for (const c of changes) {
    if (c.kind === "add_rule") nextRules += `\n- ${c.text.replace(/^-\s*/, "")}`;
    if (c.kind === "remove_rule") {
      const needle = c.text.replace(/^-\s*/, "").toLowerCase();
      nextRules = nextRules
        .split("\n")
        .filter((line) => !line.toLowerCase().includes(needle))
        .join("\n");
    }
    if (c.kind === "edit_playbook") {
      if (!nextPlaybook.includes("## Learned from your edits")) nextPlaybook += "\n\n## Learned from your edits";
      nextPlaybook += `\n- ${c.text}`;
    }
  }
  return { playbook: nextPlaybook + "\n", rules: nextRules + "\n" };
}

export async function approveProposal(id: number) {
  const [row] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id));
  if (!row || row.status !== "pending") return;
  const profile = await getActiveProfile();
  const next = applyChanges(profile.playbook, profile.rules, row.proposal.changes);
  const version = await saveProfileVersion({ ...next, templates: profile.templates, note: `Learned: ${row.proposal.summary.slice(0, 120)}` });
  await db.update(schema.proposals).set({ status: "approved", appliedVersion: version }).where(eq(schema.proposals.id, id));
}

export async function rejectProposal(id: number) {
  await db.update(schema.proposals).set({ status: "rejected" }).where(eq(schema.proposals.id, id));
}
