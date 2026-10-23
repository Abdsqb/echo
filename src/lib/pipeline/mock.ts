// Deterministic stand-ins for the Claude calls, used when no API key is set
// (or ECHO_MOCK_AI=1). Good enough to exercise every screen and flow; not a
// substitute for the real model.
import type { Attendee, Email, Facts } from "../types";
import { parseTranscript } from "./vtt";

const COMMIT = /\b(i'll|i will|we'll|we will|i can|let me)\b/i;
const DECIDE = /\b(we'll go with|agreed|let's go with|decided|that works)\b/i;
const QUESTION = /\b(open question|not sure|need to check|whether)\b/i;
const PERSONAL = /\b(moved|congrats|vacation|holiday|baby|wedding|launch)\b/i;
const EXCLUDE = /\b(internally|pricing|discount|confidential)\b/i;
const DUE = /\b(by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of (the )?week)|on the \d{1,2}(st|nd|rd|th)?)\b/i;

export function mockFacts(transcript: string): Facts {
  const turns = parseTranscript(transcript);
  const facts: Facts = {
    summary: `Mock summary of a ${turns.length}-turn conversation between ${[...new Set(turns.map((t) => t.speaker))].join(" and ")}.`,
    decisions: [],
    action_items: [],
    open_questions: [],
    personal_notes: [],
    next_meeting: "unknown",
    exclude: [],
  };
  for (const t of turns) {
    if (EXCLUDE.test(t.text)) {
      facts.exclude.push({ text: t.text, reason: "Internal or pricing discussion" });
      continue;
    }
    if (DECIDE.test(t.text)) facts.decisions.push({ text: t.text, evidence: t.text });
    if (COMMIT.test(t.text)) {
      const due = t.text.match(DUE)?.[0] ?? "unknown";
      facts.action_items.push({ task: t.text, owner: t.speaker, owner_is_me: false, due, evidence: t.text });
    }
    if (QUESTION.test(t.text)) facts.open_questions.push({ text: t.text, evidence: t.text });
    if (PERSONAL.test(t.text)) facts.personal_notes.push({ text: t.text, evidence: t.text });
    if (/\bmeet again\b/i.test(t.text)) facts.next_meeting = t.text.match(/on the \d{1,2}(st|nd|rd|th)?/i)?.[0] ?? "unknown";
  }
  return facts;
}

export function mockEmail(facts: Facts, attendees: Attendee[], me: string): Email {
  const first = attendees[0]?.name.split(" ")[0] ?? "there";
  const steps = facts.action_items.map((a) => `- ${a.owner} — ${a.task}${a.due !== "unknown" ? ` (${a.due})` : ""}`);
  return {
    subject: "[mock] Recap + next steps",
    body: [
      `Hi ${first},`,
      "",
      "Thanks for the time today.",
      "",
      `Quick recap: ${facts.decisions.map((d) => d.text).join(" ") || facts.summary}`,
      "",
      steps.length ? `Next steps:\n${steps.join("\n")}` : "",
      facts.next_meeting !== "unknown" ? `\nWe'll meet again ${facts.next_meeting}.` : "",
      "",
      "Best,",
      me.split(" ")[0],
      "",
      "(Mock draft: add ANTHROPIC_API_KEY to generate real drafts.)",
    ]
      .filter((l) => l !== null)
      .join("\n"),
  };
}
