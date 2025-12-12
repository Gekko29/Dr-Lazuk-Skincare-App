// api/analyzeImage.js
// Vision-powered image analysis for the virtual skincare report.
//
// Accepts { imageBase64, notes } where imageBase64 can be a data URL or a normal URL.
//
// Returns:
// {
//   raw: {
//     wearingGlasses: boolean | null,
//     eyeColor: string | null,
//     hairColor: string | null,
//     clothingColor: string | null,
//     globalTexture: string | null,
//     tZonePores: boolean | null,
//     pigmentType: string | null,
//     fineLinesRegions: string | null
//   },
//   analysis: {
//     complimentFeatures: string,
//     skinFindings: string,
//     texture: string,
//     poreBehavior: string,
//     pigment: string,
//     fineLinesAreas: string,
//     elasticity: string,
//     eveningActive: string,
//     estheticRecommendations: string,
//     checklist15: {
//       "1_skinTypeCharacteristics": string,
//       "2_textureSurfaceQuality": string,
//       "3_pigmentationColor": string,
//       "4_vascularCirculation": string,
//       "5_acneCongestion": string,
//       "6_agingPhotoaging": string,
//       "7_inflammatoryClues": string,
//       "8_barrierHealth": string,
//       "9_structuralAnatomy": string,
//       "10_lesionMapping": string,
//       "11_lymphaticPuffiness": string,
//       "12_lifestyleIndicators": string,
//       "13_procedureHistoryClues": string,
//       "14_hairScalpClues": string,
//       "15_neckChestHands": string
//     }
//   },
//   fitzpatrickType: number (1–6)
// }

async function getOpenAIClient() {
  const mod = await import('openai');
  const OpenAI = mod?.default || mod;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractJson(rawText) {
  const text = String(rawText || '').trim();

  // Strip ```json fences if present
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  // Otherwise, attempt to slice from first { to last }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text;
}

function normalizeFitzpatrick(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 6) return 3;
  return n;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set in the environment' });
  }

  try {
    const { imageBase64, notes } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        error: "Please provide 'imageBase64' (a data URL or image URL) for analysis."
      });
    }

    const client = await getOpenAIClient();

    // We treat imageBase64 as an image URL – it can be a real URL or a data URL.
    const imageUrl = imageBase64;

    const visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

    const systemPrompt = `
You are a cosmetic-only virtual assistant working alongside a dermatologist.
You are analyzing a single selfie (face photo) for COSMETIC and APPEARANCE purposes only.

STRICT RULES:
- DO NOT diagnose or name diseases (no "rosacea", "melasma", "eczema", "psoriasis", "cancer", etc.).
- Only talk about cosmetic / visual aspects: redness, uneven tone, dryness, oiliness, texture, fine lines, pores, glow, puffiness.
- You are not giving medical advice. You are describing appearance-only patterns.

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
  "fitzpatrickType": number
}

IMPORTANT REQUIREMENT FOR complimentFeatures:
- It MUST mention at least ONE concrete visible detail (examples: glasses, eye color, hair, clothing color/pattern, smile, an object, or background vibe).
- If you cannot confidently identify a detail like eye color, choose something you CAN see (e.g., glasses, hair, clothing, smile, lighting/background vibe).
`.trim();

    const userText = `
Please analyze this face photo from a COSMETIC perspective only.

Additional notes (may be empty):
${notes || 'none provided'}
`.trim();

    const completion = await client.chat.completions.create({
      model: visionModel,
      temperature: 0.25,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
    });

    const rawContent = completion.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(extractJson(rawContent));
    } catch (err) {
      console.error('Failed to parse JSON from vision model:', rawContent);
      return res.status(500).json({
        error: 'Problem interpreting the image analysis. Please try again in a moment.'
      });
    }

    const analysis = parsed.analysis || {};
    const raw = parsed.raw || {};

    const fitzpatrickType = normalizeFitzpatrick(parsed.fitzpatrickType);

    // Minimal safety: ensure compliment exists (fallback only if model breaks)
    if (!analysis.complimentFeatures || typeof analysis.complimentFeatures !== 'string') {
      analysis.complimentFeatures =
        'Your expression has a calm, approachable warmth to it — my goal is to help your skin reflect that same ease and radiance.';
    }

    // Ensure checklist15 exists (fallback scaffold if missing)
    if (!analysis.checklist15 || typeof analysis.checklist15 !== 'object') {
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
        "15_neckChestHands": ""
      };
    }

    return res.status(200).json({
      raw,
      analysis,
      fitzpatrickType
    });
  } catch (error) {
    console.error('Error in /api/analyzeImage:', error);
    return res.status(500).json({
      error: 'I’m having trouble analyzing the image right now. Please try again in a moment.'
    });
  }
};

