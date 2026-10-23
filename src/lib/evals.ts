import { eq } from "drizzle-orm";
import { structured } from "./ai/claude";
import { db, schema } from "./db";
import type { EvalCaseResult } from "./db/schema";
import { JudgeSchema, type Email, type Judge } from "./types";
import { cleanTranscript } from "./pipeline/vtt";
import { extractFacts, writeEmail } from "./pipeline/steps";
import { getActiveProfile, listExamples } from "./voice";

// Re-runs past meetings through the pipeline and scores the result against
// the email the user actually sent. Run before changing prompts or models.

function mockJudge(reference: string, generated: Email): Judge {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const ref = words(reference);
  const gen = words(generated.body);
  const overlap = [...ref].filter((w) => gen.has(w)).length / Math.max(ref.size, 1);
  const expected = (reference.match(/^\s*[-•]/gm) ?? []).length;
  return {
    action_items_expected: expected,
    action_items_captured: Math.round(expected * Math.min(1, overlap * 1.5)),
    invented_facts: [],
    tone_score: Math.max(1, Math.min(5, Math.round(overlap * 6))),
    notes: "[mock] Word-overlap heuristic; add ANTHROPIC_API_KEY for a real judge.",
  };
}

async function judge(transcript: string, reference: string, generated: Email, model?: string) {
  return structured({
    schema: JudgeSchema,
    model,
    effort: "low",
    system: `You grade an AI-written follow-up email against the email the user actually sent for the same meeting.
- Count action items in the reference email, then how many the generated email captured with the right owner.
- List any claim in the generated email that the transcript does not support.
- tone_score 1-5: how closely the generated email matches the reference's structure, length and voice.`,
    user: `<transcript>\n${transcript}\n</transcript>\n\n<reference_email>\n${reference}\n</reference_email>\n\n<generated_email>\nSubject: ${generated.subject}\n\n${generated.body}\n</generated_email>`,
    mock: () => mockJudge(reference, generated),
  });
}

export async function startEvalRun(model: string) {
  const profile = await getActiveProfile();
  const [run] = await db.insert(schema.evalRuns).values({ model, voiceVersion: profile.version }).returning();
  return run.id;
}

export async function executeEvalRun(runId: number) {
  const [run] = await db.select().from(schema.evalRuns).where(eq(schema.evalRuns.id, runId));
  if (!run) return;
  try {
    const profile = await getActiveProfile();
    const allExamples = await listExamples();
    const cases = await db.select().from(schema.evalCases);
    const results: EvalCaseResult[] = [];

    for (const c of cases) {
      try {
        const { text, speakers } = cleanTranscript(c.transcript);
        // Leave the case's own example out so the writer can't copy the answer.
        const examples = allExamples.filter((e) => e.transcript?.trim() !== c.transcript.trim());
        const facts = await extractFacts(text, profile, c.meetingType, run.model);
        const email = await writeEmail(facts.data, speakers.map((name) => ({ name, email: null, source: "manual" })), profile, examples, c.meetingType, c.name, run.model);
        const verdict = await judge(text, c.sentEmail, email.data);
        results.push({ caseId: c.id, name: c.name, email: email.data, judge: verdict.data, error: null, costUsd: facts.usage.costUsd + email.usage.costUsd + verdict.usage.costUsd });
      } catch (err) {
        results.push({ caseId: c.id, name: c.name, email: null, judge: null, error: err instanceof Error ? err.message : String(err), costUsd: 0 });
      }
    }

    const judged = results.filter((r) => r.judge).map((r) => r.judge!);
    const expected = judged.reduce((s, j) => s + j.action_items_expected, 0);
    await db
      .update(schema.evalRuns)
      .set({
        status: "done",
        results,
        recall: expected ? judged.reduce((s, j) => s + Math.min(j.action_items_captured, j.action_items_expected), 0) / expected : null,
        inventedFacts: judged.reduce((s, j) => s + j.invented_facts.length, 0),
        toneScore: judged.length ? judged.reduce((s, j) => s + j.tone_score, 0) / judged.length : null,
        costUsd: results.reduce((s, r) => s + r.costUsd, 0),
      })
      .where(eq(schema.evalRuns.id, runId));
  } catch {
    await db.update(schema.evalRuns).set({ status: "failed" }).where(eq(schema.evalRuns.id, runId));
  }
}
