import { structured } from "../ai/claude";
import { env } from "../env";
import { EmailSchema, FactsSchema, QualitySchema, type Attendee, type Email, type Facts, type Flag } from "../types";
import type { Example, VoiceProfile } from "../db/schema";
import { renderVoiceContext } from "../voice";
import { mockEmail, mockFacts } from "./mock";

const me = () => env.myName() ?? "the user";

// Step 1: facts only, each backed by a verbatim quote. The writer never sees
// the transcript, so anything not extracted here can't reach the email.
export async function extractFacts(transcript: string, profile: VoiceProfile, meetingType: string, model?: string) {
  return structured({
    schema: FactsSchema,
    model,
    effort: "high",
    system: `You extract facts from a meeting transcript so ${me()} can write a follow-up email.

Rules:
- Use ONLY what is said in the transcript. Never infer, assume, or fill gaps.
- Every item needs "evidence": a short verbatim quote from the transcript.
- If an owner or deadline is not clearly stated, use exactly "unknown". Unknown is fine; a guess is a failure.
- owner_is_me is true only when ${me()} is the person who committed to the task.
- Put anything the playbook or rules say to leave out (internal talk, pricing debates, small talk) in "exclude" instead.
- The meeting type is "${meetingType}".
- The playbook below describes what ${me()} usually pulls out of a meeting.`,
    cachedContext: `<playbook>\n${profile.playbook}\n</playbook>\n\n<rules>\n${profile.rules}\n</rules>`,
    user: `<transcript>\n${transcript}\n</transcript>`,
    mock: () => mockFacts(transcript),
  });
}

// Step 2: turn facts into an email in the user's voice.
export async function writeEmail(
  facts: Facts,
  attendees: Attendee[],
  profile: VoiceProfile,
  examples: Example[],
  meetingType: string,
  topic: string,
  model?: string,
) {
  const recipients = attendees
    .filter((a) => a.email?.toLowerCase() !== env.myEmail())
    .map((a) => a.name)
    .join(", ");
  return structured({
    schema: EmailSchema,
    model,
    effort: "medium",
    system: `You write follow-up emails as ${me()}, in ${me()}'s own voice.

Rules:
- Use ONLY the facts provided. Do not add any claim, date, number, or commitment that is not in the facts.
- Never include anything listed under "exclude".
- If an owner or due date is "unknown", leave it out rather than guessing.
- Follow the playbook, rules, meeting-type guidance and examples below. The examples are real emails ${me()} sent: match their structure, length, tone and phrasing.
- Output a subject and a plain-text body (no markdown headings).`,
    cachedContext: renderVoiceContext(profile, examples, meetingType),
    user: `Meeting: ${topic}\nMeeting type: ${meetingType}\nRecipients: ${recipients || "unknown"}\n\n<facts>\n${JSON.stringify(facts, null, 2)}\n</facts>`,
    mock: () => mockEmail(facts, attendees, me()),
  });
}

// Step 3: trace every claim back to a fact, plus deterministic checks that
// don't depend on the model at all.
export async function qualityCheck(facts: Facts, email: Email, attendees: Attendee[], profile: VoiceProfile, model?: string) {
  const result = await structured({
    schema: QualitySchema,
    model,
    effort: "medium",
    system: `You are a strict reviewer of a follow-up email draft before ${me()} sends it.

Flag, with a short note the user can act on:
- untraced_claim: any sentence stating something not supported by the facts.
- rule_violation: anything that breaks the rules, or mentions an item from "exclude".
- owner_unclear / deadline_guessed: any task whose owner or date in the email is not backed by the facts.
Do not flag style preferences. Return an empty list if the draft is clean.`,
    cachedContext: `<rules>\n${profile.rules}\n</rules>`,
    user: `<facts>\n${JSON.stringify(facts, null, 2)}\n</facts>\n\n<draft>\nSubject: ${email.subject}\n\n${email.body}\n</draft>`,
    mock: () => ({ flags: [] }),
  });

  return { flags: dedupeFlags([...deterministicFlags(facts, email, attendees), ...result.data.flags]), usage: result.usage };
}

export function deterministicFlags(facts: Facts, email: Email, attendees: Attendee[]): Flag[] {
  const flags: Flag[] = [];
  for (const item of facts.action_items) {
    if (item.owner.toLowerCase() === "unknown")
      flags.push({ type: "owner_unclear", message: `No clear owner for: "${item.task}"`, excerpt: item.evidence });
    if (item.due.toLowerCase() === "unknown")
      flags.push({ type: "deadline_guessed", message: `No deadline was stated for: "${item.task}"`, excerpt: "" });
  }
  for (const a of attendees) {
    if (!a.email) flags.push({ type: "recipient_unmatched", message: `No email address found for ${a.name}; confirm before sending`, excerpt: "" });
  }
  const body = email.body.toLowerCase();
  for (const ex of facts.exclude) {
    const words = ex.text.toLowerCase().split(/\W+/).filter((w) => w.length > 5);
    if (words.length && words.filter((w) => body.includes(w)).length >= Math.ceil(words.length * 0.6))
      flags.push({ type: "rule_violation", message: `Draft may mention something to leave out: ${ex.reason}`, excerpt: ex.text });
  }
  return flags;
}

function dedupeFlags(flags: Flag[]) {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const key = `${f.type}:${f.message.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
