import { env } from "./env";
import { fetchJson } from "./retry";
import type { Attendee } from "./types";

// Zoom rarely knows external guests' email addresses; the calendar invite
// does. Google Calendar via an OAuth refresh token (read-only scope:
// https://www.googleapis.com/auth/calendar.readonly).

type GEvent = {
  summary?: string;
  start?: { dateTime?: string };
  location?: string;
  description?: string;
  hangoutLink?: string;
  conferenceData?: unknown;
  attendees?: { email: string; displayName?: string; self?: boolean; resource?: boolean }[];
};

async function googleToken() {
  const data = await fetchJson<{ access_token: string }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId()!,
      client_secret: env.googleClientSecret()!,
      refresh_token: env.googleRefreshToken()!,
      grant_type: "refresh_token",
    }),
  });
  return data.access_token;
}

export async function calendarAttendees(start: Date, zoomMeetingId: string | null, topic: string): Promise<Attendee[] | null> {
  if (!env.googleClientId() || !env.googleClientSecret() || !env.googleRefreshToken()) return null;

  const window = 45 * 60 * 1000;
  const params = new URLSearchParams({
    timeMin: new Date(start.getTime() - window).toISOString(),
    timeMax: new Date(start.getTime() + window).toISOString(),
    singleEvents: "true",
    maxResults: "20",
  });
  const data = await fetchJson<{ items: GEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.googleCalendarId())}/events?${params}`,
    { headers: { Authorization: `Bearer ${await googleToken()}` } },
  );

  // Prefer the event that contains the Zoom meeting id; fall back to the title.
  const digits = zoomMeetingId?.replace(/\D/g, "");
  const event =
    (digits && data.items.find((e) => JSON.stringify(e).replace(/\D/g, " ").includes(digits))) ||
    data.items.find((e) => e.summary?.trim().toLowerCase() === topic.trim().toLowerCase());
  if (!event?.attendees) return null;

  return event.attendees
    .filter((a) => !a.self && !a.resource)
    .map((a) => ({ name: a.displayName ?? a.email.split("@")[0], email: a.email.toLowerCase(), source: "calendar" as const }));
}

// Merge sources: calendar entries carry emails; Zoom participants and
// transcript speakers without a match stay listed with email null so the
// quality check flags them. Never guess an address.
export function mergeAttendees(sources: (Attendee[] | null)[]): Attendee[] {
  const me = env.myEmail();
  const myFirst = env.myName()?.split(" ")[0].toLowerCase();
  const out: Attendee[] = [];
  const key = (s: string) => s.toLowerCase().split(/\s+/)[0];

  for (const list of sources) {
    for (const a of list ?? []) {
      if (a.email && a.email === me) continue;
      if (!a.email && myFirst && key(a.name) === myFirst) continue;
      const existing = out.find((o) => (a.email && o.email === a.email) || key(o.name) === key(a.name));
      if (existing) {
        if (!existing.email && a.email) existing.email = a.email;
        continue;
      }
      out.push({ ...a });
    }
  }
  return out;
}
