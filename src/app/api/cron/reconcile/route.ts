import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { reconcile } from "@/lib/ingest";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Call daily from any scheduler (Vercel cron, GitHub Actions, cron-job.org):
//   GET /api/cron/reconcile  with header  Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!integrations().zoomApi) return NextResponse.json({ error: "Zoom API not configured" }, { status: 503 });

  try {
    return NextResponse.json({ ok: true, summary: await reconcile() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEvent(null, "reconcile", "error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
