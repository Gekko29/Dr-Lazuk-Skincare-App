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

const path = require("path");
const crypto = require("crypto");
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
  if (!Array.isArray(d.clinical_interpretation_non_diagnostic)) d.clinical_interpretation_non_diagnostic = [];

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
// Upload image to a public URL for EMAIL rendering
// WHY: Many email clients block data: URLs in <img src="data:...">.
// Supports:
// - Cloudinary (recommended quick win)
// - Vercel Blob (optional)
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

      const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

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

      const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

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

  const keys = ["noChange10", "noChange20", "withCare10", "withCare20"];
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
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
  if (!photoDataUrl) {
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }

  const fitzText = fitzpatrickType
    ? `with Fitzpatrick type ${fitzpatrickType}`
    : "with a realistic skin tone and texture";

  const baseStyleNoChange =
    "ultra-realistic portrait, neutral expression, studio lighting, no makeup, no filters, no retouching, no beautification, no flattering bias, no skin smoothing, subtle signs of aging rendered honestly but respectfully, realistic pores and texture";
  const baseStyleWithCare =
    'ultra-realistic portrait, neutral expression, studio lighting, minimal/no makeup, no heavy filters, tasteful and slight "well-cared-for" bias allowed (subtle, not fake), realistic pores and texture, realistic aging but clearly supported by consistent skincare and sun protection (no plastic-smooth skin)';

  const prompts = {
    noChange10: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 10 years in the future if they do not meaningfully improve skincare — more pronounced fine lines, duller tone, more visible sun and lifestyle effects, still dignified and human. ${fitzText}. ${baseStyleNoChange}.`,
    noChange20: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 20 years in the future with minimal skincare support — deeper wrinkles, more sagging, more uneven pigment and sun markings, still dignified, no caricature. ${fitzText}. ${baseStyleNoChange}.`,
    withCare10: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 10 years in the future if they follow a gentle, consistent dermatologist-guided routine with sun protection — healthier glow, more even tone, refined texture, realistic aging but clearly well cared-for. ${fitzText}. ${baseStyleWithCare}.`,
    withCare20: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 20 years in the future with consistent skincare, sun protection, and healthy lifestyle — naturally aged but radiant, balanced skin, softened lines, graceful aging, no unrealistic perfection. ${fitzText}. ${baseStyleWithCare}.`,
  };

  try {
    return await generateEditsFromSelfie({ photoDataUrl, prompts, size: "1024x1024" });
  } catch (err) {
    console.error("Error generating selfie-based aging preview images:", err);
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
}
// -------------------------
// HTML block: Aging Preview Images (EMAIL)
// -------------------------
function buildAgingPreviewHtml(agingPreviewImages) {
  if (!agingPreviewImages) return "";

  const { noChange10, noChange20, withCare10, withCare20 } = agingPreviewImages || {};
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

  const [noChange10, noChange20, withCare10, withCare20] = await Promise.all([
    oneEdit(prompts.noChange10),
    oneEdit(prompts.noChange20),
    oneEdit(prompts.withCare10),
    oneEdit(prompts.withCare20),
  ]);

  return { noChange10, noChange20, withCare10, withCare20 };
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

    // Model choice: your call requested. Use env overrides, otherwise sensible defaults:
    // - Letter: strong text model (or fallback)
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

    // 5) Generate SELFIE-based aging preview images (then stabilize to public URLs)
    let agingPreviewImages = await generateAgingPreviewImages({
      ageRange: cleanAgeRange,
      primaryConcern: cleanPrimaryConcern,
      fitzpatrickType,
      photoDataUrl, // IMPORTANT: use original selfie dataURL as base for edits
    });

    agingPreviewImages = await normalizeAgingPreviewImagesToPublicUrls(agingPreviewImages);

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

            ${fitzpatrickSummary ? `<p style="font-size: 13px; color: #92400E; margin: 0;">${escapeHtml(fitzpatrickSummary)}</p>` : ""}
            ${fitzpatrickType ? renderFitzpatrickScaleHtml(fitzpatrickType) : ""}
            <p style="font-size: 11px; color: #92400E; margin-top: 8px;">This is a visual, cosmetic estimate only and is not a medical diagnosis.</p>
          </div>` : ""}

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

    // ADD: Include derm engine JSON for internal QA/trust (clinic only)
    const dermEngineClinicBlock = `
      <div style="margin-top: 14px; padding: 12px 14px; border-radius: 10px; border: 1px dashed #D1D5DB; background: #FAFAFA;">
        <p style="margin:0 0 8px 0; font-size: 12px; color: #374151;"><strong>Dermatology Engine (Structured JSON)</strong> — internal QA / audit snapshot</p>
        <pre style="margin:0; font-size: 11px; color: #111827; white-space: pre-wrap;">${escapeHtml(JSON.stringify(dermEngine || {}, null, 2))}</pre>
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

          ${fitzpatrickSummary ? `<p style="font-size: 13px; margin-bottom: 12px;"><strong>Fitzpatrick Summary:</strong> ${escapeHtml(fitzpatrickSummary)}</p>` : ""}

          <div style="margin: 12px 0 18px 0;">
            <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">Visitor photo:</p>
            <img src="${emailSafeSelfieUrl || photoDataUrl}" alt="Uploaded skin photo" style="max-width: 240px; width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
          </div>

          <div style="margin-top: 10px;">
            ${letterHtmlBody}
          </div>

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

    // Response to frontend
    return res.status(200).json({
      ok: true,
      report: reportText,
      fitzpatrickType: fitzpatrickType || null,
      fitzpatrickSummary: fitzpatrickSummary || null,
      agingPreviewImages,
      selfieUrlForEmail: emailSafeSelfieUrl || null,

      // ADD: Dermatology Engine payload (structured JSON)
      dermEngine: dermEngine || null,

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



