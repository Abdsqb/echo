import { db, schema } from "./db";

// Records one pipeline step in the run log. Details must never contain
// transcript or email text, only counts, ids and error messages.
export async function logStep<T>(meetingId: number | null, step: string, fn: () => Promise<T>, detail?: (r: T) => string): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    await db.insert(schema.runs).values({
      meetingId,
      step,
      status: "ok",
      detail: detail ? detail(result) : "",
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    await db.insert(schema.runs).values({
      meetingId,
      step,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 500) : String(err),
      durationMs: Date.now() - started,
    });
    throw err;
  }
}

export async function logEvent(meetingId: number | null, step: string, status: "ok" | "error" | "skipped", detail = "") {
  await db.insert(schema.runs).values({ meetingId, step, status, detail });
}
