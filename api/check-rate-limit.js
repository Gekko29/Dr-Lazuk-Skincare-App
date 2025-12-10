// api/check-rate-limit.js
// Lightweight in-memory rate limiter for Vercel serverless functions.
// Can be imported by other API handlers, and also called directly via HTTP
// for debugging if you want.

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 20;

// In-memory map keyed by identifier -> { start, count }
const buckets = new Map();

/**
 * Check and update rate limit for a given identifier.
 *
 * @param {Object} options
 * @param {string} options.identifier - Unique key per user/IP/route.
 * @param {number} [options.windowMs] - Window size in ms.
 * @param {number} [options.maxRequests] - Max allowed in window.
 * @returns {{ allowed: boolean, remaining: number, resetInMs: number }}
 */
export function checkRateLimit({
  identifier,
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
}) {
  const now = Date.now();
  const key = identifier || "global";

  let bucket = buckets.get(key);

  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(maxRequests - bucket.count, 0);
  const allowed = bucket.count <= maxRequests;
  const resetInMs = Math.max(windowMs - (now - bucket.start), 0);

  return { allowed, remaining, resetInMs };
}

// Optional: HTTP interface (useful for debugging, but not required)
export default async function handler(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const { allowed, remaining, resetInMs } = checkRateLimit({
    identifier: `debug:${ip}`,
  });

  if (!allowed) {
    res.setHeader("Retry-After", Math.ceil(resetInMs / 1000));
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      remaining,
      resetInMs,
    });
  }

  return res.status(200).json({
    ok: true,
    remaining,
    resetInMs,
  });
}
