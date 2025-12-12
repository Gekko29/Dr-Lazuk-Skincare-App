// api/analyzeImage.js
// Vision-powered image analysis for the virtual skincare report.
//
// Accepts a face image (as a data URL or base64 URL) + optional notes,
// calls OpenAI's multimodal model to analyze the selfie, and returns:
//
// {
//   raw: {
//     wearingGlasses: boolean,
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
//     estheticRecommendations: string
//   },
//   fitzpatrickType: number (1–6)
// }
//
// This output is consumed by lib/analysis.js and then by api/generate-report.js.

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ error: 'Method not allowed. Use POST.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not set in the environment'
    });
  }

  try {
    const { imageBase64, notes } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        error: "Please provide 'imageBase64' (a data URL or image URL) for analysis."
      });
    }

    // We treat imageBase64 as an "image_url" – it can be a real URL or a data URL.
    const imageUrl = imageBase64;

    const systemPrompt = `
You are a cosmetic-only virtual assistant working alongside a dermatologist.
You are analyzing a single selfie (face photo) for COSMETIC and APPEARANCE purposes only.

STRICT RULES:
- DO NOT diagnose or name diseases (no "rosacea", "melasma", "eczema", "cancer", etc.).
- Only talk about cosmetic / visual aspects: redness, uneven tone, dryness, oiliness, texture, fine lines, etc.
- You are not giving medical advice. You are describing appearance-only patterns.

TASK:
From the image (and any text notes), infer cosmetic / visual features and return a JSON object
with the following shape ONLY (no extra keys):

{
  "raw": {
    "wearingGlasses": boolean,         // true if glasses clearly visible
    "eyeColor": string | null,         // e.g., "light blue", "brown", "hazel"
    "hairColor": string | null,        // e.g., "dark brown", "blonde", "black"
    "clothingColor": string | null,    // main visible top color: "pink", "white", "black", etc.
    "globalTexture": string | null,    // short phrase for global texture: "mostly smooth", "mildly uneven", etc.
    "tZonePores": boolean | null,      // true if T-zone pores visibly more prominent
    "pigmentType": string | null,      // short descriptor: "freckles", "sun-kissed", "scattered spots", etc.
    "fineLinesRegions": string | null  // short phrase: "around eyes", "forehead and between brows", etc.
  },

  "analysis": {
"complimentFeatures": string,           // Very warm, specific compliment based on what you SEE:
                                        // you MUST mention at least one concrete visible detail:
                                        // eyes, smile, glasses, hair, clothing color or pattern,
                                        // bouquet of flowers or object they are holding, or background vibe.
                                        // Example: "Your light blue eyes and gentle smile give you such an open, kind presence,
                                        // and the large bouquet of flowers you’re holding makes the whole image feel joyful and luminous."

    "skinFindings": string,                 // 2–4 sentences summarizing what the skin is "telling" you overall:
                                            // texture, evenness, glow, visible pores, general first impression.

    "texture": string,                      // 1–2 sentences focused on surface: smoothness, roughness, flakiness, etc.
    "poreBehavior": string,                 // 1–2 sentences about pores (T-zone vs cheeks, visibility, oiliness).

    "pigment": string,                      // 1–3 sentences about uneven tone, spots, freckles, sun-kissed areas,
                                            // and where they mainly appear (cheeks, forehead, etc.).

    "fineLinesAreas": string,               // 1–2 sentences focused on fine lines: where they show most (eyes, forehead, mouth),
                                            // and how they look for the age range.

    "elasticity": string,                   // 1–2 sentences about firmness, bounce, and contours:
                                            // e.g., early softening vs still very firm, subtle lower-face relaxation, etc.

    "eveningActive": string,                // 1–2 sentences recommending COSMETIC evening actives ONLY:
                                            // e.g., gentle retinoid, mandelic acid, polyhydroxy acids, etc.
                                            // Must be cautious, barrier-supportive, non-medical.

    "estheticRecommendations": string       // 1–3 sentences suggesting ESTHETIC services that could help:
                                            // e.g., facials, gentle peels, microneedling, PRP, RF, roller massage.
                                            // Cosmetic language only, no treatment of diseases.
  },

  "fitzpatrickType": number                 // 1,2,3,4,5, or 6 as your best estimate based on skin tone
                                            // and how easily they would likely burn vs tan.
}

Make the language warm, elegant, and encouraging — similar to a premium, kind, appearance-focused esthetic consultation.
Do NOT include any explanation text outside the JSON. Respond with valid JSON ONLY.
`.trim();

    const userText = `
Please analyze this face photo from a COSMETIC perspective only.

Additional notes (may be empty):
${notes || 'none provided'}
`.trim();

const completion = await client.chat.completions.create({
  model: 'gpt-4.1-mini',
  temperature: 0.4,
  max_tokens: 800,
  messages: [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',          // ✅ was: "input_text"
          text: userText
        },
        {
          type: 'image_url',     // ✅ was: "input_image"
          image_url: {           // ✅ wrap in object
            url: imageUrl        //    instead of image_url: imageUrl
          }
        }
      ]
    }
  ]
});

    const rawContent = completion.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error('Failed to parse JSON from vision model:', rawContent);
      return res.status(500).json({
        error:
          'Problem interpreting the image analysis. Please try again in a moment.'
      });
    }

    const analysis = parsed.analysis || {};
    const raw = parsed.raw || {};
    let fitzpatrickType = parsed.fitzpatrickType;

    // Ensure fitzpatrickType is a number 1–6, with fallback to 3 if invalid
    const numericFitz = Number(fitzpatrickType);
    if (!Number.isFinite(numericFitz) || numericFitz < 1 || numericFitz > 6) {
      fitzpatrickType = 3;
    } else {
      fitzpatrickType = numericFitz;
    }

    return res.status(200).json({
      raw,
      analysis,
      fitzpatrickType
    });
  } catch (error) {
    console.error('Error in /api/analyzeImage:', error);
    return res.status(500).json({
      error:
        'I’m having trouble analyzing the image right now. Please try again in a moment.'
    });
  }
}
