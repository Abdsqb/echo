import { z } from "zod";

// Structured output schemas. Every field is required and uses the string
// "unknown" instead of guessing, which keeps the model honest and the
// schema compatible with structured outputs.

const evidence = z.string().describe("Verbatim quote from the transcript that supports this item");

export const FactsSchema = z.object({
  summary: z.string().describe("Two or three sentence neutral summary of the meeting"),
  decisions: z.array(z.object({ text: z.string(), evidence })),
  action_items: z.array(
    z.object({
      task: z.string(),
      owner: z.string().describe('Person responsible, or "unknown" if not clearly stated'),
      owner_is_me: z.boolean().describe("True if the owner is the user (the person sending the follow-up)"),
      due: z.string().describe('Deadline as stated, or "unknown" if none was said'),
      evidence,
    }),
  ),
  open_questions: z.array(z.object({ text: z.string(), evidence })),
  personal_notes: z
    .array(z.object({ text: z.string(), evidence }))
    .describe("Personal details worth a warm mention, per the playbook"),
  next_meeting: z.string().describe('Next meeting date/time if agreed, else "unknown"'),
  exclude: z
    .array(z.object({ text: z.string(), reason: z.string() }))
    .describe("Things discussed that must NOT go in the email (internal, sensitive, off-topic)"),
});
export type Facts = z.infer<typeof FactsSchema>;

export const EmailSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Plain-text email body, greeting to sign-off"),
});
export type Email = z.infer<typeof EmailSchema>;

export const FLAG_TYPES = [
  "owner_unclear",
  "deadline_guessed",
  "untraced_claim",
  "rule_violation",
  "recipient_unmatched",
  "other",
] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

export const QualitySchema = z.object({
  flags: z.array(
    z.object({
      type: z.enum(FLAG_TYPES),
      message: z.string().describe("Short note telling the user what to check"),
      excerpt: z.string().describe("The sentence of the draft this flag refers to, or empty"),
    }),
  ),
});
export type Flag = z.infer<typeof QualitySchema>["flags"][number];

export const ProposalSchema = z.object({
  summary: z.string().describe("One or two sentences on what the user consistently changed"),
  changes: z.array(
    z.object({
      kind: z.enum(["add_rule", "remove_rule", "edit_playbook"]),
      text: z.string().describe("The exact rule or playbook text to add, remove, or use as the replacement"),
      rationale: z.string(),
    }),
  ),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const JudgeSchema = z.object({
  action_items_expected: z.number().describe("Count of action items present in the reference email"),
  action_items_captured: z.number().describe("How many of those the generated email also captured correctly"),
  invented_facts: z.array(z.string()).describe("Claims in the generated email not supported by the transcript"),
  tone_score: z.number().describe("1-5: how closely the generated email matches the reference email's voice"),
  notes: z.string(),
});
export type Judge = z.infer<typeof JudgeSchema>;

export type Attendee = { name: string; email: string | null; source: "zoom" | "calendar" | "manual" };

export type Usage = { inputTokens: number; outputTokens: number; costUsd: number };
