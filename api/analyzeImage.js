// api/analyzeImage.js
// Vision-powered image analysis for the virtual skincare report.
//
// Accepts: { imageBase64, notes }
//
// Returns (additive-safe):
// {
//   ok: true,
//   raw: { ... },
//   analysis: { ... checklist15 ... },
//   fitzpatrickType: number (1–6) | null,
//   skinType: "oily"|"dry"|"combination"|"normal"|null,
//
//   // LOCKED-SPEC numeric payload (authoritative):
//   report_id: string,
//   version: 1,
//   generated_at: string,
//   overall_score: { score: number, rag: "green"|"amber"|"red" },
//   clusters: [
//     { cluster_id, display_name, weight, order, metrics: [{ metric_id, display_name, score, rag, cluster_id, order }] }
//   ]
// }

module.exports.config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

async function getOpenAIClient() {
  const mod = await import("openai");
  const OpenAI = mod?.default || mod;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractJson(rawText) {
  const text = String(rawText || "").trim();
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return candidate.slice(start, end + 1).trim();
  return candidate;
}

function safeJsonParse(maybeJsonText) {
  try {
    if (!maybeJsonText) return null;
    return JSON.parse(extractJson(maybeJsonText));
  } catch {
    return null;
  }
}

function normalizeFitzpatrick(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 6) return null;
  return n;
}

function normalizeSkinType(value) {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();
  if (v.includes("combo")) return "combination";
  if (v === "oily" || v === "dry" || v === "normal" || v === "combination") return v;
  return null;
}

function isProbablyTooLargeDataUrl(s, maxChars = 9_000_000) {
  return typeof s === "string" && s.startsWith("data:image/") && s.length > maxChars;
}

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x)));
}

// 🔒 Locked global RAG thresholds
function ragFromScore(score) {
  const s = clampScore(score);
  if (s === null) return "amber";
  if (s >= 75) return "green";
  if (s >= 55) return "amber";
  return "red";
}

// 🔒 Locked clusters + metric mapping
const LOCKED_CLUSTERS = [
  {
    cluster_id: "core_skin",
    display_name: "Core Skin Health",
    weight: 0.35,
    order: 1,
    metrics: [
      { metric_id: "barrier_stability", display_name: "Barrier Stability", order: 1 },
      { metric_id: "hydration_level", display_name: "Hydration Level", order: 2 },
      { metric_id: "oil_sebum_balance", display_name: "Oil / Sebum Balance", order: 3 },
      { metric_id: "skin_texture", display_name: "Skin Texture", order: 4 },
      { metric_id: "pore_visibility", display_name: "Pore Visibility", order: 5 },
    ],
  },
  {
    cluster_id: "aging_structure",
    display_name: "Aging & Structure",
    weight: 0.25,
    order: 2,
    metrics: [
      { metric_id: "fine_lines", display_name: "Fine Lines", order: 1 },
      { metric_id: "wrinkles", display_name: "Wrinkles", order: 2 },
      { metric_id: "skin_firmness", display_name: "Skin Firmness", order: 3 },
      { metric_id: "skin_sagging", display_name: "Skin Sagging", order: 4 },
      { metric_id: "elasticity_bounceback", display_name: "Elasticity / Bounce-Back", order: 5 },
    ],
  },
  {
    cluster_id: "eye_area",
    display_name: "Eye Area",
    weight: 0.15,
    order: 3,
    metrics: [
      { metric_id: "under_eye_fine_lines", display_name: "Under-Eye Fine Lines", order: 1 },
      { metric_id: "under_eye_sagging_hollows", display_name: "Under-Eye Sagging / Hollows", order: 2 },
      { metric_id: "under_eye_dark_circles", display_name: "Under-Eye Dark Circles", order: 3 },
      { metric_id: "under_eye_puffiness", display_name: "Under-Eye Puffiness", order: 4 },
    ],
  },
  {
    cluster_id: "pigmentation_tone",
    display_name: "Pigmentation & Tone",
    weight: 0.15,
    order: 4,
    metrics: [
      { metric_id: "overall_pigmentation", display_name: "Overall Pigmentation", order: 1 },
      { metric_id: "dark_spots_sun_spots", display_name: "Dark Spots / Sun Spots", order: 2 },
      { metric_id: "uneven_skin_tone", display_name: "Uneven Skin Tone", order: 3 },
      { metric_id: "redness_blotchiness", display_name: "Redness / Blotchiness", order: 4 },
    ],
  },
  {
    cluster_id: "stress_damage",
    display_name: "Stress & Damage",
    weight: 0.10,
    order: 5,
    metrics: [
      { metric_id: "sensitivity_reactivity", display_name: "Sensitivity / Reactivity", order: 1 },
      { metric_id: "inflammation_signals", display_name: "Inflammation Signals", order: 2 },
      { metric_id: "environmental_damage", display_name: "Environmental Damage (UV / Pollution)", order: 3 },
    ],
  },
];

const LOCKED_VERSION = 1;

function computeOverallScore(clusters) {
  const byId = new Map(clusters.map((c) => [c.cluster_id, c]));
  let total = 0;

  for (const locked of LOCKED_CLUSTERS) {
    const c = byId.get(locked.cluster_id);
    if (!c || !Array.isArray(c.metrics) || c.metrics.length === 0) continue;

    const scores = c.metrics
      .map((m) => clampScore(m.score))
      .filter((x) => typeof x === "number");

    if (!scores.length) continue;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    total += avg * locked.weight;
  }

  const score = Math.round(total);
  return { score, rag: ragFromScore(score) };
}

function makeReportId() {
  return `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getAllMetricIds() {
  return LOCKED_CLUSTERS.flatMap((c) => c.metrics.map((m) => m.metric_id));
}

function buildClustersFromMetricScores(metricScores) {
  return LOCKED_CLUSTERS.map((c) => {
    const metrics = c.metrics.map((m) => {
      const score = clampScore(metricScores?.[m.metric_id]);
      return {
        metric_id: m.metric_id,
        display_name: m.display_name,
        score,
        rag: ragFromScore(score),
        cluster_id: c.cluster_id,
        order: m.order,
      };
    });

    return {
      cluster_id: c.cluster_id,
      display_name: c.display_name,
      weight: c.weight,
      order: c.order,
      metrics,
    };
  });
}

function validateMetricScores(metricScores) {
  if (!metricScores || typeof metricScores !== "object") return { ok: false, missing: getAllMetricIds() };

  const missing = [];
  for (const id of getAllMetricIds()) {
    const v = clampScore(metricScores[id]);
    if (v === null) missing.push(id);
  }
  return { ok: missing.length === 0, missing };
}

async function runVisionOnce({ client, visionModel, systemPrompt, userText, imageUrl, temperature }) {
  const completion = await client.chat.completions.create({
    model: visionModel,
    temperature,
    max_tokens: 1600,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const rawContent = completion.choices?.[0]?.message?.content || "";
  return { rawContent, parsed: safeJsonParse(rawContent) };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set in the environment" });
  }

  // US-only geo gate
  const country = req.headers["x-vercel-ip-country"];
  if (country && country !== "US") {
    return res.status(403).json({
      ok: false,
      error: "geo_blocked",
      message: "This virtual skincare analysis is currently available only to visitors in the United States.",
    });
  }

  try {
    const { imageBase64, notes } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        ok: false,
        error: "missing_image",
        message: "Please provide 'imageBase64' (a data URL or image URL) for analysis.",
      });
    }

    if (isProbablyTooLargeDataUrl(imageBase64)) {
      return res.status(413).json({
        ok: false,
        error: "image_too_large",
        message:
          "That image is a bit too large to analyze. Please upload a smaller photo (try taking a standard selfie and avoid ultra-high resolution).",
      });
    }

    const client = await getOpenAIClient();
    const imageUrl = imageBase64;
    const visionModel = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

    const metricListForModel = LOCKED_CLUSTERS.map((c) => ({
      cluster_id: c.cluster_id,
      display_name: c.display_name,
      metrics: c.metrics.map((m) => ({
        metric_id: m.metric_id,
        display_name: m.display_name,
      })),
    }));

    const systemPromptBase = `
You are a cosmetic-only virtual assistant working alongside a dermatologist.
You are analyzing a single selfie (face photo) for COSMETIC and APPEARANCE purposes only.

STRICT RULES:
- DO NOT diagnose or name diseases (no "rosacea", "melasma", "eczema", "psoriasis", "cancer", etc.).
- Only talk about cosmetic / visual aspects: redness, uneven tone, dryness, oiliness, texture, fine lines, pores, glow, puffiness.
- You are not giving medical advice. You are describing appearance-only patterns.
- Do not invent details you cannot see clearly.

CRITICAL NUMERIC REQUIREMENT:
You MUST provide numeric scores for each metric_id listed below.
- score range: 0–100 (integer)
- DO NOT return the same number for all metrics
- when uncertain, choose conservative mid-range scores (55–75) BUT still vary across metrics
- base scores ONLY on what is visible in the photo and the notes

LOCKED METRICS LIST (you must score all of them):
${JSON.stringify(metricListForModel, null, 2)}

TASK:
Return VALID JSON ONLY (no markdown, no extra commentary) with EXACTLY this shape:

{
  "raw": {
    "wearingGlasses": boolean | null,
    "eyeColor": string | null,
    "hairColor": string | null,
    "clothingColor": string | null,
    "globalTexture": string | null,
    "tZonePores": boolean | null,
    "pigmentType": string | null,
    "fineLinesRegions": string | null
  },
  "analysis": {
    "complimentFeatures": string,
    "skinFindings": string,
    "texture": string,
    "poreBehavior": string,
    "pigment": string,
    "fineLinesAreas": string,
    "elasticity": string,
    "eveningActive": string,
    "estheticRecommendations": string,
    "checklist15": {
      "1_skinTypeCharacteristics": string,
      "2_textureSurfaceQuality": string,
      "3_pigmentationColor": string,
      "4_vascularCirculation": string,
      "5_acneCongestion": string,
      "6_agingPhotoaging": string,
      "7_inflammatoryClues": string,
      "8_barrierHealth": string,
      "9_structuralAnatomy": string,
      "10_lesionMapping": string,
      "11_lymphaticPuffiness": string,
      "12_lifestyleIndicators": string,
      "13_procedureHistoryClues": string,
      "14_hairScalpClues": string,
      "15_neckChestHands": string
    }
  },
  "fitzpatrickType": number | null,
  "skinType": "oily"|"dry"|"combination"|"normal"|null,
  "metric_scores": {
    "<metric_id>": number,
    "...": number
  }
}

IMPORTANT REQUIREMENT FOR complimentFeatures:
- It MUST mention at least ONE concrete visible detail (examples: glasses, hair, clothing color/pattern, smile, lighting/background vibe).
- If you cannot confidently identify eye color, do NOT guess it.
`.trim();

    const userText = `
Please analyze this face photo from a COSMETIC perspective only.

Additional notes (may be empty):
${notes || "none provided"}
`.trim();

    // Pass 1
    let { rawContent, parsed } = await runVisionOnce({
      client,
      visionModel,
      systemPrompt: systemPromptBase,
      userText,
      imageUrl,
      temperature: 0.2,
    });

    // Validate metric_scores. If incomplete, retry once with stricter instruction.
    let metricScores = parsed?.metric_scores;
    let validation = validateMetricScores(metricScores);

    if (!parsed || !validation.ok) {
      const stricter = `
${systemPromptBase}

RETRY REQUIREMENT:
Your previous output was missing metric_scores or missing some metric_ids.
You MUST include metric_scores for ALL metric_ids. No omissions.
Missing metric_ids you must include now: ${JSON.stringify(validation.missing || [], null, 2)}
`.trim();

      const retry = await runVisionOnce({
        client,
        visionModel,
        systemPrompt: stricter,
        userText,
        imageUrl,
        temperature: 0.1,
      });

      rawContent = retry.rawContent;
      parsed = retry.parsed;
      metricScores = parsed?.metric_scores;
      validation = validateMetricScores(metricScores);
    }

    if (!parsed || !validation.ok) {
      console.error("Vision JSON parse/metric validation failed:", { rawContent, missing: validation.missing });
      return res.status(500).json({
        ok: false,
        error: "metric_scores_invalid",
        message: "Problem producing numeric scores for the visual report. Please try again.",
      });
    }

    const analysis = parsed.analysis && typeof parsed.analysis === "object" ? parsed.analysis : {};
    const raw = parsed.raw && typeof parsed.raw === "object" ? parsed.raw : {};

    const fitzpatrickType = normalizeFitzpatrick(parsed.fitzpatrickType);
    const skinType = normalizeSkinType(parsed.skinType);

    if (!analysis.complimentFeatures || typeof analysis.complimentFeatures !== "string") {
      analysis.complimentFeatures =
        "You have a calm, approachable presence — my goal is to help your skin reflect that same ease and radiance.";
    }

    if (!analysis.checklist15 || typeof analysis.checklist15 !== "object") {
      analysis.checklist15 = {
        "1_skinTypeCharacteristics": "",
        "2_textureSurfaceQuality": "",
        "3_pigmentationColor": "",
        "4_vascularCirculation": "",
        "5_acneCongestion": "",
        "6_agingPhotoaging": "",
        "7_inflammatoryClues": "",
        "8_barrierHealth": "",
        "9_structuralAnatomy": "",
        "10_lesionMapping": "",
        "11_lymphaticPuffiness": "",
        "12_lifestyleIndicators": "",
        "13_procedureHistoryClues": "",
        "14_hairScalpClues": "",
        "15_neckChestHands": "",
      };
    }

    // Authoritative locked numeric payload
    const clusters = buildClustersFromMetricScores(metricScores);
    const overall_score = computeOverallScore(clusters);

    return res.status(200).json({
      ok: true,
      raw,
      analysis,
      fitzpatrickType,
      skinType,

      report_id: makeReportId(),
      version: LOCKED_VERSION,
      generated_at: new Date().toISOString(),
      overall_score,
      clusters,
    });
  } catch (error) {
    console.error("Error in /api/analyzeImage:", error);
    return res.status(500).json({
      ok: false,
      error: "analyze_failed",
      message: "I’m having trouble analyzing the image right now. Please try again in a moment.",
    });
  }
};




