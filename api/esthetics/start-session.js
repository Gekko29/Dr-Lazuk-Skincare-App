// api/esthetics/start-session.js
// Phase B1: Geo + rate-limit gate for Lazuk Esthetics AI Concierge
//
// Locked:
// - Geo: within 20 miles of ZIP 30004 (center: lat 34.14352, lon -84.29926)
// - Rate limit: 2 runs / 24h per (email + IP)
// - CAPTCHA: skipped
// - Fail closed on geo lookup failure

const CENTER = { lat: 34.14352, lon: -84.29926 };
const RADIUS_MILES = 20;

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REQUESTS = 2;

// In-memory buckets (serverless best-effort; acceptable per your current constraints)
const buckets = new Map();

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function checkRateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now - b.start >= WINDOW_MS) {
    const next = { start: now, count: 1 };
    buckets.set(key, next);
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetInMs: WINDOW_MS };
  }

  b.count += 1;
  buckets.set(key, b);

  const allowed = b.count <= MAX_REQUESTS;
  const remaining = Math.max(MAX_REQUESTS - b.count, 0);
  const resetInMs = Math.max(WINDOW_MS - (now - b.start), 0);
  return { allowed, remaining, resetInMs };
}

async function geoWithinRadius(ip) {
  const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
  const resp = await fetch(url);
  const data = await resp.json();

  const lat = Number(data?.latitude);
  const lon = Number(data?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: "geo_failed" };
  }

  const dist = haversineMiles(lat, lon, CENTER.lat, CENTER.lon);
  return {
    ok: true,
    distanceMiles: dist,
    allowed: dist <= RADIUS_MILES,
    geo: {
      city: data?.city || null,
      region: data?.region || null,
      postal: data?.postal || null,
      country: data?.country_code || null,
      lat,
      lon,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const ip = getClientIp(req);

  const body = req.body || {};
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const email = normEmail(body.email);

  if (!firstName || !lastName || !email.includes("@")) {
    return res.status(400).json({ ok: false, error: "invalid_input" });
  }

  // Geo gate (fail closed)
  let geo;
  try {
    geo = await geoWithinRadius(ip);
  } catch {
    return res.status(403).json({ ok: false, error: "geo_unavailable" });
  }

  if (!geo.ok) {
    return res.status(403).json({ ok: false, error: "geo_unavailable" });
  }

  if (!geo.allowed) {
    return res.status(403).json({
      ok: false,
      error: "outside_service_area",
      details: { distanceMiles: geo.distanceMiles, radiusMiles: RADIUS_MILES },
    });
  }

  // Rate limit
  const key = `${email}|${ip}`;
  const rl = checkRateLimit(key);

  if (!rl.allowed) {
    res.setHeader("Retry-After", Math.ceil(rl.resetInMs / 1000));
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      details: {
        remaining: rl.remaining,
        retryAfterSeconds: Math.ceil(rl.resetInMs / 1000),
      },
    });
  }

  // Phase B1: no realtime session issued yet; gate only.
  return res.status(200).json({
    ok: true,
    flags: {
      ip,
      geo: { distanceMiles: geo.distanceMiles, radiusMiles: RADIUS_MILES },
      rateLimit: { remaining: rl.remaining },
    },
  });
}
