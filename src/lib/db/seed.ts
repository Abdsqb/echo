import fs from "node:fs";
import path from "node:path";
import { db, schema } from "./index";

export const STARTER_PLAYBOOK = `# Conversion playbook (starter — replace with your own)

## What I pull out of a meeting
- Decisions we made, stated plainly.
- Action items, grouped by who owns them. Mine first, then theirs.
- Dates and deadlines exactly as they were said.
- One personal detail if someone shared something (a trip, a move, a launch).

## What I leave out
- Small talk, tangents, and anything we discussed internally.
- Pricing or numbers unless we explicitly agreed on them.

## How I structure the email
1. One-line thanks and context.
2. Short recap (2–3 sentences).
3. "Next steps" as bullets: owner — task — date.
4. Next meeting, if one was agreed.
5. Short sign-off.

## Voice
- Friendly, direct, no fluff. Short sentences.
- No exclamation marks except in the greeting.
- Under 200 words unless the meeting was long.
`;

export const STARTER_RULES = `- Never invent a deadline or an owner. If unknown, leave it out of the email.
- Never mention internal discussions, pricing debates, or other clients.
- Use first names.
- Sign off with "Best," and my first name.`;

export async function seedIfEmpty() {
  const existing = await db.select().from(schema.voiceProfiles).limit(1);
  if (existing.length > 0) return false;

  await db.insert(schema.voiceProfiles).values({
    version: 1,
    active: true,
    playbook: STARTER_PLAYBOOK,
    rules: STARTER_RULES,
    templates: [
      { meetingType: "client", guidance: "Warm but professional. Lead with outcomes for them." },
      { meetingType: "sales", guidance: "Restate their pain point in their words, then the agreed next step." },
      { meetingType: "internal", guidance: "Very short. Bullets only. No pleasantries." },
    ],
    note: "Starter profile",
  });

  const sample = fs.readFileSync(path.join(process.cwd(), "samples", "acme-kickoff.vtt"), "utf8");
  const sampleEmail = fs.readFileSync(path.join(process.cwd(), "samples", "acme-kickoff-sent.txt"), "utf8");

  await db.insert(schema.examples).values({
    meetingType: "client",
    title: "Sample: Acme kickoff (fictional)",
    transcript: sample,
    facts: "",
    email: sampleEmail,
  });
  await db.insert(schema.evalCases).values({
    name: "Sample: Acme kickoff (fictional)",
    meetingType: "client",
    transcript: sample,
    sentEmail: sampleEmail,
  });
  return true;
}
