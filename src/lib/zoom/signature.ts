import crypto from "node:crypto";

// Zoom signs every webhook: x-zm-signature = "v0=" + HMAC-SHA256(secret, "v0:{timestamp}:{body}").
const MAX_SKEW_MS = 5 * 60 * 1000;

const hmac = (secret: string, message: string) => crypto.createHmac("sha256", secret).update(message).digest("hex");

export function verifyZoomSignature(opts: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: number;
}): boolean {
  const { body, timestamp, signature, secret, now = Date.now() } = opts;
  if (!timestamp || !signature) return false;

  // Zoom sends seconds; reject stale or future requests to block replays.
  const tsMs = Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1);
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > MAX_SKEW_MS) return false;

  const expected = Buffer.from(`v0=${hmac(secret, `v0:${timestamp}:${body}`)}`);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Response to Zoom's "endpoint.url_validation" challenge.
export function urlValidationResponse(plainToken: string, secret: string) {
  return { plainToken, encryptedToken: hmac(secret, plainToken) };
}
