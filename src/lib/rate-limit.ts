// Simple in-memory rate limiter — no external dependencies.
// Resets counters per IP every WINDOW_MS milliseconds.
// For multi-instance deployments, use Upstash Redis instead (Phase 2).

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;  // max uploads per IP per window

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Cleanup old entries every 5 minutes to prevent unbounded growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 5 * 60_000);
}

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
  }

  entry.count++;
  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const allowed = entry.count <= MAX_REQUESTS;

  return { allowed, remaining, resetAt: entry.resetAt };
}
