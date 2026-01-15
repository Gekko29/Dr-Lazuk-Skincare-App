// api/generate-report.js
// FINAL — Dr. Lazuk Virtual Skin Analysis Report (Vercel-safe CJS)
//
// Key updates implemented:
// ✅ Requires FIRST NAME + EMAIL + SELFIE (photoDataUrl is mandatory)
// ✅ Enforces "once every 30 days" per email (in-memory; swap to KV/DB for production)
// ✅ US-only geo gate
// ✅ Strong vision enrichment if incoming imageAnalysis is weak/missing
// ✅ Enforces greeting "Dear <firstName>,", bans "Dear You"
// ✅ Generates 4 aging preview images USING THE SELFIE as the base (OpenAI Images Edits)
// ✅ Fixes email image rendering by converting selfie dataURL -> PUBLIC URL (Cloudinary or Vercel Blob)
// ✅ Places the 4 aging images NEAR THE END of the letter: just above Dr. Lazuk’s closing note/signature
// ✅ Keeps CommonJS compatibility (no top-level ESM imports)
//
// ADDITIONS (NO SUBTRACTIONS):
// ✅ Adds Dermatology Engine JSON (observations vs interpretation, structured differential thinking,
//    negative findings, confidence/limitations, two-signal evidence map, risk amplifiers, trajectory)
// ✅ Appends dermEngine to API response (additive field)
// ✅ (Optional) Includes dermEngine JSON block in CLINIC email only (visitor email remains unchanged)
// ✅ Locks dermEngine JSON keys so UI can reliably render
// ✅ Normalizes aging preview images to stable public URLs (prevents expiring OpenAI URLs)
//
// NEW (per request):
// ✅ Adds “heart-to-heart” Reflection copy to EMAIL (NO TITLES)
// ✅ Positions Reflection copy AFTER aging images in the emailed copies
//
// NEW (per request 12/22):
// ✅ Clinic/Contact email default changed to contact@drlazuk.com (was contact@skindoctor.ai)
//
// IMPORTANT CHANGE (12/23):
// ✅ Removed server-side watermark pixel-baking (Sharp) — watermark is client-side only now.
//
// NEW (LOCKED — per your directive):
// ✅ “Areas of Focus” is now DYNAMIC (0–7 items, only triggered by analysis)
// ✅ Naming convention is LOCKED:
//    - The Compounding Risk
//    - Do This Now
// ✅ This section is course correction (not reassurance), physician-credible urgency without panic
// ✅ The same Areas of Focus content appears in BOTH:
//    - emailed report
//    - on-screen (API response payload) report
//
// IMPORTANT FIX (12/24):
// ✅ Prevents “always 7 categories” bug by scanning VALUE text only (not JSON keys/headings)
// ✅ Triggers require risk/problem language (not just category words existing in the payload)
//
// NEW (12/26 — LOW LOE V2 FEATURES):
// ✅ Adds Visual Signals V2 (low-LOE high-ROI image-specific signals)
//    - Asymmetry (basic)
//    - Oil–hydration mismatch pattern
//    - Pigment distribution pattern
//    - Barrier stress hotspots
//    - Lips/perioral cues
//    - Periorbital sub-zone cues
//    - Neck–face aging ratio (confidence-weighted inference)
//    - Micro-wrinkle density + orientation
//    - Pores by zone
//    - Glow/reflectance proxy
// ✅ Adds short, no-title, paragraph-only “precision detail” insert into the LETTER (no headings)
// ✅ Appends visualSignalsV2 JSON to API response and clinic email QA block (visitor unchanged)
//
// NEW (12/26 — QUALITY HARDENING):
// ✅ Adds server-side Capture Quality Gate (reject partial/side/poor selfies BEFORE cooldown consumption)
// ✅ Makes Areas of Focus confidence-aware (suppresses course correction when photo confidence is low)
//
// -------------------------
// Node built-ins (required)
// -------------------------
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");


/* ---------------------------------------
   Production Scoring + RAG (Server-side canonical payload)
   Purpose: Ensure the client receives real per-metric scores (0–100) and RAG,
   so the UI never falls back to narrative inference defaults (e.g., 70 everywhere).
--------------------------------------- */
const RAG_THRESHOLDS = { green: 75, amber: 55 };

function ragFromScore(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "unknown";
  if (score >= RAG_THRESHOLDS.green) return "green";
  if (score >= RAG_THRESHOLDS.amber) return "amber";
  return "red";
}

function clampScore(n) {
  if (n === null || n === undefined || n === "") return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x)));
}

// Many V2 fields encode "severity" or "level" text. We normalize to a 0–100 "health score".
function scoreFromLevel(level, { invert = true } = {}) {
  const t = String(level || "").toLowerCase().trim();
  if (!t) return null;

  // Common label sets (support both "none/mild/moderate/severe" and "low/medium/high")
  const severityMap = {
    none: 5,
    minimal: 10,
    very_low: 10,
    low: 20,
    mild: 25,
    slight: 25,
    medium: 45,
    moderate: 55,
    elevated: 65,
    high: 80,
    severe: 90,
    very_high: 95
  };

  const key = t.replace(/\s+/g, "_").replace(/-+/g, "_");
  const sev = severityMap[key];
  if (typeof sev !== "number") return null;

  const raw = invert ? (100 - sev) : sev;
  return clampScore(raw);
}

function scoreFromNumber(value, { invert = false, unit = "auto" } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const x = Number(value);
  if (Number.isNaN(x)) return null;

  let n = x;
  // If value looks like 0–1 confidence/ratio, scale to 0–100.
  if (unit === "auto" && n >= 0 && n <= 1) n = n * 100;
  if (invert) n = 100 - n;
  return clampScore(n);
}

function safeGet(obj, path, fallback = null) {
  try {
    return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function metric(id, title, score, extra = {}) {
  const s = clampScore(score);
  return {
    id,
    title,
    score: s,
    rag: ragFromScore(s),
    ...extra
  };
}

function averageScore(items = []) {
  const nums = items.map((x) => (typeof x?.score === "number" ? x.score : null)).filter((n) => typeof n === "number");
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return clampScore(avg);
}

function buildCanonicalPayloadFromSignalsV2(visualSignalsV2 = {}, { nowIso } = {}) {
  const generated_at = nowIso || new Date().toISOString();

  // Pull common V2 nodes (robust to missing keys)
  const periorbital = safeGet(visualSignalsV2, "periorbital", {});
  const pigment = safeGet(visualSignalsV2, "pigmentPattern", {});
  const barrier = safeGet(visualSignalsV2, "barrierStressHotspots", {});
  const pores = safeGet(visualSignalsV2, "poresByZone", {});
  const glow = safeGet(visualSignalsV2, "glowReflectance", {});
  const mismatch = safeGet(visualSignalsV2, "oilHydrationMismatch", {});
  const micro = safeGet(visualSignalsV2, "microWrinkleDensity", {});
  const neckFace = safeGet(visualSignalsV2, "neckFaceAgingRatio", {});

  // --- Skin Health cluster ---
  const skinMetrics = [
    metric("glow", "Glow / Radiance", scoreFromLevel(safeGet(glow, "level"), { invert: false }) ?? scoreFromNumber(safeGet(glow, "score"), { invert: false })),
    metric("pores", "Pores", scoreFromLevel(safeGet(pores, "overall.level")) ?? scoreFromLevel(safeGet(pores, "level"))),
    metric("oil_hydration_balance", "Oil–Hydration Balance", scoreFromLevel(safeGet(mismatch, "severity")) ?? scoreFromLevel(safeGet(mismatch, "level"))),
    metric("barrier", "Barrier Resilience", scoreFromLevel(safeGet(barrier, "severity")) ?? scoreFromLevel(safeGet(barrier, "level"))),
  ].filter((m) => m.score !== null);

  // --- Aging & Structure cluster ---
  const agingMetrics = [
    metric("micro_wrinkles", "Micro-Wrinkle Density", scoreFromLevel(safeGet(micro, "level")) ?? scoreFromNumber(safeGet(micro, "score"))),
    metric("neck_face_ratio", "Neck vs Face Aging Balance", scoreFromNumber(safeGet(neckFace, "ratio"), { invert: false }) ),
  ].filter((m) => m.score !== null);

  // --- Eye Area cluster ---
  const eyeMetrics = [
    metric("dark_circles", "Under-Eye Darkness", scoreFromLevel(safeGet(periorbital, "darkCircles.level")) ?? scoreFromLevel(safeGet(periorbital, "darkCircle.level"))),
    metric("puffiness", "Under-Eye Puffiness", scoreFromLevel(safeGet(periorbital, "puffiness.level"))),
    metric("fine_lines", "Fine Lines", scoreFromLevel(safeGet(periorbital, "fineLines.level"))),
  ].filter((m) => m.score !== null);

  // --- Pigmentation & Tone cluster ---
  const pigmentMetrics = [
    metric("pigment_uniformity", "Tone Uniformity", scoreFromLevel(safeGet(pigment, "uniformity")) ?? scoreFromLevel(safeGet(pigment, "uniformity.level"), { invert: false })),
    metric("dark_spots", "Dark Spots / Hyperpigmentation", scoreFromLevel(safeGet(pigment, "darkSpots.level")) ?? scoreFromLevel(safeGet(pigment, "spotting.level"))),
    metric("overall_pigment", "Pigment Pattern", scoreFromLevel(safeGet(pigment, "level")) ?? scoreFromLevel(safeGet(pigment, "severity"))),
  ].filter((m) => m.score !== null);

  // --- Stress & Damage cluster ---
  const stressMetrics = [
    metric("barrier_stress", "Barrier Stress", scoreFromLevel(safeGet(barrier, "severity")) ?? scoreFromLevel(safeGet(barrier, "level"))),
    metric("oil_hydration_mismatch", "Oil/Hydration Mismatch", scoreFromLevel(safeGet(mismatch, "severity")) ?? scoreFromLevel(safeGet(mismatch, "level"))),
  ].filter((m) => m.score !== null);

  const clusters = [
    {
      id: "skin_health",
      title: "Skin Health",
      metrics: skinMetrics
    },
    {
      id: "aging_structure",
      title: "Aging & Structure",
      metrics: agingMetrics
    },
    {
      id: "eye_area",
      title: "Eye Area",
      metrics: eyeMetrics
    },
    {
      id: "pigmentation_tone",
      title: "Pigmentation & Tone",
      metrics: pigmentMetrics
    },
    {
      id: "stress_damage",
      title: "Stress & Damage",
      metrics: stressMetrics
    }
  ].map((c) => {
    const score = averageScore(c.metrics);
    return { ...c, score, rag: ragFromScore(score) };
  });

  const overall = averageScore(clusters.map((c) => ({ score: c.score })));

  return {
    version: "1.0",
    generated_at,
    overall_score: { score: overall, rag: ragFromScore(overall) },
    clusters
  };
}


/* ---------------------------------------
   Visual Payload Builder (UI compatibility)
--------------------------------------- */

function buildCanonicalPayloadFromIncomingImageAnalysis(imageAnalysis, { nowIso } = {}) {
  if (!imageAnalysis || typeof imageAnalysis !== "object") return null;

  const overall_score = imageAnalysis.overall_score || imageAnalysis.overallScore || null;
  const incClusters = Array.isArray(imageAnalysis.clusters) ? imageAnalysis.clusters : null;
  if (!overall_score || !incClusters) return null;

  // Normalize to a single canonical shape
  const clusters = incClusters
    .map((c) => {
      const metrics = Array.isArray(c.metrics) ? c.metrics : [];
      const scores = metrics.map((m) => Number(m.score)).filter((n) => Number.isFinite(n));
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return {
        cluster_id: c.cluster_id || c.id || null,
        display_name: c.display_name || c.title || null,
        weight: typeof c.weight === "number" ? c.weight : null,
        order: typeof c.order === "number" ? c.order : null,
        score: avg,
        rag: avg === null ? null : ragFromScore(avg),
        metrics: metrics
          .map((m) => ({
            metric_id: m.metric_id || m.id || null,
            display_name: m.display_name || m.label || m.title || null,
            score: typeof m.score === "number" ? m.score : null,
            rag: m.rag || (typeof m.score === "number" ? ragFromScore(m.score) : null),
            cluster_id: m.cluster_id || c.cluster_id || c.id || null,
            order: typeof m.order === "number" ? m.order : null,
          }))
          .filter((m) => m.metric_id),
      };
    })
    .filter((c) => c.cluster_id);

  return {
    version: "locked-v1",
    generated_at: nowIso || new Date().toISOString(),
    model: "analyzeImage",
    context: {
      age_range: null,
      primary_concern: null,
    },
    overall_score,
    clusters,
  };
}

function buildVisualPayloadFromCanonical(canonical) {
  const overall = canonical?.overall_score || null;
  const rawClusters = Array.isArray(canonical?.clusters) ? canonical.clusters : [];

  const clusters = rawClusters
    .map((c) => {
      const metrics = Array.isArray(c.metrics) ? c.metrics : [];
      const scores = metrics.map((m) => Number(m.score)).filter((n) => Number.isFinite(n));
      const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : (typeof c.score === "number" ? c.score : null);
      const rag = c.rag || (score === null ? null : ragFromScore(score));
      return {
        id: c.cluster_id || c.id,
        title: c.display_name || c.title,
        score,
        rag,
        metrics: metrics.map((m) => ({
          id: m.metric_id || m.id,
          label: m.display_name || m.label || m.title,
          score: typeof m.score === "number" ? m.score : null,
          rag: m.rag || (typeof m.score === "number" ? ragFromScore(m.score) : null),
          order: typeof m.order === "number" ? m.order : null,
        })).filter((m) => m.id),
      };
    })
    .filter((c) => c.id);

  return {
    version: "v2-ui",
    overall: overall && typeof overall.score === "number" ? overall : null,
    clusters,
    topSignals: [],
  };
}


function buildVisualPayloadFromCanonical(canonical) {
  if (!canonical || typeof canonical !== "object") {
    return { version: "v2-ui", overall: null, clusters: [], topSignals: [] };
  }

  // canonical is expected to have overall_score + clusters[] (locked shape from /api/analyzeImage)
  const overall = canonical?.overall_score || null;

  const clusters = Array.isArray(canonical?.clusters) ? canonical.clusters : [];
  const uiClusters = clusters.map((c) => {
    const metrics = Array.isArray(c?.metrics) ? c.metrics : [];
    const metricScores = metrics.map((m) => (typeof m?.score === "number" ? m.score : null)).filter((x) => typeof x === "number");
    const avg = metricScores.length ? Math.round(metricScores.reduce((a, b) => a + b, 0) / metricScores.length) : null;

    return {
      id: c.cluster_id || c.id || "unknown",
      title: c.display_name || c.title || "",
      weight: typeof c.weight === "number" ? c.weight : null,
      order: typeof c.order === "number" ? c.order : null,
      score: avg,
      rag: typeof avg === "number" ? ragFromScore(avg) : (c.rag || "amber"),
      metrics: metrics.map((m) => ({
        id: m.metric_id || m.id || "",
        label: m.display_name || m.label || "",
        score: typeof m.score === "number" ? m.score : null,
        rag: m.rag || (typeof m.score === "number" ? ragFromScore(m.score) : "amber"),
        order: typeof m.order === "number" ? m.order : null,
      })),
    };
  });

  return {
    version: "v2-ui",
    overall,
    clusters: uiClusters,
    topSignals: [],
  };
}


function recommendProtocol({ primaryConcern, clusters }) {
  // Locked logic:
  // Hydration/Barrier: Radiant (Basic) -> Luxe (Advanced)
  // Sensitivity/Calming: Clarite (Basic) -> Serein (Advanced)
  // If sensitivity is mentioned/primary -> Clarite track (upgrade to Serein if any additional/moderate finding)
  // Otherwise default Radiant if one primary concern and nothing moderate; upgrade to Luxe if aging is primary and hydration is moderate/secondary or any additional/moderate finding.
  const pc = (primaryConcern || "").toLowerCase();
  const hasSensitivity = pc.includes("sens") || pc.includes("red") || pc.includes("ros") || pc.includes("irrit");
  // Determine if there is any moderate finding: any cluster score < 70 treated as moderate/attention threshold
  const scores = (clusters || []).map((c) => Number(c.score)).filter((n) => Number.isFinite(n));
  const hasModerate = scores.some((s) => s < 70);

  if (hasSensitivity) {
    return hasModerate
      ? { id: "serein", name: "Serein Balance", tier: "Advanced", url: "https://www.skindoctor.ai/product-page/serein-balance-advanced-skincare-deep-hydration-restored-calm-resilient-skin" }
      : { id: "clarite", name: "Clarite Protocol", tier: "Basic", url: "https://www.skindoctor.ai/product-page/clarite-protocol" };
  }

  const hasAging = pc.includes("aging") || pc.includes("wrinkle") || pc.includes("firm") || pc.includes("lift");
  const hydrationCluster = (clusters || []).find((c) => (c.id || c.cluster_id || "").toLowerCase().includes("hydr"));
  const hydrationScore = hydrationCluster ? Number(hydrationCluster.score) : NaN;
  const hydrationModerate = Number.isFinite(hydrationScore) ? hydrationScore < 75 : false;

  if (hasAging && (hydrationModerate || hasModerate)) {
    return { id: "luxe", name: "Luxe Renewal", tier: "Advanced", url: "https://www.skindoctor.ai/product-page/luxe-renewal-complete-skincare-solution-advanced-firming-elevated-renewal" };
  }

  return hasModerate
    ? { id: "luxe", name: "Luxe Renewal", tier: "Advanced", url: "https://www.skindoctor.ai/product-page/luxe-renewal-complete-skincare-solution-advanced-firming-elevated-renewal" }
    : { id: "radiant", name: "Radiant Protocol", tier: "Basic", url: "https://www.skindoctor.ai/product-page/radiant-protocol-skincare-solution-natural-hydration-luminosity" };
}

// --- Fallback: build canonical payload when visualSignalsV2 is missing/invalid ---
// Model B philosophy: prefer real signal scores; otherwise infer conservative, non-alarmist scores
// from the report narrative so the UI can still render rings, numbers, and RAG consistently.
function buildCanonicalPayloadFallback(
  { reportText = "", ageRange = "", primaryConcern = "" } = {},
  { nowIso } = {}
) {
  const t = String(reportText || "").toLowerCase();
  const has = (re) => re.test(t);

  // Conservative scoring: avoid extremes; keep within amber/green unless strong negative language exists.
  const scoreFor = (negRe, posRe, base = 72) => {
    const neg = has(negRe);
    const pos = has(posRe);
    if (neg && !pos) return 58;
    if (pos && !neg) return 82;
    return base;
  };

  const barrier = scoreFor(
    /(dry|dehydrat|irritat|sensitiv|flak|redness|barrier|tight)/i,
    /(balanced|resilient|calm|comfortable|intact|well\-managed)/i,
    70
  );
  const sebum = scoreFor(
    /(oily|oiliness|shine|congest|clog|blackhead|whitehead|breakout|acne|pore)/i,
    /(clear|refined pores|well\-managed pores|minimal congestion|balanced oil)/i,
    72
  );
  const pigment = scoreFor(
    /(pigment|hyperpig|dark spot|uneven tone|melasma|discolor)/i,
    /(even tone|bright|uniform|minimal discolor)/i,
    74
  );
  const aging = scoreFor(
    /(wrinkl|fine line|sagg|loss of firmness|crepey|elastic)/i,
    /(smooth|firm|plump|supported|youthful)/i,
    70
  );
  const eye = scoreFor(
    /(under\-eye|dark circle|puff|bags|crow\'s feet)/i,
    /(bright|rested|minimal puff|minimal dark circle)/i,
    74
  );

  const scores = [barrier, sebum, pigment, aging, eye].filter((x) => typeof x === "number" && !Number.isNaN(x));
  const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 70;

  const make = (id, title, score, keywords = []) => ({
    id,
    title,
    score,
    rag: ragFromScore(score),
    confidence: 0.35,
    basis: "narrative_fallback",
    keywords,
  });

  const clusters = [
    make("barrier_stability", "Barrier Stability", barrier, ["barrier", "dry", "irritation", "sensitivity"]),
    make("sebum_congestion", "Sebum & Congestion", sebum, ["oil", "pores", "congestion", "breakouts"]),
    make("pigment_tone", "Pigment & Tone", pigment, ["tone", "pigment", "discoloration"]),
    make("aging_structure", "Aging & Structure", aging, ["fine lines", "firmness", "elasticity"]),
    make("eye_area", "Eye Area", eye, ["under-eye", "dark circles", "puffiness"]),
  ];

  return {
    version: "v2",
    generated_at: nowIso || new Date().toISOString(),
    model: "fallback:model-b",
    context: {
      age_range: ageRange || null,
      primary_concern: primaryConcern || null,
    },
    overall_score: {
      score: overall,
      rag: ragFromScore(overall),
      confidence: 0.35,
      basis: "narrative_fallback",
    },
    clusters,
  };
}

function isValidVisualSignalsV2(v = {}) {
  if (!v || typeof v !== "object") return false;
  // Accept if it contains at least one numeric score field we expect.
  const candidates = [
    v?.overallSkinHealthScore,
    v?.skinHealth?.textureScore,
    v?.aging?.fineLinesScore,
    v?.eyeArea?.underEyeDarknessScore,
    v?.pigmentTone?.unevenToneScore,
    v?.stressDamage?.sensitivityScore,
  ];
  return candidates.some((x) => typeof x === "number" && !Number.isNaN(x));
}


/* ---------------------------------------
   Visual Signals V2 (Model B) — Derivation Layer
   Goal: Always provide clusters + scores for the UI rings.
   - Uses "Severity Ceiling" (no > moderate)
   - Suppresses low-confidence metrics (Insight Suppression)
--------------------------------------- */

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// -------------------------
// Analysis Confidence (0..100)
// Converts capture-quality evaluation into a single user-facing score.
// Purpose: avoid hard-fail on imperfect photos; proceed best-effort with clear disclosure.
// -------------------------
function computeAnalysisConfidence(captureQuality) {
  // Default: assume good capture.
  const cq = captureQuality && typeof captureQuality === "object" ? captureQuality : null;
  if (!cq) return { score: 100, level: "high", reasons: [], requirementsForRetry: [] };

  const raw = clamp01(cq.confidence ?? 0.8);
  let score = Math.round(raw * 100);

  const reasons = Array.isArray(cq.reasons) ? cq.reasons.filter(Boolean) : [];
  const requirementsForRetry = Array.isArray(cq.requirementsForRetry)
    ? cq.requirementsForRetry.filter(Boolean)
    : [];

  // If the evaluator says it is NOT usable, cap the score and add penalties per reason.
  if (cq.isUsable === false) {
    score = Math.min(score, 60);
    score -= Math.min(20, reasons.length * 7);
  }

  // Small penalty for any listed issues (even if usable).
  if (reasons.length > 0) score -= Math.min(10, Math.max(0, reasons.length - 1) * 3);

  score = Math.max(25, Math.min(100, score));

  const level = score >= 85 ? "high" : score >= 65 ? "medium" : "low";
  return { score, level, reasons, requirementsForRetry };
}

function ceilingLevel(level) {
  const l = String(level || "").toLowerCase();
  if (l === "severe" || l === "high") return "moderate";
  if (l === "moderate" || l === "medium") return "moderate";
  if (l === "mild" || l === "low") return "mild";
  if (l === "none") return "none";
  return "mild";
}

function deriveLevel({ primaryConcern, ageRange, key }) {
  const pc = String(primaryConcern || "").toLowerCase();
  const age = String(ageRange || "").toLowerCase();

  // Default bias: mild (keeps language calm)
  let level = "mild";

  // If primary concern maps strongly to the signal, raise to moderate
  if (pc === "aging") {
    if (["microWrinkleDensity", "neckFaceAgingRatio", "periorbital"].includes(key)) level = "moderate";
  } else if (pc === "acne") {
    if (["poresByZone", "oilHydrationMismatch"].includes(key)) level = "moderate";
  } else if (pc === "pigmentation") {
    if (["pigmentPattern"].includes(key)) level = "moderate";
  } else if (pc === "dryness") {
    if (["barrierStressHotspots", "oilHydrationMismatch"].includes(key)) level = "moderate";
  } else if (pc === "oiliness") {
    if (["oilHydrationMismatch", "poresByZone"].includes(key)) level = "moderate";
  } else if (pc === "sensitivity") {
    if (["barrierStressHotspots"].includes(key)) level = "moderate";
  }

  // Age-based soft bump (never above moderate)
  if (pc === "aging" && (age.includes("50") || age.includes("60") || age.includes("70"))) {
    if (["microWrinkleDensity", "neckFaceAgingRatio"].includes(key)) level = "moderate";
  }

  return ceilingLevel(level);
}

function deriveConfidence(imageContext) {
  // Uses available imageContext signals if present.
  // IMPORTANT: some upstream providers send 0 as a placeholder for "unknown".
  // Treat 0/NaN/empty as missing and fall back to a neutral default (0.75) to avoid over-suppressing.
  const q = imageContext && typeof imageContext === "object" ? imageContext : {};

  const pick01 = (v, fallback = 0.75) => {
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    if (Number.isNaN(n)) return fallback;
    // Treat exact 0 as "unknown" (common placeholder) unless caller explicitly provides richer context.
    if (n === 0) return fallback;
    return clamp01(n);
  };

  const lighting = pick01(q.lighting_confidence ?? q.lightingConfidence);
  const focus = pick01(q.focus_confidence ?? q.focusConfidence);
  const occlusion = pick01(q.occlusion_confidence ?? q.occlusionConfidence);

  // Conservative aggregate
  return clamp01(0.4 * lighting + 0.4 * focus + 0.2 * occlusion);
}

function shouldSuppressMetric(confidence) {
  return typeof confidence === "number" && confidence < 0.55;
}

function deriveVisualSignalsV2({ primaryConcern, ageRange, imageContext }) {
  const baseConfidence = deriveConfidence(imageContext);

  const mk = (key, label, rationale, shape = "level") => {
    const level = deriveLevel({ primaryConcern, ageRange, key });
    const confidence = baseConfidence;
    if (shouldSuppressMetric(confidence)) return null; // Insight suppression

    const common = {
      confidence,
      rationale: rationale || "Derived from image context and the selected scoring philosophy."
    };

    if (shape === "overall.level") return { [key]: { overall: { level }, ...common, label } };
    if (shape === "severity") return { [key]: { severity: level, ...common, label } };
    return { [key]: { level, ...common, label } };
  };

  const parts = [
    mk("glowReflectance", "Glow / Reflectance", "Surface reflectance and overall skin luminosity.", "overall.level"),
    mk("barrierStressHotspots", "Barrier Stability", "Signs consistent with barrier stress or uneven hydration.", "level"),
    mk("poresByZone", "Sebum & Congestion", "Pore visibility and congestion tendency by zone.", "overall.level"),
    mk("oilHydrationMismatch", "Oil / Hydration Balance", "Balance between oil presence and hydration.", "level"),
    mk("microWrinkleDensity", "Fine Lines & Texture", "Fine line density and micro-texture cues.", "level"),
    mk("neckFaceAgingRatio", "Aging & Structure", "Relative aging cues (structure/elasticity indicators).", "severity"),
    mk("periorbital", "Eye Area", "Periorbital texture and fatigue-related cues.", "overall.level"),
    mk("pigmentPattern", "Pigment & Tone", "Tone uniformity and pigmentation pattern cues.", "overall.level")
  ].filter(Boolean);

  const v2 = {};
  for (const p of parts) Object.assign(v2, p);
  return v2;
}
// -------------------------
// Dynamic imports (CJS-safe)
// -------------------------
async function getOpenAIClient() {
  const mod = await import("openai");
  const OpenAI = mod?.default || mod;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getBuildAnalysis() {
  // Load ../lib/analysis.js (ESM) safely from CJS
  const fileUrl = pathToFileURL(path.join(__dirname, "..", "lib", "analysis.js")).href;
  const mod = await import(fileUrl);
  return mod.buildAnalysis;
}

// -------------------------
// ADD: Dermatology Engine (Structured JSON, additive only)
// -------------------------
const DERM_ENGINE_SYSTEM = `
You are Dr. Lazuk’s Dermatology-Grade Visual Skin Assessment Engine.

Task:
Perform a VISUAL-ONLY dermatologic-style skin assessment from the provided face photo(s) and the visitor’s form data. You must follow structured dermatologist reasoning:
observe → interpret (non-diagnostic) → consider differentials → note negative findings → state confidence/limitations → provide trajectory and plan.

Hard rules (must follow):
1) VISUAL ONLY: Do not claim you used touch, dermoscopy, palpation, labs, biopsy, Wood’s lamp, or tools not provided.
   No medical diagnosis. No disease naming as definitive. Use “suggestive of / consistent with / may indicate.”
2) TWO-SIGNAL RULE: Do not assert any clinical interpretation unless supported by at least TWO independent visual cues.
   If only one cue exists, mark it “low confidence.”
3) OBSERVATION ≠ INTERPRETATION: Always separate what is seen (objective) from what it suggests (clinical meaning).
4) NEGATIVE FINDINGS REQUIRED: Include “what I do NOT see.”
5) CONSERVATIVE LANGUAGE: Avoid certainty. Avoid fear-based language. Focus on education + prevention + skincare guidance.
6) CONFIDENCE & LIMITATIONS REQUIRED: Score confidence (0–100). List limitations (lighting, angle, makeup, glasses, resolution, shadows, facial hair, expression).
7) FITZPATRICK-AWARE: Discuss pigmentation/irritation sensitivity in a Fitzpatrick-aware, non-diagnostic way.
8) SAFETY: If something appears potentially urgent, do NOT diagnose. Advise prompt in-person evaluation.
9) OUTPUT MUST BE VALID JSON ONLY. No markdown. No extra text.

Voice:
Clinical, dermatologist-like, structured, calm, and precise.
`.trim();

function buildDermEngineUserPrompt({
  firstName,
  email,
  ageRange,
  primaryConcern,
  visitorQuestion,
  analysisContext,
  imageAnalysis,
}) {
  return `
Visitor form data:
- firstName: ${firstName || ""}
- email: ${email || ""}
- ageRange: ${ageRange || ""}
- primaryConcern: ${primaryConcern || ""}
- visitorQuestion: ${visitorQuestion || ""}

Context you may use (do not repeat verbatim; use for specificity):
- analysisContext_json: ${JSON.stringify(analysisContext || {}, null, 2)}
- imageAnalysis_json: ${JSON.stringify(imageAnalysis || {}, null, 2)}

15-point framework headings (keep these exact keys in the JSON under framework_15_point):
1. Skin type (Fitzpatrick-aware)
2. Barrier integrity
3. Inflammation markers
4. Pigment distribution
5. Wrinkle patterning (static vs dynamic)
6. Pore morphology
7. Texture irregularity
8. Vascular cues
9. Acne morphology
10. Photoaging indicators
11. Hydration signals
12. Sebum activity
13. Symmetry and regional variation
14. Environmental stress indicators
15. Aging trajectory

New dermatologist cognition elements (must be included in JSON):
- Observed Visual Findings (objective)
- Clinical Interpretation (non-diagnostic)
- Structured Differential Considerations (most consistent / also consider / less likely + why)
- Negative Findings (what is NOT seen)
- Confidence & Limitations (0–100 + reasons)
- Two-Signal Evidence Map (each interpretation must list 2+ cues)
- Risk Amplifiers (e.g., Fitzpatrick + inflammation + UV cues)
- Trajectory Forecast (90 days + 6–12 months if unchanged)

Return JSON only using this top-level shape (use these EXACT keys):

{
  "meta": {
    "engine": "Dermatology Engine",
    "version": "1.0",
    "confidence_score_0_100": 0,
    "confidence_label": "low|medium|high",
    "limitations": ["string", "string"]
  },
  "personalization": {
    "salient_selfie_details_used": ["string", "string"]
  },
  "observed_visual_findings": [
    { "finding": "string", "location": "string", "severity": "mild|moderate|marked|unknown" }
  ],
  "two_signal_evidence_map": [
    {
      "interpretation": "string",
      "confidence": "low|medium|high",
      "signals": ["signal 1", "signal 2"]
    }
  ],
  "clinical_interpretation_non_diagnostic": [
    { "statement": "string", "confidence": "low|medium|high" }
  ],
  "structured_differential_considerations": {
    "most_consistent": [{ "possibility": "string", "why": "string" }],
    "also_consider": [{ "possibility": "string", "why": "string" }],
    "less_likely": [{ "possibility": "string", "why": "string" }]
  },
  "negative_findings": [
    { "not_observed": "string", "why_it_matters": "string" }
  ],
  "risk_amplifiers": [
    { "amplifier": "string", "why": "string" }
  ],
  "framework_15_point": {
    "1. Skin type (Fitzpatrick-aware)": "string",
    "2. Barrier integrity": "string",
    "3. Inflammation markers": "string",
    "4. Pigment distribution": "string",
    "5. Wrinkle patterning (static vs dynamic)": "string",
    "6. Pore morphology": "string",
    "7. Texture irregularity": "string",
    "8. Vascular cues": "string",
    "9. Acne morphology": "string",
    "10. Photoaging indicators": "string",
    "11. Hydration signals": "string",
    "12. Sebum activity": "string",
    "13. Symmetry and regional variation": "string",
    "14. Environmental stress indicators": "string",
    "15. Aging trajectory": {
      "dominant_driver": "string",
      "90_days_if_unchanged": "string",
      "6_12_months_if_unchanged": "string"
    }
  },
  "visitor_question_answer": {
    "answer": "string",
    "notes": "string"
  },
  "next_steps_summary": {
    "top_priorities": ["string", "string", "string"],
    "timeline": {
      "next_7_days": "string",
      "next_30_days": "string",
      "next_90_days": "string"
    }
  }
}
`.trim();
}

function safeJsonParse(maybeJsonText) {
  try {
    if (!maybeJsonText) return null;
    const t = String(maybeJsonText).trim();
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    return JSON.parse(t.slice(s, e + 1));
  } catch {
    return null;
  }
}

function normalizeDermEngineKeys(derm) {
  // Add-only normalization: ensure expected structure exists so UI renderers don't crash
  const d = derm && typeof derm === "object" ? derm : {};
  d.meta = d.meta || {};
  d.meta.engine = d.meta.engine || "Dermatology Engine";
  d.meta.version = d.meta.version || "1.0";

  if (typeof d.meta.confidence_score_0_100 !== "number") d.meta.confidence_score_0_100 = 0;
  d.meta.confidence_label = d.meta.confidence_label || "low";
  if (!Array.isArray(d.meta.limitations)) d.meta.limitations = [];

  d.personalization = d.personalization || { salient_selfie_details_used: [] };
  if (!Array.isArray(d.personalization.salient_selfie_details_used))
    d.personalization.salient_selfie_details_used = [];

  if (!Array.isArray(d.observed_visual_findings)) d.observed_visual_findings = [];
  if (!Array.isArray(d.two_signal_evidence_map)) d.two_signal_evidence_map = [];
  if (!Array.isArray(d.clinical_interpretation_non_diagnostic))
    d.clinical_interpretation_non_diagnostic = [];

  d.structured_differential_considerations = d.structured_differential_considerations || {
    most_consistent: [],
    also_consider: [],
    less_likely: [],
  };
  if (!Array.isArray(d.structured_differential_considerations.most_consistent))
    d.structured_differential_considerations.most_consistent = [];
  if (!Array.isArray(d.structured_differential_considerations.also_consider))
    d.structured_differential_considerations.also_consider = [];
  if (!Array.isArray(d.structured_differential_considerations.less_likely))
    d.structured_differential_considerations.less_likely = [];

  if (!Array.isArray(d.negative_findings)) d.negative_findings = [];
  if (!Array.isArray(d.risk_amplifiers)) d.risk_amplifiers = [];

  d.framework_15_point = d.framework_15_point || {};
  d.visitor_question_answer = d.visitor_question_answer || { answer: "", notes: "" };
  d.next_steps_summary = d.next_steps_summary || {
    top_priorities: [],
    timeline: { next_7_days: "", next_30_days: "", next_90_days: "" },
  };

  return d;
}

async function runDermatologyEngine({
  client,
  photoDataUrl,
  firstName,
  email,
  ageRange,
  primaryConcern,
  visitorQuestion,
  analysisContext,
  imageAnalysis,
}) {
  // Uses a vision-capable model because it must evaluate the selfie visually.
  // Pick best available via env; otherwise a sensible default.
  const dermModel =
    process.env.OPENAI_DERM_ENGINE_MODEL ||
    process.env.OPENAI_VISION_MODEL ||
    process.env.OPENAI_TEXT_MODEL ||
    "gpt-4o-mini";

  const userText = buildDermEngineUserPrompt({
    firstName,
    email,
    ageRange,
    primaryConcern,
    visitorQuestion,
    analysisContext,
    imageAnalysis,
  });

  try {
    const resp = await client.chat.completions.create({
      model: dermModel,
      temperature: 0.15,
      max_tokens: 1700,
      messages: [
        { role: "system", content: DERM_ENGINE_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: photoDataUrl } },
          ],
        },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(text);

    if (!parsed) return { ok: false, parse_error: true, raw: text };

    return { ok: true, data: normalizeDermEngineKeys(parsed) };
  } catch (err) {
    console.error("Dermatology Engine error:", err);
    return { ok: false, error: true, message: err?.message || "Dermatology Engine failed" };
  }
}

// -------------------------
// In-memory "once every 30 days" limiter
// NOTE: This will reset on cold starts/redeploys.
// For true enforcement, move to Redis/KV/DB.
// -------------------------
const ANALYSIS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getCooldownStore() {
  if (!globalThis.__LAZUK_REPORT_COOLDOWN_STORE__) {
    globalThis.__LAZUK_REPORT_COOLDOWN_STORE__ = new Map(); // Map<email, lastTimestamp>
  }
  return globalThis.__LAZUK_REPORT_COOLDOWN_STORE__;
}

function checkCooldownOrThrow(email) {
  const store = getCooldownStore();
  const now = Date.now();
  const last = store.get(email);
  if (last && now - last < ANALYSIS_COOLDOWN_MS) {
    const remainingMs = ANALYSIS_COOLDOWN_MS - (now - last);
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    const err = new Error(
      `You can request a new detailed skin analysis once every 30 days. Please try again in about ${remainingDays} day(s).`
    );
    err.code = "cooldown_active";
    err.status = 429;
    throw err;
  }
  store.set(email, now);
}

// -------------------------
// UI helper: Fitzpatrick line (INTERNAL USE ONLY)
// -------------------------
function renderFitzpatrickScaleHtml(type) {
  if (!type) return "";
  const types = ["I", "II", "III", "IV", "V", "VI"];
  const normalized = String(type).toUpperCase();
  const line = types.map((t) => (t === normalized ? `<strong>${t}</strong>` : t)).join(" · ");
  return `<p style="font-size: 12px; color: #92400E; margin-top: 6px;">
    Cosmetic Fitzpatrick scale: ${line}
  </p>`;
}

// -------------------------
// Email (Resend)
// -------------------------
async function sendEmailWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Dr. Lazuk Esthetics <no-reply@drlazuk.com>";

  if (!apiKey) {
    console.error("RESEND_API_KEY is not set; skipping email send.");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend email error:", res.status, body);
    }
  } catch (err) {
    console.error("Resend email exception:", err);
  }
}

// -------------------------
// Helpers: HTML safety
// -------------------------
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Render plaintext letter into HTML preserving line breaks
function textToHtmlParagraphs(text) {
  const safe = escapeHtml(text || "");
  const parts = safe.split(/\n\s*\n/g);
  return parts
    .map(
      (p) =>
        `<p style="margin: 0 0 12px 0; font-size: 13px; color: #111827; white-space: pre-wrap;">${p}</p>`
    )
    .join("");
}

// Insert aging preview block "near the end" — just above Dr. Lazuk’s closing lines.
function splitForAgingPlacement(reportText) {
  const t = String(reportText || "").trim();
  if (!t) return { before: "", closing: "" };

  const needle = "May your skin always glow as bright as your smile.";
  const idx = t.lastIndexOf(needle);

  if (idx === -1) return { before: t, closing: "" };

  const before = t.slice(0, idx).trimEnd();
  const closing = t.slice(idx).trimStart();
  return { before, closing };
}

// -------------------------
// LOW-LOE V2 VISUAL SIGNALS — helpers
// -------------------------
function clamp01(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function label01(s) {
  const x = clamp01(s);
  if (x >= 0.75) return "high";
  if (x >= 0.45) return "moderate";
  if (x >= 0.2) return "low";
  return "minimal";
}

function normalizeConfidence01(n) {
  const x = clamp01(typeof n === "number" ? n : 0.6);
  // never “force” certainty; keep it conservative
  return x;
}

function safeArray(a, limit = 4) {
  return Array.isArray(a) ? a.filter(Boolean).slice(0, limit) : [];
}

function safeString(s, max = 220) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

// -------------------------
// NEW: Capture Quality Gate (server-side)
// - Reject partial/side/poor selfies early (before cooldown is consumed)
// - Fail-open on parser errors (to avoid blocking if model returns unexpected text)
// -------------------------
async function evaluateCaptureQuality({ client, photoDataUrl }) {
  if (!photoDataUrl) return { ok: false, isUsable: false, confidence: 0, reasons: ["Missing photo."], requirementsForRetry: [] };

  const model =
    process.env.OPENAI_CAPTURE_QUALITY_MODEL ||
    process.env.OPENAI_VISION_MODEL ||
    "gpt-4o-mini";

  const prompt = `
Return STRICT JSON ONLY. No markdown.

You are evaluating whether a selfie is usable for a cosmetic VISUAL skin assessment.

Reject if:
- Face is not clearly visible
- Face is not mostly frontal (strong profile / side angle)
- Large occlusions (hand/phone/hat shadows), heavy glare, or extreme shadows
- Only part of the face is shown (cropped forehead/chin/cheeks)
- Too dark, too blurry, or strongly overexposed
- Face too far away (low detail)

Glasses are acceptable; glare may reduce quality.

Scores 0..1.

Return EXACT schema:
{
  "isUsable": true|false,
  "confidence": number,
  "reasons": ["string"],
  "requirementsForRetry": ["string"]
}
`.trim();

  try {
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 350,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: photoDataUrl } },
          ],
        },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(text);

    if (!parsed) {
      return {
        ok: false,
        isUsable: true, // fail-open
        confidence: 0.35,
        reasons: ["Capture quality check could not be parsed; proceeding conservatively."],
        requirementsForRetry: [],
      };
    }

    parsed.confidence = clamp01(typeof parsed.confidence === "number" ? parsed.confidence : 0.6);
    if (!Array.isArray(parsed.reasons)) parsed.reasons = [];
    if (!Array.isArray(parsed.requirementsForRetry)) parsed.requirementsForRetry = [];

    return { ok: true, ...parsed };
  } catch (err) {
    console.error("Capture quality evaluation error:", err);
    return {
      ok: false,
      isUsable: true, // fail-open
      confidence: 0.35,
      reasons: ["Capture quality evaluation failed; proceeding conservatively."],
      requirementsForRetry: [],
    };
  }
}

// -------------------------
// LOW-LOE V2 VISUAL SIGNALS — extraction (vision JSON)
// -------------------------
async function extractVisualSignalsV2({ client, photoDataUrl, firstName, ageRange, primaryConcern }) {
  if (!photoDataUrl) return null;

  const visionModel =
    process.env.OPENAI_V2_SIGNALS_MODEL ||
    process.env.OPENAI_VISION_MODEL ||
    process.env.OPENAI_DERM_ENGINE_MODEL ||
    "gpt-4o-mini";

  const prompt = `
You are assisting a board-certified dermatologist in a non-diagnostic, educational VISUAL skin assessment from ONE selfie.
Return STRICT JSON ONLY. No markdown. No extra text.

Core rules:
- Observation-only; no diagnosis; do not name medical diseases (no rosacea, melasma, eczema, etc).
- If uncertain due to angle/lighting/blur, mark "uncertain" and reduce confidence.
- Scores MUST be 0..1.

Return EXACT JSON schema:

{
  "asymmetry": {
    "overall": number,
    "wrinkles": number,
    "pigment": number,
    "redness": number,
    "sagging": number,
    "notes": string[]
  },
  "oilHydrationMismatch": {
    "pattern": "balanced"|"oily_dehydrated"|"dry_dehydrated"|"oily_balanced"|"uncertain",
    "score": number,
    "zones": string[],
    "notes": string[]
  },
  "pigmentPattern": {
    "type": "focal"|"diffuse"|"mixed"|"uncertain",
    "score": number,
    "commonZones": string[],
    "notes": string[]
  },
  "barrierStressHotspots": {
    "score": number,
    "zones": string[],
    "overlapSignals": string[],
    "notes": string[]
  },
  "lipsPerioral": {
    "drynessScore": number,
    "perioralLinesScore": number,
    "borderDefinitionScore": number,
    "notes": string[]
  },
  "periorbital": {
    "shadowScore": number,
    "fineLinesScore": number,
    "puffinessScore": number,
    "notes": string[]
  },
  "neckFaceRatio": {
    "type": "neck_less_aged"|"similar"|"neck_more_aged"|"uncertain",
    "confidence": number,
    "notes": string[]
  },
  "microWrinkles": {
    "densityScore": number,
    "orientation": "horizontal"|"vertical"|"mixed"|"uncertain",
    "zones": string[],
    "notes": string[]
  },
  "poresByZone": {
    "overallScore": number,
    "zones": { "tzone": number, "cheeks": number, "nose": number, "forehead": number },
    "notes": string[]
  },
  "glowReflectance": {
    "score": number,
    "uniformityScore": number,
    "notes": string[]
  },
  "globalConfidence": number,
  "limitations": string[]
}

Context (use gently; do not invent details):
- firstName: ${firstName || "unknown"}
- ageRange: ${ageRange || "unknown"}
- primaryConcern: ${primaryConcern || "unknown"}
`.trim();

  try {
    const resp = await client.chat.completions.create({
      model: visionModel,
      temperature: 0.18,
      max_tokens: 1100,
      messages: [
        { role: "system", content: "Return STRICT JSON only." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: photoDataUrl } },
          ],
        },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(text);
    if (!parsed) {
      return {
        globalConfidence: 0.35,
        limitations: ["Secondary visual signal extraction could not be parsed reliably."],
      };
    }

    // Light normalization to prevent UI/letter crashes
    parsed.globalConfidence = normalizeConfidence01(parsed.globalConfidence);
    parsed.limitations = safeArray(parsed.limitations, 5);

    // Clamp obvious score fields if present
    const clampField = (obj, key) => {
      if (!obj || typeof obj !== "object") return;
      if (typeof obj[key] === "number") obj[key] = clamp01(obj[key]);
    };

    clampField(parsed, "globalConfidence");
    clampField(parsed.asymmetry, "overall");
    clampField(parsed.asymmetry, "wrinkles");
    clampField(parsed.asymmetry, "pigment");
    clampField(parsed.asymmetry, "redness");
    clampField(parsed.asymmetry, "sagging");

    clampField(parsed.oilHydrationMismatch, "score");
    clampField(parsed.pigmentPattern, "score");
    clampField(parsed.barrierStressHotspots, "score");

    clampField(parsed.lipsPerioral, "drynessScore");
    clampField(parsed.lipsPerioral, "perioralLinesScore");
    clampField(parsed.lipsPerioral, "borderDefinitionScore");

    clampField(parsed.periorbital, "shadowScore");
    clampField(parsed.periorbital, "fineLinesScore");
    clampField(parsed.periorbital, "puffinessScore");

    clampField(parsed.neckFaceRatio, "confidence");

    clampField(parsed.microWrinkles, "densityScore");

    clampField(parsed.poresByZone, "overallScore");
    if (parsed.poresByZone && parsed.poresByZone.zones) {
      clampField(parsed.poresByZone.zones, "tzone");
      clampField(parsed.poresByZone.zones, "cheeks");
      clampField(parsed.poresByZone.zones, "nose");
      clampField(parsed.poresByZone.zones, "forehead");
    }

    clampField(parsed.glowReflectance, "score");
    clampField(parsed.glowReflectance, "uniformityScore");

    // Normalize arrays
    if (parsed.asymmetry) parsed.asymmetry.notes = safeArray(parsed.asymmetry.notes, 5);
    if (parsed.oilHydrationMismatch) parsed.oilHydrationMismatch.notes = safeArray(parsed.oilHydrationMismatch.notes, 4);
    if (parsed.pigmentPattern) parsed.pigmentPattern.notes = safeArray(parsed.pigmentPattern.notes, 4);
    if (parsed.barrierStressHotspots) parsed.barrierStressHotspots.notes = safeArray(parsed.barrierStressHotspots.notes, 4);
    if (parsed.lipsPerioral) parsed.lipsPerioral.notes = safeArray(parsed.lipsPerioral.notes, 4);
    if (parsed.periorbital) parsed.periorbital.notes = safeArray(parsed.periorbital.notes, 4);
    if (parsed.neckFaceRatio) parsed.neckFaceRatio.notes = safeArray(parsed.neckFaceRatio.notes, 3);
    if (parsed.microWrinkles) parsed.microWrinkles.notes = safeArray(parsed.microWrinkles.notes, 3);
    if (parsed.poresByZone) parsed.poresByZone.notes = safeArray(parsed.poresByZone.notes, 4);
    if (parsed.glowReflectance) parsed.glowReflectance.notes = safeArray(parsed.glowReflectance.notes, 3);

    // Normalize zone arrays if any
    if (parsed.oilHydrationMismatch) parsed.oilHydrationMismatch.zones = safeArray(parsed.oilHydrationMismatch.zones, 4);
    if (parsed.pigmentPattern) parsed.pigmentPattern.commonZones = safeArray(parsed.pigmentPattern.commonZones, 4);
    if (parsed.barrierStressHotspots) {
      parsed.barrierStressHotspots.zones = safeArray(parsed.barrierStressHotspots.zones, 4);
      parsed.barrierStressHotspots.overlapSignals = safeArray(parsed.barrierStressHotspots.overlapSignals, 4);
    }
    if (parsed.microWrinkles) parsed.microWrinkles.zones = safeArray(parsed.microWrinkles.zones, 4);

    return parsed;
  } catch (err) {
    console.error("Visual Signals V2 extraction error:", err);
    return {
      globalConfidence: 0.35,
      limitations: ["Secondary visual signal extraction failed."],
    };
  }
}

// -------------------------
// LOW-LOE V2 VISUAL SIGNALS — letter insert (NO TITLES)
// -------------------------
function buildVisualSignalsV2LetterInsert(v2) {
  if (!v2 || typeof v2 !== "object") return "";

  const conf = normalizeConfidence01(v2.globalConfidence);
  const lims = safeArray(v2.limitations, 3);

  const asym = v2.asymmetry || {};
  const oil = v2.oilHydrationMismatch || {};
  const pigment = v2.pigmentPattern || {};
  const barrier = v2.barrierStressHotspots || {};
  const lips = v2.lipsPerioral || {};
  const eye = v2.periorbital || {};
  const micro = v2.microWrinkles || {};
  const pores = v2.poresByZone || {};
  const glow = v2.glowReflectance || {};

  const paragraphs = [];

  // Confidence qualifier paragraph (only if lower confidence)
  if (conf < 0.45) {
    paragraphs.push(
      `A quick note on nuance: your photo still allowed a meaningful cosmetic assessment, but some fine-grain signals are less reliable today (angle, lighting, or sharpness can affect micro-detail). I’m weighting the more delicate observations conservatively.`
    );
  }

  // Precision paragraph 1: asymmetry + oil/hydration + glow
  const asymLevel = typeof asym.overall === "number" ? label01(asym.overall) : null;
  const asymNotes = safeArray(asym.notes, 2).join(" ");
  const oilPattern =
    oil.pattern && oil.pattern !== "uncertain" ? oil.pattern.replaceAll("_", " ") : null;
  const oilZones = safeArray(oil.zones, 3);
  const glowLevel = typeof glow.score === "number" ? label01(glow.score) : null;

  const p1Parts = [];

  if (asymLevel) {
    p1Parts.push(
      `On left-to-right balance, I see a ${asymLevel} degree of asymmetry in the surface story (this is normal in real faces, and it can be informative).`
    );
    if (asymNotes) p1Parts.push(asymNotes);
  }

  if (oilPattern) {
    const z = oilZones.length ? `—most noticeable through the ${oilZones.join(", ")}` : "";
    p1Parts.push(
      `Your oil-to-hydration pattern reads as ${oilPattern}${z}. This is one of the most common reasons skin can feel both “shiny” and “tight” at the same time.`
    );
  }

  if (glowLevel) {
    p1Parts.push(
      `From an optical standpoint, your glow/reflectance reads as ${glowLevel}. In practice, glow improves most reliably when the barrier is stable, irritation is low, and hydration is consistent.`
    );
  }

  if (p1Parts.length) paragraphs.push(p1Parts.join(" "));

  // Precision paragraph 2: pigment + barrier hotspots + pores/micro-wrinkles + eye/lip cues
  const pigmentType =
    pigment.type && pigment.type !== "uncertain" ? pigment.type : null;
  const pigmentZones = safeArray(pigment.commonZones, 3);

  const barrierLevel = typeof barrier.score === "number" ? label01(barrier.score) : null;
  const barrierZones = safeArray(barrier.zones, 3);

  const microLevel = typeof micro.densityScore === "number" ? label01(micro.densityScore) : null;
  const microOrientation =
    micro.orientation && micro.orientation !== "uncertain" ? micro.orientation : null;

  const poresLevel = typeof pores.overallScore === "number" ? label01(pores.overallScore) : null;

  const p2Parts = [];

  if (pigmentType) {
    const z = pigmentZones.length ? ` (tending to show through ${pigmentZones.join(", ")})` : "";
    p2Parts.push(
      `Your tone distribution appears ${pigmentType}${z}. This distinction matters because “spot-correction” and “barrier-first brightening” are not the same strategy.`
    );
  }

  if (barrierLevel) {
    const z = barrierZones.length ? `—especially around ${barrierZones.join(", ")}` : "";
    p2Parts.push(
      `I also see ${barrierLevel} barrier-stress hotspots where texture and redness overlap${z}. When this is present, aggressive actives tend to backfire, and calm consistency tends to win.`
    );
  }

  if (poresLevel) {
    p2Parts.push(
      `Pores and texture are not uniform across the face; overall pore visibility reads as ${poresLevel}, which usually means targeted zone-care will outperform blanket “one-step-for-everything” routines.`
    );
  }

  if (microLevel || microOrientation) {
    const o = microOrientation ? ` with a ${microOrientation} orientation bias` : "";
    p2Parts.push(
      `At a micro level, fine-line activity reads as ${microLevel || "present"}${o}. These patterns typically soften when hydration holds better and daily protection becomes non-negotiable.`
    );
  }

  if (typeof eye.shadowScore === "number" || typeof eye.fineLinesScore === "number") {
    p2Parts.push(
      `Around the eyes, there are visible cues of shadowing and/or fine-line activity—this zone is highly sensitive to sleep quality, hydration, and UV exposure, so we treat it gently and consistently.`
    );
  }

  if (typeof lips.drynessScore === "number" || typeof lips.perioralLinesScore === "number") {
    p2Parts.push(
      `And around the lips, I see mild signals consistent with dryness and early line patterning—this area responds best to steady hydration support rather than intensity.`
    );
  }

  if (p2Parts.length) paragraphs.push(p2Parts.join(" "));

  // Limitations (short)
  if (lims.length) {
    paragraphs.push(`Limits of today’s photo: ${lims.join(" ")}`);
  }

  // Convert to block (blank lines between paragraphs)
  return paragraphs.map((p) => safeString(p, 700)).filter(Boolean).join("\n\n");
}

// -------------------------
// LOCKED: Areas of Focus (EMAIL + UI DATA)
// - Dynamic: 0–7 items based on analysis triggers (NOT static)
// - Naming convention locked:
//    The Compounding Risk
//    Do This Now
// - This is course correction (not reassurance)
// -------------------------

// ✅ FIX: extract VALUE text only (do NOT include keys/headings)
function extractTextValues(input) {
  const out = [];
  const seen = new Set();

  function walk(v) {
    if (v == null) return;

    if (typeof v === "object") {
      if (seen.has(v)) return;
      seen.add(v);
    }

    if (typeof v === "string") {
      out.push(v);
      return;
    }

    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }

    if (typeof v === "object") {
      for (const k of Object.keys(v)) {
        walk(v[k]); // IMPORTANT: values only
      }
      return;
    }
  }

  walk(input);
  return out.join(" ").toLowerCase();
}

function normalizeToTextBlob(...parts) {
  try {
    return parts.map((p) => extractTextValues(p)).join(" ").toLowerCase();
  } catch {
    return "";
  }
}

function includesAny(blob, keywords) {
  if (!blob) return false;
  return keywords.some((k) => blob.includes(k));
}

function buildBehaviorAnchors(visitorQuestion) {
  const v = String(visitorQuestion || "").toLowerCase();

  const anchors = {
    overExfoliation: includesAny(v, [
      "exfoliat",
      "scrub",
      "peel",
      "aha",
      "bha",
      "acid",
      "glycol",
      "lactic",
      "salicylic",
      "acid",
    ]),
    retinoidHeavy: includesAny(v, ["retinol", "retinoid", "tret", "adapalene"]),
    noSpf: includesAny(v, ["no spf", "dont use spf", "don't use spf", "skip spf", "not wearing sunscreen"]),
    sunExposure: includesAny(v, ["tanning", "tan", "sunbed", "sun bed", "sun exposure", "outside all day", "beach"]),
    harshCleansers: includesAny(v, ["foaming", "stripping", "squeaky clean", "alcohol toner", "astringent"]),
    picking: includesAny(v, ["pick", "picking", "squeeze", "popping"]),
    heavyOcclusives: includesAny(v, ["vaseline", "petrolatum", "heavy cream", "thick cream", "coconut oil"]),
  };

  return anchors;
}

// Build per-category copy using the locked micro-structure.
// IMPORTANT: We do not claim the user does a behavior unless they explicitly shared it.
// We can say "commonly reinforced by..." as directional, physician-style guidance.
function buildAreaCopy({ title, kind, anchors }) {
  // common helper strings for decisive time horizons
  const t = {
    weeks: "within the next 6–8 weeks",
    month: "over the next 30 days",
    months: "over the next 3–6 months",
    long: "over the next 6–12 months",
  };

  if (kind === "barrier") {
    const reinforced =
      anchors.overExfoliation || anchors.retinoidHeavy || anchors.harshCleansers
        ? "This pattern is being reinforced by barrier-stressing steps in your current routine (exfoliation/acids/retinoids or stripping cleansers)."
        : "This pattern is commonly reinforced by frequent exfoliation, high-percentage acids, nightly retinoid use, or stripping cleansers.";

    return {
      title,
      compoundingRisk:
        `Your photo suggests early barrier instability — the kind that can look “fine” on the surface while the skin underneath behaves unpredictably. ` +
        `${reinforced} ` +
        `When the barrier stays stressed, hydration stops holding, sensitivity escalates, and the same products that should help begin to backfire — ${t.weeks} it often becomes harder to stabilize.`,
      doThisNow:
        `Pause aggressive actives immediately (high-percentage acids, scrubs, and frequent retinoid use). ` +
        `Run a barrier-first routine for 3–4 weeks: gentle cleanse, moisturize, and daily mineral SPF. ` +
        `Only reintroduce corrective actives after your routine feels consistently calm — no stinging, tightness, or flare-ups.`,
    };
  }

  if (kind === "sebum") {
    const reinforced =
      anchors.harshCleansers || anchors.picking || anchors.heavyOcclusives
        ? "This is often made worse by harsh cleansing, picking, or heavy occlusive layers that trap congestion."
        : "This is commonly reinforced by over-cleansing, inconsistent exfoliation, picking, or heavy occlusives that trap congestion.";

    return {
      title,
      compoundingRisk:
        `Your photo suggests a congestion pattern that can run quietly: clog → inflammation → lingering mark. ` +
        `${reinforced} ` +
        `If the cycle stays active, clarity becomes hard to maintain and texture feels unpredictable — ${t.month} it often takes longer to calm the skin once this loop is entrenched.`,
      doThisNow:
        `Control oil without stripping. Choose a gentle cleanser, avoid “squeaky clean” routines, and stop picking. ` +
        `Use one steady unclogging step at a conservative pace (low-frequency BHA or retinoid — not both at once), and don’t escalate until congestion visibly calms.`,
    };
  }

  if (kind === "pigment") {
    const reinforced =
      anchors.noSpf || anchors.sunExposure
        ? "Based on what you shared, inconsistent UV protection is actively locking this in."
        : "This is commonly reinforced by inconsistent UV protection and overly aggressive brightening steps.";

    return {
      title,
      compoundingRisk:
        `Your photo suggests tone variability that is trending from “fluid” to “fixed.” ` +
        `${reinforced} ` +
        `When pigment settles deeper, what could shift in weeks becomes a months-long project — ${t.months} the same unevenness becomes more stubborn and less responsive.`,
      doThisNow:
        `Make daily broad-spectrum SPF non-negotiable. ` +
        `Choose one gentle brightening support and commit to consistency for 12 weeks before judging progress. ` +
        `Avoid stacking multiple actives — pigment responds best to steady pressure, not intensity.`,
    };
  }

  if (kind === "recovery") {
    const reinforced =
      anchors.overExfoliation || anchors.retinoidHeavy
        ? "Your routine appears to be keeping the skin in a low-grade stressed state instead of letting it recover."
        : "This is commonly reinforced by too many actives too often, inconsistent hydration, and insufficient recovery days.";

    return {
      title,
      compoundingRisk:
        `Your photo suggests recovery is running slower than it should — meaning irritation, redness, texture irregularity, or marks can linger. ` +
        `${reinforced} ` +
        `When recovery runs slow, skin spends more time in “stressed mode” than “repair mode,” and progress becomes unpredictable — ${t.weeks} it can feel like products stop working.`,
      doThisNow:
        `Switch to a recovery-forward routine immediately: simplify, hydrate, and protect. ` +
        `Build “calm nights” into your week where you use only gentle cleansing + moisturization. ` +
        `Only add treatment steps after your skin can reset overnight without lingering tightness or redness.`,
    };
  }

  if (kind === "environment") {
    const reinforced =
      anchors.noSpf || anchors.sunExposure
        ? "Your UV exposure/protection pattern is compounding this quietly."
        : "This is commonly reinforced by inconsistent SPF and low daily antioxidant support.";

    return {
      title,
      compoundingRisk:
        `Environmental exposure is cumulative and invisible — until it isn’t. ` +
        `${reinforced} ` +
        `Without intervention, UV and pollution “tax” the skin’s resources and accelerate dullness, uneven tone, and sensitivity — ${t.long} the breakdown can appear faster than natural aging.`,
      doThisNow:
        `Treat protection as your foundation: daily SPF, every day, even when you’re indoors. ` +
        `Add a daily antioxidant support step and keep hydration consistent — this is your insurance policy against premature compounding damage.`,
    };
  }

  if (kind === "structural") {
    const reinforced =
      anchors.overExfoliation || anchors.retinoidHeavy
        ? "Chronic irritation and dehydration from an overactive routine can make lines look more persistent."
        : "This is commonly reinforced by dehydration, chronic inflammation, and inconsistent protection.";

    return {
      title,
      compoundingRisk:
        `Your photo suggests early structural resilience is being under-supported — the “bounce-back” looks less consistent under stress. ` +
        `${reinforced} ` +
        `When this continues, dehydration-based lines become more persistent and the skin’s ability to recover weakens — ${t.long} temporary patterns can settle into more fixed ones.`,
      doThisNow:
        `Prioritize hydration and protection first (humectant + moisturizer + daily SPF). ` +
        `Once your barrier is stable, add measured support (peptides/retinoid) slowly — progress here comes from consistency, not aggression.`,
    };
  }

  // texture / pores
  const reinforced =
    anchors.overExfoliation || anchors.harshCleansers
      ? "Over-exfoliation or stripping routines can make this worse by inflaming and dehydrating the surface."
      : "This is commonly reinforced by dehydration, low-grade inflammation, and over-exfoliation.";

  return {
    title,
    compoundingRisk:
      `Your photo suggests texture irregularity and pore visibility that are being amplified by surface instability. ` +
      `${reinforced} ` +
      `If you keep trying to “scrub it smooth,” pores often look larger and texture rougher — ${t.weeks} it becomes harder to refine once inflammation and dehydration are locked in.`,
    doThisNow:
      `Stop aggressive exfoliation and stabilize the surface. ` +
      `Hydrate consistently, keep irritation low, and refine gradually with measured turnover — texture typically improves downstream once the barrier calms.`,
  };
}

// ✅ FIX: require risk/problem language (prevents “always 7”)
const NEGATIVE_TERMS = ["no concern", "not present", "absent", "normal", "stable", "balanced", "minimal", "none"];
const RISK_TERMS = [
  "compromis",
  "weaken",
  "fragile",
  "irritat",
  "reactiv",
  "sensitiv",
  "inflam",
  "redness",
  "tight",
  "stinging",
  "burning",
  "congest",
  "clog",
  "comed",
  "blackhead",
  "whitehead",
  "breakout",
  "oily",
  "excess sebum",
  "uneven",
  "discolor",
  "dark spot",
  "hyperpig",
  "dull",
  "rough",
  "bumpy",
  "enlarged pores",
  "visible pores",
  "fine line",
  "wrinkle",
  "photoaging",
  "loss of elasticity",
  "sag",
  "puff",
  "swelling",
];

function hasRiskLanguage(text, required = 1) {
  const t = String(text || "").toLowerCase();
  const riskHits = RISK_TERMS.filter((w) => t.includes(w)).length;
  const negHits = NEGATIVE_TERMS.filter((w) => t.includes(w)).length;

  // If it explicitly says “normal/none/minimal”, do NOT trigger from that snippet alone
  if (negHits > 0 && riskHits <= 1) return false;

  return riskHits >= required;
}

function detectAreasTriggered({ analysisContext, imageAnalysis, visitorQuestion }) {
  // VALUE text only
  const blob = normalizeToTextBlob(analysisContext, imageAnalysis);
  const ia = imageAnalysis || {};
  const vision = ia.analysis || {};
  const checklist15 = vision.checklist15 || {};
  const skinType = (ia.skinType || "").toLowerCase();

  const primary = normalizeToTextBlob({
    primaryConcern: (analysisContext && analysisContext.form && analysisContext.form.primaryConcerns) || [],
  });

  const anchors = buildBehaviorAnchors(visitorQuestion);

  // Pull specific checklist value strings (values, not keys)
  const barrierTxt = checklist15["8_barrierHealth"] || "";
  const inflamTxt = checklist15["7_inflammatoryClues"] || "";
  const pigmentTxt = checklist15["3_pigmentationColor"] || "";
  const poresTxt = checklist15["5_acneCongestion"] || "";
  const textureTxt = checklist15["2_textureSurfaceQuality"] || "";
  const agingTxt = checklist15["6_agingPhotoaging"] || "";
  const lifestyleTxt = checklist15["12_lifestyleIndicators"] || "";

  const barrier =
    hasRiskLanguage(barrierTxt, 1) ||
    includesAny(blob, ["stinging", "burning", "tightness"]) ||
    (includesAny(blob, ["barrier"]) && hasRiskLanguage(blob, 2));

  const sebum =
    skinType === "oily" ||
    hasRiskLanguage(poresTxt, 1) ||
    includesAny(blob, ["blackhead", "whitehead", "breakout", "clog", "congestion"]) ||
    (includesAny(primary, ["acne", "breakout", "oily", "blackhead", "pores"]) && hasRiskLanguage(blob, 1));

  const pigment =
    hasRiskLanguage(pigmentTxt, 1) ||
    includesAny(blob, ["dark spot", "uneven tone", "discolor"]) ||
    (includesAny(primary, ["pigment", "dark spots", "uneven tone", "hyperpig"]) && hasRiskLanguage(blob, 1));

  const texturePores =
    hasRiskLanguage(textureTxt, 1) ||
    (includesAny(blob, ["pores"]) && hasRiskLanguage(blob, 2)) ||
    (includesAny(blob, ["texture", "rough", "bumpy"]) && hasRiskLanguage(blob, 2));

  const structural =
    hasRiskLanguage(agingTxt, 1) ||
    (includesAny(blob, ["wrinkle", "fine line", "photoaging", "elasticity", "sag"]) && hasRiskLanguage(blob, 2)) ||
    (includesAny(primary, ["wrinkle", "fine lines", "aging"]) && hasRiskLanguage(blob, 1));

  const recovery =
    hasRiskLanguage(inflamTxt, 1) ||
    (includesAny(blob, ["redness", "inflammation", "irritation", "lingering"]) && hasRiskLanguage(blob, 2)) ||
    (includesAny(lifestyleTxt, ["stress", "fatigue"]) && hasRiskLanguage(blob, 1));

  const environment =
    (includesAny(blob, ["uv", "sun", "pollution", "environment"]) && hasRiskLanguage(blob, 1)) ||
    ((anchors.noSpf || anchors.sunExposure) && includesAny(blob, ["uv", "sun", "sunscreen", "spf"]));

  return {
    anchors,
    flags: {
      barrier,
      sebum,
      pigment,
      recovery,
      environment,
      structural,
      texturePores,
    },
  };
}

// Dynamic builder: returns 0–7 items, ordered by impact / operations
function buildAreasOfFocusItems({ analysisContext, imageAnalysis, visitorQuestion }) {
  const { anchors, flags } = detectAreasTriggered({ analysisContext, imageAnalysis, visitorQuestion });

  const ordered = [
    { key: "barrier_stability", kind: "barrier", title: "Barrier Stability" },
    { key: "sebum_congestion", kind: "sebum", title: "Sebum & Congestion" },
    { key: "pigment_regulation", kind: "pigment", title: "Pigment & Tone" },
    { key: "recovery_repair", kind: "recovery", title: "Recovery & Repair" },
    { key: "environmental_stress", kind: "environment", title: "Environmental Stress Load" },
    { key: "structural_support", kind: "structural", title: "Structural Resilience" },
    { key: "texture_pores", kind: "texture", title: "Texture & Pores" },
  ];

  const include = (kind) => {
    if (kind === "barrier") return !!flags.barrier;
    if (kind === "sebum") return !!flags.sebum;
    if (kind === "pigment") return !!flags.pigment;
    if (kind === "recovery") return !!flags.recovery;
    if (kind === "environment") return !!flags.environment;
    if (kind === "structural") return !!flags.structural;
    if (kind === "texture") return !!flags.texturePores;
    return false;
  };

  const out = [];
  for (const item of ordered) {
    if (!include(item.kind)) continue;

    const copy = buildAreaCopy({ title: item.title, kind: item.kind, anchors });
    out.push({
      key: item.key,
      title: copy.title,
      compoundingRisk: copy.compoundingRisk,
      doThisNow: copy.doThisNow,
    });
  }

  return out; // 0–7 items
}

function buildAreasOfFocusSectionHtml({ analysisContext, imageAnalysis, visitorQuestion }) {
  const items = buildAreasOfFocusItems({ analysisContext, imageAnalysis, visitorQuestion });
  if (!items || items.length === 0) return ""; // dynamic: can be none

  const itemHtml = items
    .map((it, idx) => {
      const topBorder = idx === 0 ? "" : `border-top: 1px solid #E5E7EB;`;
      return `
        <div style="padding: 12px 0; ${topBorder}">
          <div style="font-size: 13px; font-weight: 800; color: #111827; margin: 0 0 6px 0;">
            ${escapeHtml(it.title)}
          </div>

          <div style="font-size: 12px; color: #111827; line-height: 1.55; margin: 6px 0 0 0;">
            <strong>The Compounding Risk:</strong> ${escapeHtml(it.compoundingRisk)}
          </div>

          <div style="font-size: 12px; color: #111827; line-height: 1.55; margin: 8px 0 0 0;">
            <strong>Do This Now:</strong> ${escapeHtml(it.doThisNow)}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div style="margin: 16px 0 18px 0; padding: 14px 16px; border-radius: 10px; border: 1px solid #111827; background-color: #FFFFFF;">
      <div style="font-size: 14px; font-weight: 900; color: #111827; margin: 0 0 6px 0;">
        Areas of Focus
      </div>

      <div style="font-size: 12px; color: #111827; margin: 0 0 10px 0;">
        This is not reassurance. It’s course correction — based on the patterns visible in your photo and what you shared.
      </div>

      <div>
        ${itemHtml}
      </div>
    </div>
  `;
}

function buildAreasOfFocusText({ analysisContext, imageAnalysis, visitorQuestion }) {
  const items = buildAreasOfFocusItems({ analysisContext, imageAnalysis, visitorQuestion });
  if (!items || items.length === 0) return "";

  const header =
    `Areas of Focus\n` +
    `This is not reassurance. It’s course correction — based on the patterns visible in your photo and what you shared.\n`;

  const body = items
    .map(
      (it) =>
        `\n${it.title}\n` +
        `The Compounding Risk: ${it.compoundingRisk}\n` +
        `Do This Now: ${it.doThisNow}`
    )
    .join("\n");

  return (header + body).trim();
}

// NEW: Confidence-aware gate for Areas of Focus
function shouldAllowAreasOfFocus({ imageAnalysis, visualSignalsV2 }) {
  const v2c =
    typeof visualSignalsV2?.globalConfidence === "number" ? visualSignalsV2.globalConfidence : null;

  // If V2 reports low confidence, suppress course correction.
  if (v2c !== null && v2c < 0.45) return false;

  // If no V2, but imageAnalysis appears weak/missing, suppress.
  if (!imageAnalysis || isLikelyWeakImageAnalysis(imageAnalysis)) return false;

  return true;
}

// -------------------------
// NEW: Reflection Layer (EMAIL) — Locked Copy (NO TITLES)
// Must appear AFTER aging images in the email
// -------------------------
const EMAIL_REFLECTION_INTRO =
  "Take your time. This section is here so you can pause at your own readiness.";

const EMAIL_REFLECTION_PARAGRAPHS = [
  `If you’re feeling a little unsettled right now, that’s normal.

What you just saw can bring up many emotions—surprise, curiosity, concern, even resistance. Some people feel a quiet moment of reflection. Others feel a jolt they weren’t expecting. There is no right or wrong reaction here.

I want you to know something important:

What you are seeing is not a verdict.
It is not a prediction carved in stone.
And it is certainly not a judgment.

What you’re seeing is a visual story—one possible path based on today’s data, today’s habits, today’s environment. Nothing more, and nothing less.

As a physician, I’ve spent decades studying faces, skin, and the quiet signals the body gives long before change becomes obvious. I can tell you this with confidence: the future of your skin is not decided by time alone. It is shaped—slowly, consistently—by care, protection, and intention.

If there is one thing I want you to take from this moment, it’s this:

Your face is not aging “toward” something.
It is responding to how it is supported.

And support can always be adjusted.

You don’t need to act today.
You don’t need to decide anything right now.
You only need to understand that what you just saw represents possibility—not destiny.

When you’re ready, the way forward is not about chasing youth.
It’s about strengthening resilience.
Protecting what’s already beautiful.
And allowing your outer appearance to reflect the care you give yourself internally.

Until then, take a breath.
Let this information settle.`,

  `It’s a fair question—and an important one.

What you just saw represents one possible trajectory, not a fixed destination. Skin does not age in isolation, and it does not age uniformly. It responds—quietly and continuously—to how it is supported over time.

In clinical practice, the most meaningful differences we see are not created by extremes. They come from consistency: protecting the skin barrier, minimizing chronic inflammation, supporting hydration, and reducing cumulative environmental stress.

This is why two people of the same age can look remarkably different over time—not because one did “more,” but because their skin was supported differently.

There is no single correct path forward.
Some people focus on daily care.
Some choose professional treatments.
Some simply become more intentional and observant.

All of these approaches can influence direction.

What matters most is understanding this:

The future of your skin is responsive—not predetermined.

And responsiveness means you retain influence, at every stage.`,

  `That question matters—and you deserve a clear answer.

This experience was not created using a generic aging filter or a randomized model. Every image and insight was anchored to your own face, starting with the photo you provided.

Rather than replacing your features, the system analyzed them—your facial structure, proportions, texture patterns, tone distribution, and visible environmental stress signals. From there, it calculated how those same features tend to evolve over time under similar conditions.

The intention was never to create something dramatic.
It was to create something recognizable.

Technology alone does not decide how this information is presented.

As a physician, my role is to ensure that what you see is framed responsibly, explained clearly, and never used to provoke fear or urgency. This is why the results are delivered as interpretation—not diagnosis, not judgment, and not instruction.

This analysis exists to inform, not to persuade.`,

  `Skin does not change overnight—and neither does its direction.

In medicine, we learn the most not from a single snapshot, but from patterns over time. What stabilizes. What shifts. What responds to care. Your skin follows the same principle.

Revisiting this analysis periodically is not about watching for flaws or chasing perfection. It’s about understanding how your skin responds to the way you live, protect, and care for it.

Over time, subtle changes become clearer:
- whether hydration and texture are stabilizing
- whether environmental stress is quieting or accumulating
- whether your current level of support is sufficient

These shifts are often difficult to notice day to day, but meaningful over months.

By returning to this analysis when you feel ready, you’re not checking on your appearance—you’re observing your skin’s conversation with time.

There is no required schedule.
There is no expectation to act.

But for those who choose to revisit, this becomes a way to stay informed, grounded, and thoughtful—making decisions based on evidence rather than emotion.

A Final Thought

Skin health is not a single moment.
It’s a relationship—one that evolves with time, environment, and care.

This tool exists to support that relationship.
Nothing more.
Nothing less.

When you’re ready to listen again, it will be here.

With care,
Dr. Iryna Lazuk`,
];

function toEmailParagraphHtml(text) {
  const safe = escapeHtml(text);
  return safe
    .split(/\n\s*\n/g) // paragraph breaks
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0; line-height:1.55; font-size:14px; color:#111827;">${p.replace(
          /\n/g,
          "<br/>"
        )}</p>`
    )
    .join("");
}

function buildEmailReflectionSectionHtml() {
  return `
  <div style="margin-top:18px; padding-top:18px; border-top:1px solid #E5E7EB;">
    <p style="margin:0 0 12px 0; font-size:14px; color:#111827; line-height:1.55;">
      <strong>${escapeHtml(EMAIL_REFLECTION_INTRO)}</strong>
    </p>
    ${EMAIL_REFLECTION_PARAGRAPHS.map(toEmailParagraphHtml).join("")}
  </div>
  `;
}

// -------------------------
// Upload image to a public URL for EMAIL rendering
// -------------------------
function isDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:image/");
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

// Cloudinary uploader that accepts EITHER data URLs OR remote URLs
async function uploadToCloudinaryFile(fileStr) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  const form = new URLSearchParams();
  form.set("file", fileStr);

  const timestamp = Math.floor(Date.now() / 1000);
  form.set("timestamp", String(timestamp));
  form.set("folder", "drlazuk/visitor-selfies");

  const toSign = `folder=${form.get("folder")}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  form.set("api_key", apiKey);
  form.set("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const res = await fetch(endpoint, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    console.error("Cloudinary upload failed:", res.status, body);
    return null;
  }

  const json = await res.json().catch(() => null);
  return json?.secure_url || json?.url || null;
}

// Vercel Blob uploader that accepts data URLs OR remote URLs
async function uploadToVercelBlobAny(input) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const { put } = await import("@vercel/blob");

    // If input is data URL, decode it
    if (isDataUrl(input)) {
      const parsed = parseDataUrl(input);
      if (!parsed) return null;

      const buf = Buffer.from(parsed.b64, "base64");
      const ext = parsed.mime.includes("png")
        ? "png"
        : parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")
        ? "jpg"
        : "img";

      const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const out = await put(filename, buf, {
        access: "public",
        contentType: parsed.mime,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return out?.url || null;
    }

    // If input is remote URL, fetch it then upload
    if (typeof input === "string" && /^https?:\/\//i.test(input)) {
      const res = await fetch(input);
      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") || "image/png";
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);

      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "img";

      const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const out = await put(filename, buf, {
        access: "public",
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return out?.url || null;
    }

    return null;
  } catch (err) {
    console.error("Vercel Blob upload failed:", err);
    return null;
  }
}

async function ensureEmailSafeImageUrl(photoDataUrl) {
  if (!photoDataUrl) return null;

  // If already a URL (not a data URL), it's email-safe enough.
  if (typeof photoDataUrl === "string" && !isDataUrl(photoDataUrl)) return photoDataUrl;

  // If data URL, try to make it public.
  if (isDataUrl(photoDataUrl)) {
    const viaCloudinary = await uploadToCloudinaryFile(photoDataUrl);
    if (viaCloudinary) return viaCloudinary;

    const viaBlob = await uploadToVercelBlobAny(photoDataUrl);
    if (viaBlob) return viaBlob;

    console.warn("No image upload provider configured. Email clients may block data URLs.");
    return photoDataUrl;
  }

  return null;
}

// NEW: Normalize ANY image (OpenAI URL, other URL, or dataURL) to a stable public URL if possible
function looksEphemeralImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  // Heuristic: OpenAI image urls commonly expire; treat them as ephemeral.
  return (
    url.includes("oaidalleapiprod") ||
    url.includes("openai.com") ||
    url.includes("oaiusercontent") ||
    url.includes("gpt-image") ||
    url.includes("blob.core.windows.net")
  );
}

async function ensureStablePublicImageUrl(anyImage) {
  if (!anyImage) return null;

  // Already a non-data URL; stabilize if it looks ephemeral.
  if (typeof anyImage === "string" && !isDataUrl(anyImage)) {
    if (!looksEphemeralImageUrl(anyImage)) return anyImage;

    const viaCloudinary = await uploadToCloudinaryFile(anyImage);
    if (viaCloudinary) return viaCloudinary;

    const viaBlob = await uploadToVercelBlobAny(anyImage);
    if (viaBlob) return viaBlob;

    return anyImage;
  }

  // If data URL, upload
  if (isDataUrl(anyImage)) {
    const viaCloudinary = await uploadToCloudinaryFile(anyImage);
    if (viaCloudinary) return viaCloudinary;

    const viaBlob = await uploadToVercelBlobAny(anyImage);
    if (viaBlob) return viaBlob;

    return anyImage;
  }

  return null;
}

async function normalizeAgingPreviewImagesToPublicUrls(agingPreviewImages) {
  if (!agingPreviewImages) return agingPreviewImages;

  const keys = ["tile","noChange10", "noChange20", "withCare10", "withCare20"];
  const out = { ...agingPreviewImages };

  await Promise.all(
    keys.map(async (k) => {
      if (!out[k]) return;
      out[k] = await ensureStablePublicImageUrl(out[k]);
    })
  );

  return out;
}

// -------------------------
// 4 aging preview images (SELFIE-BASED via OpenAI Images Edits)
// -------------------------
async function generateAgingPreviewImages({ ageRange, primaryConcern, fitzpatrickType, photoDataUrl }) {
  if (!process.env.OPENAI_API_KEY) {
    return { tile: null, noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
  if (!photoDataUrl) {
    return { tile: null, noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }

  const fitzText = fitzpatrickType
    ? `with Fitzpatrick type ${fitzpatrickType}`
    : "with a realistic skin tone and texture";

  // Single composite tile to reduce render time (one OpenAI call instead of four)
  const tilePrompt = `
Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features),
generate ONE single 2x2 composite image (a tile) with identical framing/lighting/pose in all quadrants.

Layout:
- Top-left: ~10 years in the future, minimal skincare changes
- Top-right: ~20 years in the future, minimal skincare changes
- Bottom-left: ~10 years in the future, with consistent skincare and sun protection
- Bottom-right: ~20 years in the future, with consistent skincare and sun protection

Render subtle, realistic, dignified cosmetic aging (no caricature, no dramatic shock effects).
No beautification filters, no plastic smoothing, keep realistic pores/texture.
${fitzText}.
  `.trim();

  const prompts = { tile: tilePrompt };

  try {
    // 512x512 is sufficient for email/mobile and is faster than larger sizes
    return await generateEditsFromSelfie({ photoDataUrl, prompts, size: "512x512" });
  } catch (err) {
    console.error("Error generating selfie-based aging preview tile:", err);
    return { tile: null, noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
}

// -------------------------
// HTML block: Aging Preview Images (EMAIL)
// -------------------------
function buildAgingPreviewHtml(agingPreviewImages) {
  // Two-email flow: the initial report email goes out immediately,
  // and aging previews arrive in a follow-up email.
  const waitingCard = `
    <div style="margin: 18px 0 18px 0; padding: 14px 14px 16px; border-radius: 10px; border: 1px solid #E5E7EB; background-color: #F9FAFB;">
      <h2 style="font-size: 15px; font-weight: 700; margin: 0 0 6px;">
        Your Skin’s Future Story — A Preview
      </h2>
      <p style="font-size: 12px; color: #4B5563; margin: 0;">
        Your aging preview images are being generated now and will arrive in a separate email shortly.
        (Timing varies; typically a few minutes.)
      </p>
    </div>
  `;

  if (!agingPreviewImages || typeof agingPreviewImages !== "object") return waitingCard;

// Fast-path: single composite tile
if (agingPreviewImages.tile) {
  return `
    <div style="margin: 18px 0 18px 0; padding: 14px 14px 16px; border-radius: 10px; border: 1px solid #E5E7EB; background-color: #F9FAFB;">
      <h2 style="font-size: 15px; font-weight: 700; margin: 0 0 6px;">
        Your Skin’s Future Story — A Preview
      </h2>
      <p style="font-size: 12px; color: #4B5563; margin: 0 0 10px;">
        This is a single composite tile (2×2) visualization for cosmetic education and entertainment only.
        It is not a medical prediction and may not reflect your actual future appearance.
      </p>
      <img src="${agingPreviewImages.tile}" alt="Composite aging preview tile" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
      <p style="font-size: 11px; color: #6B7280; margin: 8px 0 0;">
        Top: minimal changes · Bottom: consistent care · Left: ~10 years · Right: ~20 years
      </p>
    </div>
  `;
}

const { noChange10, noChange20, withCare10, withCare20 } = agingPreviewImages || {};
const hasAny = Boolean(noChange10 || noChange20 || withCare10 || withCare20);
if (!hasAny) return waitingCard;

return renderAgingPreviewHtml({ noChange10, noChange20, withCare10, withCare20 });
}

function renderAgingPreviewHtml({ noChange10, noChange20, withCare10, withCare20 }) {
  return `
    <div style="margin: 18px 0 18px 0; padding: 14px 14px 16px; border-radius: 10px; border: 1px solid #E5E7EB; background-color: #F9FAFB;">
      <h2 style="font-size: 15px; font-weight: 700; margin: 0 0 6px;">
        Your Skin’s Future Story — A Preview
      </h2>
      <p style="font-size: 12px; color: #4B5563; margin: 0 0 10px;">
        These images are AI-generated visualizations created for cosmetic education and entertainment only.
        They are not medical predictions and may not reflect your actual future appearance.
        Their purpose is simply to show how lifestyle and skincare choices might influence the overall impression of aging over time.
      </p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 8px;">
        ${
          noChange10
            ? `<div>
                <img src="${noChange10}" alt="Approximate 10-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~10 years – minimal skincare changes</p>
              </div>`
            : ""
        }

        ${
          noChange20
            ? `<div>
                <img src="${noChange20}" alt="Approximate 20-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~20 years – minimal skincare changes</p>
              </div>`
            : ""
        }

        ${
          withCare10
            ? `<div>
                <img src="${withCare10}" alt="Approximate 10-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~10 years – with consistent care</p>
              </div>`
            : ""
        }

        ${
          withCare20
            ? `<div>
                <img src="${withCare20}" alt="Approximate 20-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~20 years – with consistent care</p>
              </div>`
            : ""
        }
      </div>
    </div>
  `;
}

// Calls OpenAI Images Edits endpoint directly (multipart/form-data)
async function generateEditsFromSelfie({ photoDataUrl, prompts, size = "1024x1024" }) {
  const parsed = parseDataUrl(photoDataUrl);
  if (!parsed) throw new Error("Selfie must be a valid data URL (data:image/...;base64,...)");

  const buf = Buffer.from(parsed.b64, "base64");
  const mime = parsed.mime || "image/png";
  const filename = mime.includes("png") ? "selfie.png" : "selfie.jpg";

  const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };

  async function oneEdit(prompt) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", size);

    // IMPORTANT: gpt-image-1 does NOT support `response_format`
    // It returns base64 in `b64_json` by default.
    form.append("image", new Blob([buf], { type: mime }), filename);

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers,
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OpenAI images/edits failed (${res.status}): ${txt}`);
    }

    const json = await res.json().catch(() => ({}));
    const d0 = json?.data?.[0] || null;

    if (d0?.b64_json) return `data:image/png;base64,${d0.b64_json}`;
    if (d0?.url) return d0.url; // fallback (rare)

    return null;
  }

// If a single composite tile prompt is provided, generate only one image (fast path)
if (prompts && typeof prompts === "object" && prompts.tile) {
  const tile = await oneEdit(prompts.tile);
  return { tile, noChange10: null, noChange20: null, withCare10: null, withCare20: null };
}

const [noChange10, noChange20, withCare10, withCare20] = await Promise.all([
  oneEdit(prompts.noChange10),
  oneEdit(prompts.noChange20),
  oneEdit(prompts.withCare10),
  oneEdit(prompts.withCare20),
]);

return { tile: null, noChange10, noChange20, withCare10, withCare20 };

}

// -------------------------
// Vision analysis (enforced)
// -------------------------
function isLikelyWeakImageAnalysis(imageAnalysis) {
  if (!imageAnalysis || typeof imageAnalysis !== "object") return true;
  const a = imageAnalysis.analysis || {};
  const meaningful =
    a.skinFindings ||
    a.texture ||
    a.poreBehavior ||
    a.pigment ||
    a.fineLinesAreas ||
    a.elasticity ||
    a.complimentFeatures;
  return !meaningful;
}

async function analyzeSelfieWithVision({ client, photoDataUrl, ageRange, primaryConcern, firstName }) {
  if (!photoDataUrl) return null;

  const visionModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_DERM_ENGINE_MODEL || "gpt-4o-mini";

  const prompt = `
You are a dermatologist providing a cosmetic, appearance-only analysis from ONE selfie.
Return ONLY strict JSON (no markdown, no commentary).

Rules:
- Cosmetic/visual only. Do not diagnose diseases.
- Do NOT use medical condition names (no rosacea, melasma, eczema, psoriasis, cancer, etc).
- Extract concrete selfie cues when possible (glasses? eye color? hair color? clothing color?).
- Provide a short, tasteful compliment referencing a real visible detail.

Return JSON with this shape:

{
  "fitzpatrickType": 1|2|3|4|5|6|null,
  "skinType": "oily"|"dry"|"combination"|"normal"|null,
  "raw": {
    "wearingGlasses": true|false|null,
    "eyeColor": "blue|green|brown|hazel|gray|unknown"|null,
    "hairColor": "blonde|brown|black|red|gray|unknown"|null,
    "clothingColor": "pink|white|black|blue|green|red|other|unknown"|null
  },
  "analysis": {
    "complimentFeatures": "string",
    "skinFindings": "1-2 sentences overall visual summary",
    "texture": "string",
    "poreBehavior": "string",
    "pigment": "string",
    "fineLinesAreas": "string",
    "elasticity": "string",
    "checklist15": {
      "1_skinTypeCharacteristics": "string",
      "2_textureSurfaceQuality": "string",
      "3_pigmentationColor": "string",
      "4_vascularCirculation": "string",
      "5_acneCongestion": "string",
      "6_agingPhotoaging": "string",
      "7_inflammatoryClues": "string (visual-only, no disease names)",
      "8_barrierHealth": "string",
      "9_structuralAnatomy": "string",
      "10_lesionMapping": "string (visual-only, recommend in-person eval for anything concerning)",
      "11_lymphaticPuffiness": "string",
      "12_lifestyleIndicators": "string (gentle, non-judgmental)",
      "13_procedureHistoryClues": "string",
      "14_hairScalpClues": "string",
      "15_neckChestHands": "string"
    }
  }
}

Context:
- First name: ${firstName || "unknown"}
- Age range: ${ageRange || "unknown"}
- Primary cosmetic concern: ${primaryConcern || "unknown"}
`.trim();

  try {
    const resp = await client.chat.completions.create({
      model: visionModel,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: photoDataUrl } },
          ],
        },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content || "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error("Vision analysis error:", err);
    return null;
  }
}

// -------------------------
// Build analysis context for LLM
// -------------------------
function mapFitzToRoman(value) {
  if (typeof value === "number") {
    const romans = ["I", "II", "III", "IV", "V", "VI"];
    return romans[value - 1] || null;
  }
  if (typeof value === "string") {
    const up = value.toUpperCase();
    if (["I", "II", "III", "IV", "V", "VI"].includes(up)) return up;
  }
  return null;
}

async function buildAnalysisContext({
  buildAnalysis,
  firstName,
  ageRange,
  primaryConcern,
  visitorQuestion,
  photoDataUrl,
  imageAnalysis,
  visualSignalsV2,
}) {
  const ia = imageAnalysis || {};
  const raw = ia.raw || {};
  const vision = ia.analysis || {};

  const fitzRoman = mapFitzToRoman(ia.fitzpatrickType);

  const tags = [];
  if (raw.wearingGlasses) tags.push("glasses");
  if (raw.eyeColor && raw.eyeColor !== "unknown") tags.push(`${raw.eyeColor} eyes`);
  if (raw.clothingColor && raw.clothingColor !== "unknown") tags.push(`${raw.clothingColor} top`);

  const form = {
    firstName: firstName || null,
    age: null,
    skinType: ia.skinType || null,
    fitzpatrickType: fitzRoman,
    primaryConcerns: primaryConcern ? [primaryConcern] : [],
    secondaryConcerns: [],
    routineLevel: ia.routineLevel || "standard",
    budgetLevel: ia.budgetLevel || "mid-range",
    currentRoutine: visitorQuestion || null,
    lifestyle: ia.lifestyle || null,
    ageRange: ageRange || null,
  };

  const selfie = {
    url: photoDataUrl || null,
    tags,
    dominantColor: raw.clothingColor === "pink" ? "soft pink" : null,
    eyeColor: raw.eyeColor || null,
    hairColor: raw.hairColor || null,
    compliment: vision.complimentFeatures || null,
  };

  const visionPayload = {
    issues: [],
    strengths: [],
    texture: vision.texture || null,
    overallGlow: vision.skinFindings || null,
    checklist15: vision.checklist15 || null,
    poreBehavior: vision.poreBehavior || null,
    pigment: vision.pigment || null,
    fineLinesAreas: vision.fineLinesAreas || null,
    elasticity: vision.elasticity || null,
    raw: raw || null,

    // ADDITIVE: V2 signals (safe for LLM specificity; buildAnalysis will ignore unknown keys if strict)
    visualSignalsV2: visualSignalsV2 || null,
  };

  return buildAnalysis({ form, selfie, vision: visionPayload });
}

// -------------------------
// Output enforcement / validation
// -------------------------
function stripInternalLines(text) {
  return String(text || "")
    .replace(/^\s*INTERNAL_COVERAGE:[^\n]*\n?/gm, "")
    .replace(/^\s*INTERNAL_SELFIE_DETAIL_OK:[^\n]*\n?/gm, "")
    .replace(/^\s*INTERNAL_GREETING_OK:[^\n]*\n?/gm, "")
    .trim();
}

function hasCoverageLine(text) {
  return /INTERNAL_COVERAGE:\s*OK/i.test(text || "");
}
function hasSelfieDetailOkLine(text) {
  return /INTERNAL_SELFIE_DETAIL_OK:\s*YES/i.test(text || "");
}
function hasGreetingOkLine(text) {
  return /INTERNAL_GREETING_OK:\s*YES/i.test(text || "");
}

// -------------------------
// Handler
// -------------------------
module.exports = async function handler(req, res) {
  try {
    // Ensure these exist in scope even when optional branches are skipped
    let agingPreviewImages = null;
    let agingPreviewHtml = "";
    let agingJob = null;
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set in the environment" });
    }

    // US-only geo gate (Vercel header)
    const country = req.headers["x-vercel-ip-country"];
    if (country && country !== "US") {
      return res.status(403).json({
        ok: false,
        error: "geo_blocked",
        message: "This virtual skincare analysis is currently available only to visitors in the United States.",
      });
    }

    const {
      firstName,
      email,
      ageRange,
      primaryConcern,
      visitorQuestion,
      photoDataUrl,
    } = req.body || {};

    const incomingImageAnalysis = req.body?.incomingImageAnalysis || req.body?.imageAnalysis || null;

    // REQUIRED fields
    const cleanFirstName = String(firstName || "").trim();
    const cleanEmail = String(email || "").trim();
    const cleanAgeRange = String(ageRange || "").trim();
    const cleanPrimaryConcern = String(primaryConcern || "").trim();
    const cleanVisitorQuestion = String(visitorQuestion || "").trim();

    if (!cleanFirstName) {
      return res.status(400).json({ ok: false, error: "missing_first_name", message: "First name is required." });
    }
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({ ok: false, error: "invalid_email", message: "Valid email is required." });
    }
    if (!cleanAgeRange || !cleanPrimaryConcern) {
      return res.status(400).json({
        ok: false,
        error: "missing_fields",
        message: "Age range and primary concern are required.",
      });
    }
    if (!photoDataUrl) {
      return res.status(400).json({
        ok: false,
        error: "missing_photo",
        message: "A selfie photo is required to generate a detailed analysis.",
      });
    }

    const client = await getOpenAIClient();

    // ✅ Capture Quality Evaluation (modifier, not a hard stop)
    // We proceed with best-effort analysis even when photo quality is suboptimal,
    // but surface an explicit confidence score and actionable retry tips.
    const captureQuality = await evaluateCaptureQuality({ client, photoDataUrl });
    const analysisConfidence = computeAnalysisConfidence(captureQuality);

    // Enforce 30-day cooldown per email (analysis proceeds even if confidence is low)
    checkCooldownOrThrow(cleanEmail);

    const buildAnalysis = await getBuildAnalysis();

    // Ensure selfie is email-safe (public URL)
    const emailSafeSelfieUrl = await ensureEmailSafeImageUrl(photoDataUrl);

    // 1) Ensure we have strong image analysis
    let imageAnalysis = incomingImageAnalysis || null;
    let enrichedWithVision = false;

    if ((!imageAnalysis || isLikelyWeakImageAnalysis(imageAnalysis)) && photoDataUrl) {
      const visionResult = await analyzeSelfieWithVision({
        client,
        photoDataUrl,
        ageRange: cleanAgeRange,
        primaryConcern: cleanPrimaryConcern,
        firstName: cleanFirstName,
      });

      if (visionResult) {
        imageAnalysis = visionResult;
        enrichedWithVision = true;
      }
    }

    // 1.5) NEW: Visual Signals V2 extraction (LOW LOE)
    //      If extraction is weak/missing, derive a conservative V2 payload so the UI rings/clusters always render.
    const extractedVisualSignalsV2 = await extractVisualSignalsV2({
      client,
      photoDataUrl,
      firstName: cleanFirstName,
      ageRange: cleanAgeRange,
      primaryConcern: cleanPrimaryConcern,
    });

    const imageContext =
      (imageAnalysis && (imageAnalysis.image_context || imageAnalysis.imageContext)) || null;

    const visualSignalsV2 = isValidVisualSignalsV2(extractedVisualSignalsV2)
      ? extractedVisualSignalsV2
      : deriveVisualSignalsV2({
          primaryConcern: cleanPrimaryConcern,
          ageRange: cleanAgeRange,
          imageContext,
        });

    // 2) Build structured analysis context
    const analysisContext = await buildAnalysisContext({
      buildAnalysis,
      firstName: cleanFirstName,
      ageRange: cleanAgeRange,
      primaryConcern: cleanPrimaryConcern,
      visitorQuestion: cleanVisitorQuestion || null,
      photoDataUrl: emailSafeSelfieUrl || photoDataUrl,
      imageAnalysis,
      visualSignalsV2,
    });

    // 3) ADD: Dermatology Engine run (structured JSON; additive)
    const dermEngineResult = await runDermatologyEngine({
      client,
      photoDataUrl, // keep original; required selfie (dataURL ok for vision)
      firstName: cleanFirstName,
      email: cleanEmail,
      ageRange: cleanAgeRange,
      primaryConcern: cleanPrimaryConcern,
      visitorQuestion: cleanVisitorQuestion || null,
      analysisContext,
      imageAnalysis,
    });

    const dermEngine = dermEngineResult?.ok ? dermEngineResult.data : dermEngineResult;

    // Brand-locked product + service list
    const productList = `
- Beneficial Face Cleanser with Centella Asiatica (Dermo Complex): soothing, barrier-supporting cleanser for sensitive or redness-prone skin.
- Enriched Face Wash with Hyaluronic and Amino Acid: hydrating, gentle cleanser that supports barrier repair.
- Rehydrating Face Emulsion with Centella Asiatica and Peptides: lightweight hydrator with peptides and Centella for barrier and collagen support.
- Concentrated Toner Pads with Hyaluronic Acid: hydrating toner pads to plump, refine pores, and support skin barrier.
- Balancing Toner Pads with Niacinamide: brightening, oil-balancing toner pads to help with pigmentation and texture.
- Natural Mineral Sunscreen Protection: zinc-based, botanical-rich mineral sunscreen with no chemical filters.
- Hydrating Face Cloud Mask: deeply hydrating mask for glow, plumpness, and fine-line softening.
`.trim();

    const serviceList = `
- Luxury Beauty Facial (1.5-Hour Comprehensive): multi-step medical-grade facial with cleansing, exfoliation, extractions, massage, hydration, and LED as part of the facial.
- Roller Massage (Body Sculpt & Lymphatic Support): micro-vibration therapy for lymphatic drainage, circulation, cellulite smoothing, and body contouring.
- Candela eMatrix® RF Skin Rejuvenation: fractional radiofrequency for texture, fine lines, acne scars, and pore refinement.
- PRP Skin Rejuvenation: platelet-rich plasma applied to skin for collagen support, texture, and under-eye rejuvenation.
- PRP Hair Restoration: PRP injections into the scalp to support hair follicles and density in early to moderate thinning.
- HIEMT (High-Intensity Electromagnetic Therapy): non-invasive muscle stimulation for core and body sculpting.
- Beauty Injectables (Botox®, JUVÉDERM® fillers, PRP): conservative, natural-looking injectable treatments for lines, volume, and facial balance.
`.trim();

    // 4) Prompt: enforce name greeting + 15 categories + selfie detail
    const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics®.

VOICE & STYLE (NON-NEGOTIABLE):
- Write as "I" speaking directly to "${cleanFirstName}" in a warm, elegant, deeply human tone.
- This MUST feel like a real dermatologist writing a personal letter, not a template.
- Luxury-clinical: premium, polished, never cold.
- Avoid bullet-heavy formatting. Favor flowing paragraphs.

CRITICAL SAFETY / SCOPE:
- Cosmetic/visual education & entertainment only.
- Do NOT diagnose or name medical diseases/conditions.
- Do NOT use terms like rosacea, melasma, eczema, psoriasis, cancer, etc.
- Only describe visible appearance-based features.

PRODUCT & SERVICE RULES:
- Recommend ONLY from the product list and service list.
PRODUCTS:
${productList}
SERVICES:
${serviceList}

NON-NEGOTIABLE REQUIREMENTS:
1) The letter MUST begin EXACTLY with:
   "Dear ${cleanFirstName},"
   Never use "Dear You" or any other greeting.
2) The letter MUST reference at least ONE concrete selfie detail from the provided context:
   glasses, eye color, hair, clothing color, or another visible detail.

ANALYSIS CONFIDENCE (ALWAYS DISCLOSE BRIEFLY):
- Confidence score: ${analysisConfidence.score}/100.
- If below 90/100, include 1–2 sentences early in the letter explaining that guidance is best-effort based on the photo quality, and list the top 1–2 reasons.
- Include one short “how to improve confidence next time” hint (e.g., better lighting, more frontal angle, no occlusions, closer framing).
- Keep tone calm, non-alarming, and non-judgmental.
3) The letter MUST incorporate the 15-point dermatologist visual analysis categories below,
   woven naturally in narrative (do NOT list them as a checklist).
   The 15 categories are:
   (1) Skin type characteristics
   (2) Texture & surface quality
   (3) Pigmentation & color
   (4) Vascular/circulation status
   (5) Acne & congestion evaluation
   (6) Aging & photoaging assessment
   (7) Inflammatory-pattern visual clues (no disease names)
   (8) Barrier function & health
   (9) Structural/anatomical assessments
   (10) Lesion mapping (visual-only; encourage in-person eval for anything concerning)
   (11) Lymphatic & puffiness assessment
   (12) Lifestyle indicators seen in skin
   (13) Cosmetic procedure history clues (visual hints)
   (14) Hair & scalp clues
   (15) Neck/chest/hands observations

OUTPUT FORMAT (MUST FOLLOW EXACTLY):
FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 sentences>

<blank line>

<ONE continuous personal letter (no section headings). End with:
"May your skin always glow as bright as your smile." ~ Dr. Lazuk

FINAL THREE LINES (INTERNAL, MUST INCLUDE — I will remove them before sending):
INTERNAL_GREETING_OK: YES
INTERNAL_SELFIE_DETAIL_OK: YES
INTERNAL_COVERAGE: OK
`.trim();

    // Keep prompts compact: include V2 signals as a small, direct JSON supplement
    const v2ForPrompt = visualSignalsV2 ? JSON.stringify(visualSignalsV2, null, 2) : "{}";

    const userPrompt = `
Person details:
- First name: ${cleanFirstName}
- Age range: ${cleanAgeRange}
- Primary cosmetic concern: ${cleanPrimaryConcern}
- Visitor question: ${cleanVisitorQuestion || "none provided"}

Capture quality & confidence (do NOT print JSON; use it to disclose limitations + how to improve confidence):
${JSON.stringify({ analysisConfidence, captureQuality }, null, 2)}

Structured analysis context (do NOT print JSON; weave it into the letter):
${JSON.stringify(analysisContext, null, 2)}

Raw image analysis (do NOT print JSON; use it to be specific):
${JSON.stringify(imageAnalysis || {}, null, 2)}

Additional image-specific “precision signals” (V2) (do NOT print JSON; use to improve specificity):
${v2ForPrompt}

Important: Use only selfie details that appear in the provided context. Do NOT invent specifics.
`.trim();

    // Model choice
    const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";

    let full = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const completion = await client.chat.completions.create({
        model: textModel,
        temperature: attempt === 1 ? 0.55 : 0.4,
        max_tokens: 2100,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      full = completion.choices?.[0]?.message?.content || "";

      const ok = hasCoverageLine(full) && hasSelfieDetailOkLine(full) && hasGreetingOkLine(full);
      if (ok) break;

      console.warn("Report validation failed, retrying...", {
        attempt,
        hasCoverage: hasCoverageLine(full),
        hasSelfieDetail: hasSelfieDetailOkLine(full),
        hasGreeting: hasGreetingOkLine(full),
      });
    }

    // Parse FITZPATRICK_TYPE and FITZPATRICK_SUMMARY
    let fitzpatrickType = null;
    let fitzpatrickSummary = null;
    let reportText = full;

    const typeMatch = full.match(/FITZPATRICK_TYPE:\s*([IVX]+)/i);
    if (typeMatch) {
      fitzpatrickType = typeMatch[1].toUpperCase();
      reportText = reportText.replace(typeMatch[0], "");
    }

    const summaryMatch = full.match(/FITZPATRICK_SUMMARY:\s*([\s\S]*?)(\n\s*\n|$)/i);
    if (summaryMatch) {
      fitzpatrickSummary = summaryMatch[1].trim();
      reportText = reportText.replace(summaryMatch[0], "");
    }

    reportText = stripInternalLines(reportText).trim();

    // 4.5) NEW: Insert V2 precision paragraphs into the LETTER (NO TITLES)
    const v2Insert = buildVisualSignalsV2LetterInsert(visualSignalsV2);
    if (v2Insert) {
      const split = splitForAgingPlacement(reportText);
      if (split && split.closing) {
        reportText = `${split.before}\n\n${v2Insert}\n\n${split.closing}`.trim();
      } else {
        reportText = `${reportText}\n\n${v2Insert}`.trim();
      }
    }
    
    // 5) Aging preview images are generated asynchronously (second email).
    // We return and email the report immediately, then the client calls /api/generate-aging.
    // This avoids long blocking runtimes (aging renders can take several minutes).

    // 5) Aging preview images are generated asynchronously (second email).
    // We email the report immediately, then the client calls /api/generate-aging.
    agingPreviewImages = null;
    agingPreviewHtml = buildAgingPreviewHtml(agingPreviewImages);

    agingJob = {
      endpoint: "/api/generate-aging",
      payload: {
        firstName,
        email,
        // Use the already-public email-safe selfie URL to avoid re-uploading base64
        selfiePublicUrl: emailSafeSelfieUrl,
      },
    };
    
    // Reflection HTML (must be inserted AFTER aging images)
    const reflectionHtml = buildEmailReflectionSectionHtml();

    // ✅ Confidence-aware Areas of Focus
    const allowAof = shouldAllowAreasOfFocus({ imageAnalysis, visualSignalsV2 });

    const areasOfFocusHtml = allowAof
      ? buildAreasOfFocusSectionHtml({
          analysisContext,
          imageAnalysis,
          visitorQuestion: cleanVisitorQuestion,
        })
      : "";

    const areasOfFocus = allowAof
      ? buildAreasOfFocusItems({
          analysisContext,
          imageAnalysis,
          visitorQuestion: cleanVisitorQuestion,
        })
      : [];

    const areasOfFocusText = allowAof
      ? buildAreasOfFocusText({
          analysisContext,
          imageAnalysis,
          visitorQuestion: cleanVisitorQuestion,
        })
      : "";

    // Place aging block near the end, just above Dr. Lazuk’s closing note/signature.
    // EMAIL order: before -> areas of focus -> aging images -> reflection -> closing
    const { before, closing } = splitForAgingPlacement(reportText);

const confidenceHtml = (() => {
  if (!analysisConfidence) return "";
  const score =
    typeof analysisConfidence.score === "number" ? analysisConfidence.score : null;

  const note = analysisConfidence.note || analysisConfidence.explanation || "";
  const reasons = Array.isArray(captureQuality?.reasons) ? captureQuality.reasons : [];

  const reasonsHtml =
    reasons.length > 0
      ? `<ul style="margin:8px 0 0 18px;">${reasons
          .slice(0, 5)
          .map((r) => `<li>${escapeHtml(String(r))}</li>`)
          .join("")}</ul>`
      : "";

  return `
    <div style="margin: 14px 0 18px; padding: 12px 14px; border: 1px solid #E5E7EB; border-radius: 12px; background: #F9FAFB;">
      <div style="font-weight: 800; color: #111827;">
        Analysis Confidence${score != null ? `: <span style="font-variant-numeric: tabular-nums;">${score}/100</span>` : ""}
      </div>
      ${note ? `<div style="margin-top:6px; color:#374151;">${escapeHtml(String(note))}</div>` : ""}
      ${score != null && score < 100 ? `<div style="margin-top:6px; color:#6B7280; font-size: 13px;">To increase confidence, retake your selfie with better lighting and a front-facing angle.</div>` : ""}
      ${reasonsHtml}
    </div>
  `;
})();    const letterHtmlBody =
      textToHtmlParagraphs(before) +
      (areasOfFocusHtml ? areasOfFocusHtml : "") +
      (agingPreviewHtml ? agingPreviewHtml : "") +
      (reflectionHtml ? reflectionHtml : "") +
      (closing ? textToHtmlParagraphs(closing) : "");

    // Visitor email HTML — selfie image ALWAYS included (mandatory)
    // NOTE: Fitzpatrick results are NOT rendered to the visitor.
    const visitorHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 20px;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
          <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">Your Dr. Lazuk Virtual Skin Analysis</h1>
          <p style="font-size: 13px; color: #4B5563; margin-bottom: 14px;">
            Thank you for trusting us with this cosmetic, education-only look at your skin.
            This is not medical advice, and no medical conditions are being evaluated or treated.
          </p>

          <div style="margin: 12px 0 18px 0; text-align: left;">
            <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">The photo you shared:</p>
            <img
              src="${emailSafeSelfieUrl || photoDataUrl}"
              alt="Your uploaded skin photo"
              style="max-width: 240px; width: 100%; border-radius: 10px; border: 1px solid #E5E7EB; display: block;"
            />
          </div>

          <p style="font-size: 11px; color: #92400E; margin: 0 0 10px 0;">
            This is a visual, cosmetic estimate only and is not a medical diagnosis.
          </p>

          <div style="margin-top: 10px;">
            ${letterHtmlBody}
          </div>

          <hr style="border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6B7280; margin-bottom: 4px;">If you have any medical concerns or skin conditions, please see a qualified in-person professional.</p>
          <p style="font-size: 12px; color: #6B7280; margin-bottom: 8px;">If you’d like in-person, customized care, our team at Dr. Lazuk Esthetics® in Georgia would be honored to see you.</p>
          <p style="font-size: 12px; color: #6B7280;">
            With care,<br/>
            Dr. Lazuk Esthetics® &amp; Dr. Lazuk Cosmetics®<br/>
            <a href="mailto:contact@drlazuk.com" style="color: #111827; text-decoration: underline;">contact@drlazuk.com</a>
          </p>
        </div>
      </div>
    `;

    // Clinic email HTML
    const clinicEmail = process.env.RESEND_CLINIC_EMAIL || "contact@drlazuk.com";
    const safeConcern = cleanPrimaryConcern || "Not specified";

    // ADD: Include derm engine JSON for internal QA/trust (clinic only)
    const dermEngineClinicBlock = `
      <div style="margin-top: 14px; padding: 12px 14px; border-radius: 10px; border: 1px dashed #D1D5DB; background: #FAFAFA;">
        <p style="margin:0 0 8px 0; font-size: 12px; color: #374151;"><strong>Dermatology Engine (Structured JSON)</strong> — internal QA / audit snapshot</p>
        <pre style="margin:0; font-size: 11px; color: #111827; white-space: pre-wrap;">${escapeHtml(
          JSON.stringify(dermEngine || {}, null, 2)
        )}</pre>
      </div>
    `;

    // ADD: V2 signals JSON block (clinic only)
    const v2ClinicBlock = `
      <div style="margin-top: 14px; padding: 12px 14px; border-radius: 10px; border: 1px dashed #D1D5DB; background: #FAFAFA;">
        <p style="margin:0 0 8px 0; font-size: 12px; color: #374151;"><strong>Visual Signals V2 (Structured JSON)</strong> — internal QA / specificity layer</p>
        <pre style="margin:0; font-size: 11px; color: #111827; white-space: pre-wrap;">${escapeHtml(
          JSON.stringify(visualSignalsV2 || {}, null, 2)
        )}</pre>
      </div>
    `;

    const clinicHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 16px;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
          <h1 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">New Virtual Skin Analysis – Cosmetic Report</h1>
          <p style="font-size: 13px; color: #4B5563; margin-bottom: 8px;">A visitor completed the Dr. Lazuk virtual skin analysis.</p>
          <ul style="font-size: 13px; color: #374151; margin-bottom: 12px; padding-left: 18px;">
            <li><strong>First Name:</strong> ${escapeHtml(cleanFirstName)}</li>
            <li><strong>Email:</strong> ${escapeHtml(cleanEmail)}</li>
            <li><strong>Age Range:</strong> ${escapeHtml(cleanAgeRange)}</li>
            <li><strong>Primary Concern:</strong> ${escapeHtml(safeConcern)}</li>
            ${fitzpatrickType ? `<li><strong>Fitzpatrick Estimate:</strong> Type ${escapeHtml(fitzpatrickType)}</li>` : ""}
          </ul>

          ${
            fitzpatrickSummary
              ? `<p style="font-size: 13px; margin-bottom: 12px;"><strong>Fitzpatrick Summary:</strong> ${escapeHtml(
                  fitzpatrickSummary
                )}</p>`
              : ""
          }

          <div style="margin: 12px 0 18px 0;">
            <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">Visitor photo:</p>
            <img src="${emailSafeSelfieUrl || photoDataUrl}" alt="Uploaded skin photo" style="max-width: 240px; width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
          </div>

          <div style="margin-top: 10px;">
            ${letterHtmlBody}
          </div>

          ${v2ClinicBlock}
          ${dermEngineClinicBlock}
        </div>
      </div>
    `;

    // Send visitor + clinic emails
    await Promise.all([
      sendEmailWithResend({
        to: cleanEmail,
        subject: "Your Dr. Lazuk Virtual Skin Analysis Report",
        html: visitorHtml,
      }),
      sendEmailWithResend({
        to: clinicEmail,
        subject: "New Skincare Analysis Guest",
        html: clinicHtml,
      }),
    ]);

    // Response to frontend (VISUAL REPORT)
    // Prefer V2 signal scores (Model B). If signals are missing/invalid, fall back to
    // conservative narrative inference so rings/scores/RAG still render.
    const nowIso = new Date().toISOString();

    const validateVisualSignalsV2 = (v) => {
      if (!v || typeof v !== "object") return false;
      // Consider valid if we can find at least one numeric score field in the expected shape.
      const candidates = [
        v?.barrier?.hydrationScore,
        v?.barrier?.integrityScore,
        v?.sebum?.oilinessScore,
        v?.sebum?.congestionScore,
        v?.pigment?.unevenToneScore,
        v?.pigment?.spottingScore,
        v?.aging?.fineLinesScore,
        v?.aging?.elasticityScore,
        v?.periorbital?.fineLinesScore,
        v?.periorbital?.puffinessScore,
      ];
      return candidates.some((x) => typeof x === "number" && Number.isFinite(x));
    };

    const canonical_payload = (incomingImageAnalysis && incomingImageAnalysis.ok && incomingImageAnalysis.clusters)
      ? (buildCanonicalPayloadFromIncomingImageAnalysis(incomingImageAnalysis, { nowIso }) || buildCanonicalPayloadFallback(
          {
            reportText,
            ageRange: ageRange || null,
            primaryConcern: primaryConcern || null,
          },
          { nowIso }
        ))
      : (validateVisualSignalsV2(visualSignalsV2)
        ? buildCanonicalPayloadFromSignalsV2(visualSignalsV2, { nowIso })
        : buildCanonicalPayloadFallback(
            {
              reportText,
              ageRange: ageRange || null,
              primaryConcern: primaryConcern || null,
            },
            { nowIso }
          ));
    const visual_payload = buildVisualPayloadFromCanonical(canonical_payload);
    const protocol_recommendation = recommendProtocol({
      primaryConcern,
      clusters: visual_payload.clusters,
    });
    canonical_payload.protocol_recommendation = protocol_recommendation;

    return res.status(200).json({
      ok: true,

      // ✅ Canonical payload for client-side visual report (scores + RAG)
      canonical_payload,

      visual_payload,
      protocol_recommendation,
// Original narrative letter (UI can keep rendering this as-is)
      report: reportText,

      // ✅ LOCKED: dynamic card data for visual report rendering
      areasOfFocus,
      areasOfFocusText,

      analysis_confidence: analysisConfidence || null,
      captureQuality: captureQuality || null,

      fitzpatrickType: fitzpatrickType || null,
      fitzpatrickSummary: fitzpatrickSummary || null,
      agingPreviewImages,
      selfieUrlForEmail: emailSafeSelfieUrl || null,

      // ✅ New: capture-quality disclosure (additive)
      analysisConfidence,
      captureQuality,

      // ADD: Dermatology Engine payload (structured JSON)
      dermEngine: dermEngine || null,

      // ADD: Visual Signals V2 payload (structured JSON)
      visualSignalsV2: visualSignalsV2 || null,

      emailSelfieUrl: emailSafeSelfieUrl,
      agingJob,

      _debug: {
        usedIncomingImageAnalysis: !!incomingImageAnalysis,
        enrichedWithVision,
        emailSelfieIsDataUrl: isDataUrl(photoDataUrl),
        emailSelfieUploaded: !!emailSafeSelfieUrl && !isDataUrl(emailSafeSelfieUrl),

        dermEngineOk: !!(dermEngineResult && dermEngineResult.ok),
        dermEngineModel:
          process.env.OPENAI_DERM_ENGINE_MODEL ||
          process.env.OPENAI_VISION_MODEL ||
          process.env.OPENAI_TEXT_MODEL ||
          "gpt-4o-mini",

        v2SignalsModel:
          process.env.OPENAI_V2_SIGNALS_MODEL ||
          process.env.OPENAI_VISION_MODEL ||
          process.env.OPENAI_DERM_ENGINE_MODEL ||
          "gpt-4o-mini",

        v2SignalsConfidence: visualSignalsV2?.globalConfidence ?? null,

        // NEW: quality gate debug
        captureQuality: captureQuality || null,
        captureQualityModel:
          process.env.OPENAI_CAPTURE_QUALITY_MODEL ||
          process.env.OPENAI_VISION_MODEL ||
          "gpt-4o-mini",

        allowAreasOfFocus: allowAof,
      },
    });
  } catch (err) {
    console.error("generate-report error:", err);

    const status = err?.status ? err.status : err?.code === "cooldown_active" ? 429 : 500;

    return res.status(status).json({
      ok: false,
      error: err?.code || "generate_report_failed",
      message: String(err?.message || "Something went wrong while generating the report."),
    });
  }
};
