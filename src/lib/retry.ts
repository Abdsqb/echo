// Exponential backoff for flaky network calls. Final failure is rethrown so
// the caller can mark the job failed instead of dropping it silently.
export async function withRetry<T>(fn: () => Promise<T>, { attempts = 3, baseMs = 1000 } = {}): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastError;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(res.status, `${init?.method ?? "GET"} ${new URL(url).pathname} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}
