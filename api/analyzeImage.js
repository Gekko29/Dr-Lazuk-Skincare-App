// api/analyzeImage.js
// Vision-powered image analysis for the virtual skincare report.
//
// Accepts: { imageBase64, notes }
// - imageBase64 can be a data URL ("data:image/...;base64,...") or a normal https URL
//
// Returns (additive-safe):
// {
//   ok: true,
//   raw: { ... },
//   analysis: { ... checklist15 ... },
//   fitzpatrickType: number (1–6) | null,
//   skinType: "oily"|"dry"|"combination"|"normal"|null
// }
//
// Notes:
// - Cosmetic/appearance only (no disease naming / no diagnosis)
// - US-only geo gate (matches generate-report.js behavior)
// - Adds bodyParser size limit so selfies don’t 413/parse-fail on Next.js

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

async function getOpenAIClient() {
  const mod = await import("openai");
  const OpenAI = mod?.default || mod;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractJson(rawText) {
  const text = String(rawText || "").trim();

  // Strip ```json fences if present
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() || text;

  // Otherwise slice from first { to last }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return candidate.slice(start, end + 1).trim();
  }

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
  // Rough guardrail: extremely large base64 payloads can choke body parsing / memory
  return typeof s === "string" && s.startsWith("data:image/") && s.length > maxChars;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set in the environment" });
  }

  // US-only geo gate (align with /api/generate-report)
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

    const systemPrompt = `
You are a cosmetic-only virtual assistant working alongside a dermatologist.
You are analyzing a single selfie (face photo) for COSMETIC and APPEARANCE purposes only.

STRICT RULES:
- DO NOT diagnose or name diseases (no "rosacea", "melasma", "eczema", "psoriasis", "cancer", etc.).
- Only talk about cosmetic / visual aspects: redness, uneven tone, dryness, oiliness, texture, fine lines, pores, glow, puffiness.
- You are not giving medical advice. You are describing appearance-only patterns.
- Do not invent details you cannot see clearly.

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
  "skinType": "oily"|"dry"|"combination"|"normal"|null
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

    const completion = await client.chat.completions.create({
      model: visionModel,
      temperature: 0.25,
      max_tokens: 1200,
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
    const parsed = safeJsonParse(rawContent);

    if (!parsed) {
      console.error("Failed to parse JSON from vision model:", rawContent);
      return res.status(500).json({
        ok: false,
        error: "parse_failed",
        message: "Problem interpreting the image analysis. Please try again in a moment.",
      });
    }

    const analysis = parsed.analysis && typeof parsed.analysis === "object" ? parsed.analysis : {};
    const raw = parsed.raw && typeof parsed.raw === "object" ? parsed.raw : {};

    const fitzpatrickType = normalizeFitzpatrick(parsed.fitzpatrickType);
    const skinType = normalizeSkinType(parsed.skinType);

    // Minimal safety: ensure compliment exists (fallback only if model breaks)
    if (!analysis.complimentFeatures || typeof analysis.complimentFeatures !== "string") {
      analysis.complimentFeatures =
        "You have a calm, approachable presence — my goal is to help your skin reflect that same ease and radiance.";
    }

    // Ensure checklist15 exists (fallback scaffold if missing)
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

    return res.status(200).json({
      ok: true,
      raw,
      analysis,
      fitzpatrickType,
      skinType,
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



