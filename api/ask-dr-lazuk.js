// api/ask-dr-lazuk.js
// CommonJS-safe (no top-level ESM imports) + optional vision selfie analysis
// + brand-locked products/services + cosmetic-only language safeguards.

const path = require("path");
const { pathToFileURL } = require("url");

// -------------------------
// Helpers: dynamic imports
// -------------------------
async function getOpenAIClient() {
  const mod = await import("openai");
  const OpenAI = mod?.default || mod;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// -------------------------
// Rate limiting (in-memory)
// -------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 30;

function getRateLimitStore() {
  if (!globalThis.__ASK_DR_LAZUK_RATE_STORE__) {
    globalThis.__ASK_DR_LAZUK_RATE_STORE__ = new Map();
  }
  return globalThis.__ASK_DR_LAZUK_RATE_STORE__;
}

function getClientId(req) {
  const headerIp =
    req.headers["x-real-ip"] ||
    (Array.isArray(req.headers["x-real-ip"]) ? req.headers["x-real-ip"][0] : null) ||
    req.headers["x-forwarded-for"] ||
    (Array.isArray(req.headers["x-forwarded-for"]) ? req.headers["x-forwarded-for"][0] : null);

  const ip = (headerIp || "").toString().split(",")[0].trim() || "unknown_ip";

  const userKey =
    (req.headers["x-user-key"] && req.headers["x-user-key"].toString().trim()) || "";

  return userKey ? `${ip}:${userKey}` : ip;
}

function isRateLimited(req) {
  const store = getRateLimitStore();
  const clientId = getClientId(req);
  const now = Date.now();

  const existing = store.get(clientId);
  if (!existing) {
    store.set(clientId, { count: 1, start: now });
    return false;
  }

  if (now - existing.start > RATE_LIMIT_WINDOW_MS) {
    store.set(clientId, { count: 1, start: now });
    return false;
  }

  existing.count += 1;
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

// -------------------------
// Brand-locked lists
// -------------------------
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

// -------------------------
// Optional: Vision selfie analysis (15-point cosmetic checklist)
// -------------------------
function safeJsonExtract(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function analyzeSelfieWithVision({ client, photoDataUrl, userQuestion }) {
  if (!photoDataUrl) return null;

  const visionModel = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

  const prompt = `
You are a dermatologist providing a COSMETIC / APPEARANCE-ONLY analysis from ONE selfie.
Return ONLY strict JSON (no markdown, no commentary).

Rules:
- Cosmetic/visual only. Do not diagnose diseases.
- Do NOT use medical condition names (no rosacea, melasma, eczema, psoriasis, cancer, etc).
- Extract concrete selfie cues when possible (glasses? eye color? hair color? clothing color?).
- Be tasteful and kind. No fear-based language. No shame.

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
    "complimentFeatures": "string (must reference one real visible detail)",
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
      "10_lesionMapping": "string (visual-only; recommend in-person eval for anything concerning)",
      "11_lymphaticPuffiness": "string",
      "12_lifestyleIndicators": "string (gentle, non-judgmental)",
      "13_procedureHistoryClues": "string",
      "14_hairScalpClues": "string",
      "15_neckChestHands": "string"
    }
  }
}

User’s question context (may help you focus, but do not diagnose): ${userQuestion || "none"}
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
    return safeJsonExtract(text);
  } catch (err) {
    console.error("ask-dr-lazuk vision error:", err);
    return null;
  }
}

// -------------------------
// Handler (CJS export)
// -------------------------
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is not set in the environment",
    });
  }

  // US-only geo restriction (match generate-report)
  const country = req.headers["x-vercel-ip-country"];
  if (country && country !== "US") {
    return res.status(403).json({
      ok: false,
      error: "geo_restricted",
      message:
        "The Dr. Lazuk virtual skincare assistant chat is currently available to U.S. visitors only.",
    });
  }

  // Rate limit
  if (isRateLimited(req)) {
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      message:
        "You’ve reached the current chat request limit. Please wait a little while before trying again.",
    });
  }

  const { messages, isFirstReply, photoDataUrl } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_body",
      message: "messages array is required",
    });
  }

  // Normalize messages
  const normalized = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  // Extract most recent user question for context
  const lastUser = [...normalized].reverse().find((m) => m.role === "user");
  const userQuestion = lastUser?.content || "";

  const client = await getOpenAIClient();

  // Optional vision analysis if photo provided
  let vision = null;
  if (photoDataUrl) {
    vision = await analyzeSelfieWithVision({
      client,
      photoDataUrl,
      userQuestion,
    });
  }

  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics® in Johns Creek, Georgia.

NON-NEGOTIABLE SAFETY / SCOPE:
- This chat is for GENERAL COSMETIC EDUCATION and ENTERTAINMENT only.
- Do NOT diagnose or name medical diseases/conditions.
- Do NOT claim cures.
- Do NOT advise stopping/changing prescription medication.
- If a user describes urgent/severe symptoms, recommend prompt in-person evaluation.

LANGUAGE GUARDRAILS:
- Avoid medical disease names (e.g., rosacea, melasma, eczema, psoriasis, cancer).
- Speak in appearance-based terms: redness, uneven tone, dryness, oiliness, texture, fine lines, visible spots, irritation, etc.

TONE:
- Warm, clear, elegant, reassuring, and practical.
- Speak as "I" to "you". No robotic checklists.
- If a selfie analysis is provided, reference ONE concrete visible detail (glasses/eye color/hair/clothing color) only if present in the analysis.

BRAND / RECOMMENDATIONS:
- When recommending products, ONLY use this list:
${productList}

- When suggesting services, ONLY use this list:
${serviceList}

If the user asks for something outside these lists, explain you’ll keep it general and offer on-brand alternatives.
`.trim();

  // If vision exists, inject it as hidden context for specificity
  const visionContextMessage = vision
    ? {
        role: "system",
        content: `
Selfie-based cosmetic context (do NOT output as JSON; use only to personalize tone and observations):
${JSON.stringify(vision, null, 2)}
`.trim(),
      }
    : null;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...(visionContextMessage ? [visionContextMessage] : []),
    ...normalized,
  ];

  try {
    const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";

    const completion = await client.chat.completions.create({
      model: textModel,
      messages: chatMessages,
      max_tokens: 900,
      temperature: 0.7,
    });

    let reply =
      completion?.choices?.[0]?.message?.content ||
      "I’m sorry, I wasn’t able to generate a response just now.";

    // Prepend disclaimer only for first reply
    if (isFirstReply) {
      const disclaimer =
        "Important: This conversation is for general cosmetic education and entertainment only and is not medical advice. For any personal or urgent concerns, please see a licensed medical professional.\n\n";
      reply = disclaimer + reply;
    }

    return res.status(200).json({
      ok: true,
      reply,
      // Optional debug + vision summary (kept small)
      _debug: {
        visionUsed: !!vision,
        hasPhoto: !!photoDataUrl,
        model: textModel,
      },
      vision: vision
        ? {
            fitzpatrickType: vision.fitzpatrickType ?? null,
            skinType: vision.skinType ?? null,
            raw: vision.raw ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error("ask-dr-lazuk error:", error);
    return res.status(500).json({
      ok: false,
      error: "openai_request_failed",
      message: String(error?.message || error),
    });
  }
};


