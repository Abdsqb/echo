import { env } from "../env";
import { fetchJson, withRetry } from "../retry";

// Zoom Server-to-Server OAuth app. Scopes needed:
// cloud_recording:read:list_user_recordings, cloud_recording:read:list_recording_files,
// meeting:read:list_past_participants (optional, for attendee names/emails).

const API = "https://api.zoom.us/v2";
let cached: { token: string; expiresAt: number } | null = null;

async function token() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const accountId = env.zoomAccountId();
  const id = env.zoomClientId();
  const secret = env.zoomClientSecret();
  if (!accountId || !id || !secret) throw new Error("Zoom API is not configured (ZOOM_ACCOUNT_ID / CLIENT_ID / CLIENT_SECRET)");

  const data = await fetchJson<{ access_token: string; expires_in: number }>(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } },
  );
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

const zoomGet = async <T>(path: string) =>
  withRetry(async () => fetchJson<T>(`${API}${path}`, { headers: { Authorization: `Bearer ${await token()}` } }));

// UUIDs that start with "/" or contain "//" must be double-encoded.
export const encodeUuid = (uuid: string) =>
  uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid);

export type RecordingFile = { file_type: string; recording_type?: string; download_url: string; status?: string };
export type ZoomRecording = {
  uuid: string;
  id: number | string;
  topic: string;
  start_time: string;
  duration?: number;
  recording_files?: RecordingFile[];
};

export const findTranscriptFile = (files: RecordingFile[] = []) =>
  files.find((f) => f.file_type === "TRANSCRIPT" || f.recording_type === "audio_transcript");

export async function getRecording(uuid: string) {
  return zoomGet<ZoomRecording>(`/meetings/${encodeUuid(uuid)}/recordings`);
}

export async function downloadTranscript(url: string, downloadToken?: string) {
  return withRetry(async () => {
    const auth = env.zoomClientId() ? `Bearer ${await token()}` : `Bearer ${downloadToken}`;
    const res = await fetch(url, { headers: { Authorization: auth }, redirect: "follow" });
    if (!res.ok) throw new Error(`Transcript download failed: ${res.status}`);
    const text = await res.text();
    if (!text.trim()) throw new Error("Transcript is empty (Zoom may still be processing it)");
    // A redirect to a login or error page still returns 200; only accept a
    // real WebVTT file so an HTML page can never be drafted as a meeting.
    if (!text.replace(/^﻿/, "").trimStart().startsWith("WEBVTT")) {
      throw new Error(`Download did not return a WebVTT transcript (got ${res.headers.get("content-type") ?? "unknown type"})`);
    }
    return text;
  });
}

export async function listRecordings(fromIso: string, toIso: string) {
  const meetings: ZoomRecording[] = [];
  let next = "";
  do {
    const page = await zoomGet<{ meetings: ZoomRecording[]; next_page_token?: string }>(
      `/users/me/recordings?page_size=100&from=${fromIso}&to=${toIso}${next ? `&next_page_token=${next}` : ""}`,
    );
    meetings.push(...page.meetings);
    next = page.next_page_token ?? "";
  } while (next);
  return meetings;
}

export async function getParticipants(uuid: string) {
  try {
    const data = await zoomGet<{ participants: { name: string; user_email?: string }[] }>(
      `/past_meetings/${encodeUuid(uuid)}/participants?page_size=300`,
    );
    return data.participants;
  } catch {
    return []; // Optional scope; attendee matching falls back to the calendar.
  }
}
