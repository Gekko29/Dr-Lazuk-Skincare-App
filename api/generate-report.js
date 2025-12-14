// api/generate-report.js
// FINAL — Dr. Lazuk Virtual Skin Analysis Report (Vercel-safe CJS)
//
// Key updates implemented:
// ✅ Requires FIRST NAME + EMAIL + SELFIE (photoDataUrl is mandatory)
// ✅ Enforces "once every 30 days" per email (in-memory; swap to KV/DB for production)
// ✅ US-only geo gate
// ✅ Strong vision enrichment if incoming imageAnalysis is weak/missing
// ✅ Enforces greeting "Dear <firstName>,", bans "Dear You"
// ✅ Generates 4 aging preview images
// ✅ Fixes email image rendering by converting selfie dataURL -> PUBLIC URL (Cloudinary or Vercel Blob)
// ✅ Places the 4 aging images NEAR THE END of the letter: just above Dr. Lazuk’s closing note/signature
// ✅ Keeps CommonJS compatibility (no top-level ESM imports)

const path = require("path");
const { pathToFileURL } = require("url");

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
// UI helper: Fitzpatrick line
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
  // Convert double newlines into paragraph breaks
  const parts = safe.split(/\n\s*\n/g);
  return parts
    .map(
      (p) =>
        `<p style="margin: 0 0 12px 0; font-size: 13px; color: #111827; white-space: pre-wrap;">${p}</p>`
    )
    .join("");
}

// Insert aging preview block "near the end" — just above Dr. Lazuk’s closing lines.
// We do this by splitting at the last occurrence of the closing quote line.
function splitForAgingPlacement(reportText) {
  const t = String(reportText || "").trim();
  if (!t) return { before: "", closing: "" };

  const needle = "May your skin always glow as bright as your smile.";
  const idx = t.lastIndexOf(needle);

  if (idx === -1) {
    // If we can't find it, treat entire report as "before"
    return { before: t, closing: "" };
  }

  // Include the closing line + everything after it as "closing"
  const before = t.slice(0, idx).trimEnd();
  const closing = t.slice(idx).trimStart();
  return { before, closing };
}

// -------------------------
// Upload selfie dataURL to a public URL for EMAIL rendering
// WHY: Many email clients block data: URLs in <img src="data:...">.
// Supports:
// - Cloudinary (recommended quick win)
// - Vercel Blob (optional)
//
// If neither is configured, we fallback to dataURL (may not render in Gmail).
// -------------------------
function isDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:image/");
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

async function uploadToCloudinary(dataUrl) {
  // Requires:
  // CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return null;

  const form = new URLSearchParams();
  // Cloudinary supports sending the data URL directly as "file"
  form.set("file", dataUrl);

  // Signed upload
  const timestamp = Math.floor(Date.now() / 1000);
  form.set("timestamp", String(timestamp));
  form.set("folder", "drlazuk/visitor-selfies");

  // Signature: SHA1 of "folder=...&timestamp=..." + api_secret
  // Note: Use node crypto (built-in)
  const crypto = require("crypto");
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

async function uploadToVercelBlob(dataUrl) {
  // Optional: requires @vercel/blob and BLOB_READ_WRITE_TOKEN
  // Docs: https://vercel.com/docs/storage/vercel-blob
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;

    const { put } = await import("@vercel/blob");
    const buf = Buffer.from(parsed.b64, "base64");

    const ext = parsed.mime.includes("png")
      ? "png"
      : parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")
      ? "jpg"
      : "img";

    const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const out = await put(filename, buf, {
      access: "public",
      contentType: parsed.mime,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return out?.url || null;
  } catch (err) {
    console.error("Vercel Blob upload failed:", err);
    return null;
  }
}

async function ensureEmailSafeImageUrl(photoDataUrl) {
  if (!photoDataUrl) return null;

  // If it's already a normal URL, keep it.
  if (typeof photoDataUrl === "string" && !isDataUrl(photoDataUrl)) return photoDataUrl;

  // If it's a data URL, attempt to upload.
  if (isDataUrl(photoDataUrl)) {
    // Prefer Cloudinary if configured, else Vercel Blob
    const viaCloudinary = await uploadToCloudinary(photoDataUrl);
    if (viaCloudinary) return viaCloudinary;

    const viaBlob = await uploadToVercelBlob(photoDataUrl);
    if (viaBlob) return viaBlob;

    // Fallback (may not render in many email clients)
    console.warn("No image upload provider configured. Email clients may block data URLs.");
    return photoDataUrl;
  }

  return null;
}

// -------------------------
// 4 aging preview images
// -------------------------
async function generateAgingPreviewImages({ client, ageRange, primaryConcern, fitzpatrickType }) {
  const baseAgeText = ageRange ? `who is currently in the ${ageRange} age range` : "adult";
  const concernText = primaryConcern
    ? `with a primary cosmetic concern of ${primaryConcern}`
    : "with common cosmetic skin concerns";
  const fitzText = fitzpatrickType ? `with Fitzpatrick type ${fitzpatrickType}` : "with a realistic skin tone and texture";

  // Bias enforcement:
  const baseStyleNoChange =
    "ultra-realistic portrait, neutral expression, studio lighting, no makeup, no filters, no retouching, no beautification, no flattering bias, no skin smoothing, subtle signs of aging rendered honestly but respectfully, realistic pores and texture";
  const baseStyleWithCare =
    'ultra-realistic portrait, neutral expression, studio lighting, minimal/no makeup, no heavy filters, tasteful and slight "well-cared-for" bias allowed (subtle, not fake), realistic pores and texture, realistic aging but clearly supported by consistent skincare and sun protection (no plastic-smooth skin)';

  const prompts = {
    noChange10: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 10 years in the future if they do not meaningfully improve their skincare routine — more pronounced fine lines, duller tone, more visible sun and lifestyle effects, but still treated respectfully as a real human. ${baseStyleNoChange}.`,
    noChange20: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 20 years in the future with minimal skincare support — deeper wrinkles, more sagging, more uneven pigment and sun markings, but still dignified and human, no caricature. ${baseStyleNoChange}.`,
    withCare10: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 10 years in the future if they follow a gentle, consistent, dermatologist-guided skincare routine with sun protection, hydration, and barrier support — smoother texture, healthier glow, more even tone, realistic aging but clearly well cared-for skin. ${baseStyleWithCare}.`,
    withCare20: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 20 years in the future with consistent skincare, sun protection, and healthy lifestyle habits — naturally aged but radiant, balanced skin, softened lines, graceful aging, no unrealistic perfection. ${baseStyleWithCare}.`,
  };

  try {
    const size = "1024x1024";

    const [imgNo10, imgNo20, imgCare10, imgCare20] = await Promise.all([
      client.images.generate({ model: "gpt-image-1", prompt: prompts.noChange10, size }),
      client.images.generate({ model: "gpt-image-1", prompt: prompts.noChange20, size }),
      client.images.generate({ model: "gpt-image-1", prompt: prompts.withCare10, size }),
      client.images.generate({ model: "gpt-image-1", prompt: prompts.withCare20, size }),
    ]);

    return {
      noChange10: imgNo10?.data?.[0]?.url || null,
      noChange20: imgNo20?.data?.[0]?.url || null,
      withCare10: imgCare10?.data?.[0]?.url || null,
      withCare20: imgCare20?.data?.[0]?.url || null,
    };
  } catch (err) {
    console.error("Error generating aging preview images:", err);
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
}

function buildAgingPreviewHtml(agingPreviewImages) {
  if (!agingPreviewImages) return "";

  const { noChange10, noChange20, withCare10, withCare20 } = agingPreviewImages;

  if (!noChange10 && !noChange20 && !withCare10 && !withCare20) return "";

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

  const visionModel = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

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
}) {
  const ia = imageAnalysis || {};
  const raw = ia.raw || {};
  const vision = ia.analysis || {};

  const fitzRoman = mapFitzToRoman(ia.fitzpatrickType);

  const tags = [];
  if (raw.wearingGlasses) tags.push("glasses");

  // ✅ FIX: rawraw.eyeColor typo + remove odd replace hack
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
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ ok: false, error: "Method not allowed" });
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

    const {
      firstName,
      email,
      ageRange,
      primaryConcern,
      visitorQuestion,
      photoDataUrl,
      imageAnalysis: incomingImageAnalysis,
    } = req.body || {};

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

    // Enforce 30-day cooldown per email
    checkCooldownOrThrow(cleanEmail);

    const client = await getOpenAIClient();
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

    // 2) Build structured analysis context
    const analysisContext = await buildAnalysisContext({
      buildAnalysis,
      firstName: cleanFirstName,
      ageRange: cleanAgeRange,
      primaryConcern: cleanPrimaryConcern,
      visitorQuestion: cleanVisitorQuestion || null,
      photoDataUrl: emailSafeSelfieUrl || photoDataUrl,
      imageAnalysis,
    });

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

    // 3) Prompt: enforce name greeting + 15 categories + selfie detail
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

    const userPrompt = `
Person details:
- First name: ${cleanFirstName}
- Age range: ${cleanAgeRange}
- Primary cosmetic concern: ${cleanPrimaryConcern}
- Visitor question: ${cleanVisitorQuestion || "none provided"}

Structured analysis context (do NOT print JSON; weave it into the letter):
${JSON.stringify(analysisContext, null, 2)}

Raw image analysis (do NOT print JSON; use it to be specific):
${JSON.stringify(imageAnalysis || {}, null, 2)}

Important: Use only selfie details that appear in the provided context. Do NOT invent specifics.
`.trim();

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

    // 5) Generate aging preview images
    const agingPreviewImages = await generateAgingPreviewImages({
      client,
      ageRange: cleanAgeRange,
      primaryConcern: cleanPrimaryConcern,
      fitzpatrickType,
    });

    const agingPreviewHtml = buildAgingPreviewHtml(agingPreviewImages);

    // Place aging block near the end, just above Dr. Lazuk’s closing note/signature.
    const { before, closing } = splitForAgingPlacement(reportText);
    const letterHtmlBody =
      textToHtmlParagraphs(before) +
      (agingPreviewHtml ? agingPreviewHtml : "") +
      (closing ? textToHtmlParagraphs(closing) : "");

    // Visitor email HTML — selfie image ALWAYS included (mandatory)
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

          ${
            fitzpatrickType || fitzpatrickSummary
              ? `
          <div style="border: 1px solid #FCD34D; background-color: #FFFBEB; padding: 12px 16px; margin-bottom: 16px; border-radius: 8px;">
            <h2 style="font-size: 14px; font-weight: 700; color: #92400E; margin: 0 0 4px 0;">Fitzpatrick Skin Type (Cosmetic Estimate)</h2>
            ${fitzpatrickType ? `<p style="font-size: 13px; font-weight: 600; color: #92400E; margin: 0 0 4px 0;">Type ${fitzpatrickType}</p>` : ""}
            ${fitzpatrickSummary ? `<p style="font-size: 13px; color: #92400E; margin: 0;">${escapeHtml(fitzpatrickSummary)}</p>` : ""}
            ${fitzpatrickType ? renderFitzpatrickScaleHtml(fitzpatrickType) : ""}
            <p style="font-size: 11px; color: #92400E; margin-top: 8px;">This is a visual, cosmetic estimate only and is not a medical diagnosis.</p>
          </div>`
              : ""
          }

          <div style="margin-top: 10px;">
            ${letterHtmlBody}
          </div>

          <hr style="border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6B7280; margin-bottom: 4px;">If you have any medical concerns or skin conditions, please see a qualified in-person professional.</p>
          <p style="font-size: 12px; color: #6B7280; margin-bottom: 8px;">If you’d like in-person, customized care, our team at Dr. Lazuk Esthetics® in Georgia would be honored to see you.</p>
          <p style="font-size: 12px; color: #6B7280;">
            With care,<br/>
            Dr. Lazuk Esthetics® &amp; Dr. Lazuk Cosmetics®<br/>
            <a href="mailto:contact@skindoctor.ai" style="color: #111827; text-decoration: underline;">contact@skindoctor.ai</a>
          </p>
        </div>
      </div>
    `;

    // Clinic email HTML
    const clinicEmail = process.env.RESEND_CLINIC_EMAIL || "contact@skindoctor.ai";
    const safeConcern = cleanPrimaryConcern || "Not specified";

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

          ${fitzpatrickSummary ? `<p style="font-size: 13px; margin-bottom: 12px;"><strong>Fitzpatrick Summary:</strong> ${escapeHtml(fitzpatrickSummary)}</p>` : ""}

          <div style="margin: 12px 0 18px 0;">
            <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">Visitor photo:</p>
            <img src="${emailSafeSelfieUrl || photoDataUrl}" alt="Uploaded skin photo" style="max-width: 240px; width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
          </div>

          <div style="margin-top: 10px;">
            ${letterHtmlBody}
          </div>
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

    // Response to frontend
    return res.status(200).json({
      ok: true,
      report: reportText,
      fitzpatrickType: fitzpatrickType || null,
      fitzpatrickSummary: fitzpatrickSummary || null,
      agingPreviewImages,
      selfieUrlForEmail: emailSafeSelfieUrl || null,
      _debug: {
        usedIncomingImageAnalysis: !!incomingImageAnalysis,
        enrichedWithVision,
        emailSelfieIsDataUrl: isDataUrl(photoDataUrl),
        emailSelfieUploaded: !!emailSafeSelfieUrl && !isDataUrl(emailSafeSelfieUrl),
      },
    });
  } catch (err) {
    console.error("generate-report error:", err);

    // ✅ FIX: operator precedence bug
    const status = err?.status ? err.status : err?.code === "cooldown_active" ? 429 : 500;

    return res.status(status).json({
      ok: false,
      error: err?.code || "generate_report_failed",
      message: String(err?.message || "Something went wrong while generating the report."),
    });
  }
};

