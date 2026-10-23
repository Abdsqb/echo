// Turns a Zoom .vtt transcript (or a pasted plain-text transcript) into
// clean "Speaker: text" turns. Plain code: no AI cost.

export type Turn = { speaker: string; text: string };

const TIMING = /^\d{2}:\d{2}(:\d{2})?[.,]\d{3}\s+-->\s+\d{2}:\d{2}(:\d{2})?[.,]\d{3}/;
const SPEAKER = /^([^:]{1,60}):\s+(.*)$/;

export function parseTranscript(raw: string): Turn[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const isVtt = lines[0]?.trim().startsWith("WEBVTT");
  const turns: Turn[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE")) continue;
    if (isVtt && (/^\d+$/.test(line) || TIMING.test(line))) continue;

    const match = line.match(SPEAKER);
    const speaker = match ? match[1].trim() : (turns.at(-1)?.speaker ?? "Unknown");
    const text = (match ? match[2] : line).trim();
    if (!text) continue;

    // Merge consecutive lines from the same speaker into one turn.
    const last = turns.at(-1);
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else turns.push({ speaker, text });
  }
  return turns;
}

export function cleanTranscript(raw: string): { text: string; speakers: string[] } {
  const turns = parseTranscript(raw);
  return {
    text: turns.map((t) => `${t.speaker}: ${t.text}`).join("\n"),
    speakers: [...new Set(turns.map((t) => t.speaker))].filter((s) => s !== "Unknown"),
  };
}
