import crypto from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanTranscript, parseTranscript } from "./pipeline/vtt";
import { urlValidationResponse, verifyZoomSignature } from "./zoom/signature";
import { chunkText } from "./notion";
import { deterministicFlags } from "./pipeline/steps";
import { applyChanges } from "./learning";
import { mergeAttendees } from "./calendar";
import { mockFacts } from "./pipeline/mock";
import type { Facts } from "./types";

const sample = fs.readFileSync("samples/acme-kickoff.vtt", "utf8");

describe("transcript cleaning", () => {
  it("strips cue numbers and timings and keeps speakers", () => {
    const { text, speakers } = cleanTranscript(sample);
    expect(text).not.toMatch(/-->/);
    expect(text.split("\n")[0]).toBe("Sam Rivera: Hi Jordan, thanks for making the time today.");
    expect(speakers).toEqual(["Sam Rivera", "Jordan Lee"]);
  });

  it("merges consecutive lines from the same speaker", () => {
    const turns = parseTranscript("Ana: one\nAna: two\nBo: three");
    expect(turns).toEqual([
      { speaker: "Ana", text: "one two" },
      { speaker: "Bo", text: "three" },
    ]);
  });
});

describe("zoom webhook signature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ event: "recording.transcript_completed" });
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const sig = `v0=${crypto.createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;

  it("accepts a valid signature", () => {
    expect(verifyZoomSignature({ body, timestamp: ts, signature: sig, secret, now })).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyZoomSignature({ body: body + " ", timestamp: ts, signature: sig, secret, now })).toBe(false);
  });
  it("rejects stale requests (replay)", () => {
    expect(verifyZoomSignature({ body, timestamp: ts, signature: sig, secret, now: now + 10 * 60 * 1000 })).toBe(false);
  });
  it("rejects missing headers", () => {
    expect(verifyZoomSignature({ body, timestamp: null, signature: null, secret, now })).toBe(false);
  });
  it("answers the URL validation challenge", () => {
    const res = urlValidationResponse("abc", secret);
    expect(res.encryptedToken).toBe(crypto.createHmac("sha256", secret).update("abc").digest("hex"));
  });
});

describe("deterministic quality flags", () => {
  const facts: Facts = {
    summary: "",
    decisions: [],
    action_items: [{ task: "Send the deck", owner: "unknown", owner_is_me: false, due: "unknown", evidence: "someone send the deck" }],
    open_questions: [],
    personal_notes: [],
    next_meeting: "unknown",
    exclude: [{ text: "internal discount debate on pricing", reason: "Internal pricing" }],
  };

  it("flags unknown owners and deadlines instead of guessing", () => {
    const flags = deterministicFlags(facts, { subject: "", body: "Thanks!" }, []);
    expect(flags.map((f) => f.type)).toEqual(["owner_unclear", "deadline_guessed"]);
  });
  it("flags recipients without an email", () => {
    const flags = deterministicFlags({ ...facts, action_items: [] }, { subject: "", body: "" }, [{ name: "Jordan", email: null, source: "zoom" }]);
    expect(flags[0].type).toBe("recipient_unmatched");
  });
  it("flags excluded topics that leak into the draft", () => {
    const flags = deterministicFlags({ ...facts, action_items: [] }, { subject: "", body: "About the internal discount debate on pricing..." }, []);
    expect(flags.some((f) => f.type === "rule_violation")).toBe(true);
  });
});

describe("attendee merge", () => {
  it("fills emails from the calendar and keeps unmatched people visible", () => {
    const merged = mergeAttendees([
      [{ name: "Jordan Lee", email: null, source: "zoom" }, { name: "Pat", email: null, source: "zoom" }],
      [{ name: "Jordan Lee", email: "jordan@acme.com", source: "calendar" }],
    ]);
    expect(merged).toEqual([
      { name: "Jordan Lee", email: "jordan@acme.com", source: "zoom" },
      { name: "Pat", email: null, source: "zoom" },
    ]);
  });
});

describe("notion chunking", () => {
  it("keeps every chunk under 2000 chars without losing text", () => {
    const text = "word ".repeat(1500);
    const chunks = chunkText(text);
    expect(chunks.every((c) => c.length <= 2000)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(text.trim());
  });
});

describe("learning loop", () => {
  it("adds and removes rules and appends playbook learnings", () => {
    const out = applyChanges("# Playbook", "- Use first names.\n- Sign off with Best,", [
      { kind: "add_rule", text: "Keep it under 150 words.", rationale: "" },
      { kind: "remove_rule", text: "Sign off with Best,", rationale: "" },
      { kind: "edit_playbook", text: "Lead with the decision.", rationale: "" },
    ]);
    expect(out.rules).toBe("- Use first names.\n- Keep it under 150 words.\n");
    expect(out.playbook).toContain("## Learned from your edits\n- Lead with the decision.");
  });
});

describe("mock extraction", () => {
  it("keeps internal pricing talk out of the facts", () => {
    const facts = mockFacts(sample);
    expect(facts.exclude.length).toBe(1);
    expect(JSON.stringify(facts.action_items)).not.toMatch(/pricing/i);
  });
});
