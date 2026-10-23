import { after, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ingestZoomRecording } from "@/lib/ingest";
import { logEvent } from "@/lib/log";
import { processMeeting } from "@/lib/pipeline/run";
import { findTranscriptFile, type ZoomRecording } from "@/lib/zoom/client";
import { urlValidationResponse, verifyZoomSignature } from "@/lib/zoom/signature";

export const runtime = "nodejs";

type ZoomEvent = {
  event: string;
  download_token?: string;
  payload: { plainToken?: string; object?: ZoomRecording };
};

export async function POST(req: Request) {
  const secret = env.zoomWebhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  // Verify against the raw body before parsing anything.
  const body = await req.text();
  const ok = verifyZoomSignature({
    body,
    timestamp: req.headers.get("x-zm-request-timestamp"),
    signature: req.headers.get("x-zm-signature"),
    secret,
  });
  if (!ok) {
    await logEvent(null, "webhook", "error", "Rejected request with invalid or missing signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body) as ZoomEvent;

  if (event.event === "endpoint.url_validation" && event.payload.plainToken) {
    return NextResponse.json(urlValidationResponse(event.payload.plainToken, secret));
  }

  if (event.event !== "recording.transcript_completed" || !event.payload.object) {
    return NextResponse.json({ ignored: event.event });
  }

  const rec = event.payload.object;
  const { id, isNew } = await ingestZoomRecording(rec, "webhook");
  if (!isNew) {
    await logEvent(id, "webhook", "skipped", "Duplicate delivery ignored");
    return NextResponse.json({ duplicate: true });
  }

  await logEvent(id, "webhook", "ok", "Transcript event received");
  const file = findTranscriptFile(rec.recording_files);
  // Answer Zoom right away; the pipeline runs after the response is sent.
  after(() => processMeeting(id, file ? { download: { url: file.download_url, token: event.download_token } } : {}));
  return NextResponse.json({ queued: id });
}
