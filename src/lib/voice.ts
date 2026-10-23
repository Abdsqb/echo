import { desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Example, VoiceProfile } from "./db/schema";

export async function getActiveProfile(): Promise<VoiceProfile> {
  const [active] = await db.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.active, true)).limit(1);
  if (!active) throw new Error("No active voice profile. Run `npm run db:setup`.");
  return active;
}

export async function listProfiles() {
  return db.select().from(schema.voiceProfiles).orderBy(desc(schema.voiceProfiles.version));
}

// Saving never overwrites: it writes a new version and makes it active.
export async function saveProfileVersion(input: Pick<VoiceProfile, "playbook" | "rules" | "templates" | "note">) {
  const [latest] = await db.select().from(schema.voiceProfiles).orderBy(desc(schema.voiceProfiles.version)).limit(1);
  const version = (latest?.version ?? 0) + 1;
  await db.transaction(async (tx) => {
    await tx.update(schema.voiceProfiles).set({ active: false });
    await tx.insert(schema.voiceProfiles).values({ ...input, version, active: true });
  });
  return version;
}

export async function activateVersion(version: number) {
  await db.transaction(async (tx) => {
    await tx.update(schema.voiceProfiles).set({ active: false });
    await tx.update(schema.voiceProfiles).set({ active: true }).where(eq(schema.voiceProfiles.version, version));
  });
}

export async function listExamples(): Promise<Example[]> {
  return db.select().from(schema.examples).orderBy(desc(schema.examples.createdAt));
}

// The writer's cached context: playbook, rules, meeting-type guidance and the
// example pairs. Kept byte-stable for a given profile version so it caches.
export function renderVoiceContext(profile: VoiceProfile, examples: Example[], meetingType: string) {
  const template = profile.templates.find((t) => t.meetingType === meetingType);
  const pairs = examples
    .filter((e) => e.email.trim())
    .slice(0, 8)
    .map(
      (e, i) =>
        `<example index="${i + 1}" meeting_type="${e.meetingType}">\n<facts>\n${e.facts || "(facts not extracted yet; infer from the email)"}\n</facts>\n<email_i_sent>\n${e.email}\n</email_i_sent>\n</example>`,
    )
    .join("\n\n");

  return [
    `<playbook>\n${profile.playbook}\n</playbook>`,
    `<rules>\n${profile.rules}\n</rules>`,
    template ? `<meeting_type_guidance type="${meetingType}">\n${template.guidance}\n</meeting_type_guidance>` : "",
    pairs ? `<examples>\n${pairs}\n</examples>` : "<examples>(none yet)</examples>",
  ]
    .filter(Boolean)
    .join("\n\n");
}
