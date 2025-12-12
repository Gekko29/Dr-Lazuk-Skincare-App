// api/generate-report.js
// NOTE: This file intentionally avoids top-level ESM imports so it works in Vercel
// environments that treat /api as CommonJS by default (no "type":"module" required).

const path = require('path');
const { pathToFileURL } = require('url');

// -------------------------
// Helpers: dynamic imports
// -------------------------
async function getOpenAIClient() {
  const mod = await import('openai');
  const OpenAI = mod?.default || mod;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getBuildAnalysis() {
  // Load ../lib/analysis.js (ESM) safely from CJS
  const fileUrl = pathToFileURL(path.join(__dirname, '..', 'lib', 'analysis.js')).href;
  const mod = await import(fileUrl);
  return mod.buildAnalysis;
}

// -------------------------
// UI helper: Fitzpatrick line
// -------------------------
function renderFitzpatrickScaleHtml(type) {
  if (!type) return '';
  const types = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const normalized = String(type).toUpperCase();
  const line = types
    .map((t) => (t === normalized ? `<strong>${t}</strong>` : t))
    .join(' · ');
  return `<p style="font-size: 12px; color: #92400E; margin-top: 6px;">
    Cosmetic Fitzpatrick scale: ${line}
  </p>`;
}

// -------------------------
// Email (Resend)
// -------------------------
async function sendEmailWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || 'Dr. Lazuk Esthetics <no-reply@drlazuk.com>';

  if (!apiKey) {
    console.error('RESEND_API_KEY is not set; skipping email send.');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html })
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Resend email error:', res.status, body);
    }
  } catch (err) {
    console.error('Resend email exception:', err);
  }
}

// -------------------------
// 4 aging preview images
// -------------------------
async function generateAgingPreviewImages({ client, ageRange, primaryConcern, fitzpatrickType }) {
  if (!process.env.OPENAI_API_KEY) {
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }

  const baseAgeText = ageRange ? `who is currently in the ${ageRange} age range` : 'adult';
  const concernText = primaryConcern
    ? `with a primary cosmetic concern of ${primaryConcern}`
    : 'with common cosmetic skin concerns';
  const fitzText = fitzpatrickType
    ? `with Fitzpatrick type ${fitzpatrickType}`
    : 'with a realistic skin tone and texture';

  // ✅ Bias enforcement (as requested):
  // - NO-CHANGE = no beautification / no flattering bias (honest rendering)
  // - WITH-CARE = slight, tasteful beautification bias (still realistic, no "perfect skin")
  const baseStyleNoChange =
    'ultra-realistic portrait, neutral expression, studio lighting, no makeup, no filters, no retouching, no beautification, no flattering bias, no skin smoothing, subtle signs of aging rendered honestly but respectfully, realistic pores and texture';
  const baseStyleWithCare =
    'ultra-realistic portrait, neutral expression, studio lighting, minimal/no makeup, no heavy filters, tasteful and slight "well-cared-for" bias allowed (subtle, not fake), realistic pores and texture, realistic aging but clearly supported by consistent skincare and sun protection (no plastic-smooth skin)';

  const prompts = {
    noChange10: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 10 years in the future if they do not meaningfully improve their skincare routine — more pronounced fine lines, duller tone, more visible sun and lifestyle effects, but still treated respectfully as a real human. ${baseStyleNoChange}.`,
    noChange20: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 20 years in the future with minimal skincare support — deeper wrinkles, more sagging, more uneven pigment and sun markings, but still dignified and human, no caricature. ${baseStyleNoChange}.`,
    withCare10: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 10 years in the future if they follow a gentle, consistent, dermatologist-guided skincare routine with sun protection, hydration, and barrier support — smoother texture, healthier glow, more even tone, realistic aging but clearly well cared-for skin. ${baseStyleWithCare}.`,
    withCare20: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 20 years in the future with consistent skincare, sun protection, and healthy lifestyle habits — naturally aged but radiant, balanced skin, softened lines, graceful aging, no unrealistic perfection. ${baseStyleWithCare}.`
  };

  try {
    // ✅ Required image size (per prior error + your requirement)
    const size = '1024x1024';

    const [imgNo10, imgNo20, imgCare10, imgCare20] = await Promise.all([
      client.images.generate({ model: 'gpt-image-1', prompt: prompts.noChange10, size }),
      client.images.generate({ model: 'gpt-image-1', prompt: prompts.noChange20, size }),
      client.images.generate({ model: 'gpt-image-1', prompt: prompts.withCare10, size }),
      client.images.generate({ model: 'gpt-image-1', prompt: prompts.withCare20, size })
    ]);

    return {
      noChange10: imgNo10?.data?.[0]?.url || null,
      noChange20: imgNo20?.data?.[0]?.url || null,
      withCare10: imgCare10?.data?.[0]?.url || null,
      withCare20: imgCare20?.data?.[0]?.url || null
    };
  } catch (err) {
    console.error('Error generating aging preview images:', err);
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
}

// -------------------------
// Vision analysis (enforced)
// -------------------------
function isLikelyWeakImageAnalysis(imageAnalysis) {
  if (!imageAnalysis || typeof imageAnalysis !== 'object') return true;
  const a = imageAnalysis.analysis || {};
  // If nothing meaningful exists, it’s weak.
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

async function analyzeSelfieWithVision({ client, photoDataUrl, ageRange, primaryConcern }) {
  if (!photoDataUrl) return null;

  // Use a vision-capable model for analysis
  const visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

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
- Age range: ${ageRange || 'unknown'}
- Primary cosmetic concern: ${primaryConcern || 'unknown'}
`.trim();

  try {
    const resp = await client.chat.completions.create({
      model: visionModel,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: photoDataUrl } }
          ]
        }
      ]
    });

    const text = resp?.choices?.[0]?.message?.content || '';
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return parsed;
  } catch (err) {
    console.error('Vision analysis error:', err);
    return null;
  }
}

// -------------------------
// Build analysis context for LLM
// -------------------------
function mapFitzToRoman(value) {
  if (typeof value === 'number') {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    return romans[value - 1] || null;
  }
  if (typeof value === 'string') {
    const up = value.toUpperCase();
    if (['I', 'II', 'III', 'IV', 'V', 'VI'].includes(up)) return up;
  }
  return null;
}

async function buildAnalysisContext({
  buildAnalysis,
  ageRange,
  primaryConcern,
  visitorQuestion,
  photoDataUrl,
  imageAnalysis
}) {
  const ia = imageAnalysis || {};
  const raw = ia.raw || {};
  const vision = ia.analysis || {};

  const fitzRoman = mapFitzToRoman(ia.fitzpatrickType);

  const tags = [];
  if (raw.wearingGlasses) tags.push('glasses');
  if (raw.eyeColor && raw.eyeColor !== 'unknown') tags.push(`${raw.eyeColor} eyes`);
  if (raw.clothingColor && raw.clothingColor !== 'unknown') tags.push(`${raw.clothingColor} top`);

  // Keep shape consistent with your existing lib/analysis expectations
  const form = {
    firstName: null,
    age: null,
    skinType: ia.skinType || null,
    fitzpatrickType: fitzRoman,
    primaryConcerns: primaryConcern ? [primaryConcern] : [],
    secondaryConcerns: [],
    routineLevel: ia.routineLevel || 'standard',
    budgetLevel: ia.budgetLevel || 'mid-range',
    currentRoutine: visitorQuestion || null,
    lifestyle: ia.lifestyle || null,
    ageRange: ageRange || null
  };

  const selfie = {
    url: photoDataUrl || null,
    tags,
    dominantColor: raw.clothingColor === 'pink' ? 'soft pink' : null,
    eyeColor: raw.eyeColor || null,
    hairColor: raw.hairColor || null,
    compliment: vision.complimentFeatures || null
  };

  // Put the 15-point analysis into a single “vision” payload so the report can’t ignore it
  const visionPayload = {
    issues: [],
    strengths: [],
    texture: vision.texture || null,
    overallGlow: vision.skinFindings || null,
    checklist15: vision.checklist15 || null,
    poreBehavior: vision.poreBehavior || null,
    pigment: vision.pigment || null,
    fineLinesAreas: vision.fineLinesAreas || null,
    elasticity: vision.elasticity || null
  };

  return buildAnalysis({ form, selfie, vision: visionPayload });
}

// -------------------------
// Output enforcement / validation
// -------------------------
function stripInternalLines(text) {
  return String(text || '')
    .replace(/^\s*INTERNAL_COVERAGE:[^\n]*\n?/gm, '')
    .replace(/^\s*INTERNAL_SELFIE_DETAIL_OK:[^\n]*\n?/gm, '')
    .trim();
}

function hasCoverageLine(text) {
  return /INTERNAL_COVERAGE:\s*OK/i.test(text || '');
}

function hasSelfieDetailOkLine(text) {
  return /INTERNAL_SELFIE_DETAIL_OK:\s*YES/i.test(text || '');
}

// -------------------------
// Handler
// -------------------------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not set in the environment' });
  }

  // Geo-gate to US only
  const country = req.headers['x-vercel-ip-country'];
  if (country && country !== 'US') {
    return res.status(403).json({
      ok: false,
      error: 'geo_blocked',
      message: 'This virtual skincare analysis is currently available only to visitors in the United States.'
    });
  }

  const {
    email,
    ageRange,
    primaryConcern,
    visitorQuestion,
    photoDataUrl,
    imageAnalysis: incomingImageAnalysis
  } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (!ageRange || !primaryConcern) {
    return res.status(400).json({
      ok: false,
      error: 'missing_fields',
      message: 'Age range and primary concern are required.'
    });
  }

  const client = await getOpenAIClient();
  const buildAnalysis = await getBuildAnalysis();

  // 1) Ensure we have strong image analysis
  let imageAnalysis = incomingImageAnalysis || null;
  let enrichedWithVision = false;

  if ((!imageAnalysis || isLikelyWeakImageAnalysis(imageAnalysis)) && photoDataUrl) {
    const visionResult = await analyzeSelfieWithVision({
      client,
      photoDataUrl,
      ageRange,
      primaryConcern
    });

    if (visionResult) {
      imageAnalysis = visionResult;
      enrichedWithVision = true;
    }
  }

  // 2) Build structured context (your lib/analysis.js + enriched vision payload)
  const analysisContext = await buildAnalysisContext({
    buildAnalysis,
    ageRange,
    primaryConcern,
    visitorQuestion,
    photoDataUrl,
    imageAnalysis
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

  // 3) Prompt: one continuous letter, but must cover 15 categories.
  //    We enforce this with INTERNAL_COVERAGE + INTERNAL_SELFIE_DETAIL_OK lines, then strip them.
  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics®.

VOICE & STYLE (NON-NEGOTIABLE):
- Write as "I" speaking directly to "you" in a warm, elegant, deeply human tone.
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
1) Your letter MUST reference at least ONE concrete selfie detail from the provided context:
   glasses, eye color, hair, clothing color, or another visible detail.
2) Your letter MUST incorporate the 15-point dermatologist visual analysis categories below,
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

FINAL TWO LINES (INTERNAL, MUST INCLUDE — I will remove them before sending):
INTERNAL_SELFIE_DETAIL_OK: YES
INTERNAL_COVERAGE: OK
`.trim();

  const userPrompt = `
Person details:
- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question: ${visitorQuestion || 'none provided'}

Structured analysis context (do NOT print JSON; weave it into the letter):
${JSON.stringify(analysisContext, null, 2)}

Raw image analysis (do NOT print JSON; use it to be specific):
${JSON.stringify(imageAnalysis || {}, null, 2)}

Important: If you do not have enough selfie detail, use what's available (tags like glasses/eye color/clothing).
If still missing, politely mention what you can see (lighting, overall vibe) without inventing specifics.
`.trim();

  // 4) Generate with enforcement retries
  const textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';

  let full = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const completion = await client.chat.completions.create({
      model: textModel,
      temperature: attempt === 1 ? 0.55 : 0.4,
      max_tokens: 2100,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    full = completion.choices?.[0]?.message?.content || '';
    if (hasCoverageLine(full) && hasSelfieDetailOkLine(full)) break;

    console.warn('Report validation failed, retrying...', {
      attempt,
      hasCoverage: hasCoverageLine(full),
      hasSelfieDetail: hasSelfieDetailOkLine(full)
    });
  }

  // Parse FITZPATRICK_TYPE and FITZPATRICK_SUMMARY
  let fitzpatrickType = null;
  let fitzpatrickSummary = null;
  let reportText = full;

  const typeMatch = full.match(/FITZPATRICK_TYPE:\s*([IVX]+)/i);
  if (typeMatch) {
    fitzpatrickType = typeMatch[1].toUpperCase();
    reportText = reportText.replace(typeMatch[0], '');
  }

  const summaryMatch = full.match(/FITZPATRICK_SUMMARY:\s*([\s\S]*?)(\n\s*\n|$)/i);
  if (summaryMatch) {
    fitzpatrickSummary = summaryMatch[1].trim();
    reportText = reportText.replace(summaryMatch[0], '');
  }

  reportText = stripInternalLines(reportText).trim();
  const safeConcern = primaryConcern || 'Not specified';

  // 5) 4 aging images (kept)
  const agingPreviewImages = await generateAgingPreviewImages({
    client,
    ageRange,
    primaryConcern,
    fitzpatrickType
  });

  // Build aging preview HTML (kept)
  let agingPreviewHtml = '';
  if (
    agingPreviewImages.noChange10 ||
    agingPreviewImages.noChange20 ||
    agingPreviewImages.withCare10 ||
    agingPreviewImages.withCare20
  ) {
    agingPreviewHtml = `
      <div style="margin-top: 24px; padding: 16px 16px 18px; border-radius: 10px; border: 1px solid #E5E7EB; background-color: #F9FAFB;">
        <h2 style="font-size: 15px; font-weight: 700; margin: 0 0 8px;">
          Your Skin’s Future Story — A Preview
        </h2>
        <p style="font-size: 12px; color: #4B5563; margin: 0 0 10px;">
          These images are AI-generated visualizations created for cosmetic education and entertainment only.
          They are not medical predictions and may not reflect your actual future appearance.
          Their purpose is simply to show how lifestyle and skincare choices might influence the overall impression of aging over time.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 8px;">
          ${
            agingPreviewImages.noChange10
              ? `
          <div>
            <img src="${agingPreviewImages.noChange10}" alt="Approximate 10-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
            <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">~10 years – minimal skincare changes</p>
          </div>`
              : ''
          }
          ${
            agingPreviewImages.noChange20
              ? `
          <div>
            <img src="${agingPreviewImages.noChange20}" alt="Approximate 20-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
            <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">~20 years – minimal skincare changes</p>
          </div>`
              : ''
          }
          ${
            agingPreviewImages.withCare10
              ? `
          <div>
            <img src="${agingPreviewImages.withCare10}" alt="Approximate 10-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
            <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">~10 years – with consistent care</p>
          </div>`
              : ''
          }
          ${
            agingPreviewImages.withCare20
              ? `
          <div>
            <img src="${agingPreviewImages.withCare20}" alt="Approximate 20-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
            <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">~20 years – with consistent care</p>
          </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  // Visitor email HTML (kept)
  const visitorHtml = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 20px;">
      <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">Your Dr. Lazuk Virtual Skin Analysis</h1>
        <p style="font-size: 13px; color: #4B5563; margin-bottom: 14px;">
          Thank you for trusting us with this cosmetic, education-only look at your skin.
          This is not medical advice, and no medical conditions are being evaluated or treated.
        </p>

        ${
          photoDataUrl
            ? `
        <div style="margin: 12px 0 18px 0; text-align: left;">
          <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">The photo you shared:</p>
          <img src="${photoDataUrl}" alt="Your uploaded skin photo" style="max-width: 210px; border-radius: 10px; border: 1px solid #E5E7EB;" />
        </div>`
            : ''
        }

        ${
          fitzpatrickType || fitzpatrickSummary
            ? `
        <div style="border: 1px solid #FCD34D; background-color: #FFFBEB; padding: 12px 16px; margin-bottom: 16px; border-radius: 8px;">
          <h2 style="font-size: 14px; font-weight: 700; color: #92400E; margin: 0 0 4px 0;">Fitzpatrick Skin Type (Cosmetic Estimate)</h2>
          ${
            fitzpatrickType
              ? `<p style="font-size: 13px; font-weight: 600; color: #92400E; margin: 0 0 4px 0;">Type ${fitzpatrickType}</p>`
              : ''
          }
          ${
            fitzpatrickSummary
              ? `<p style="font-size: 13px; color: #92400E; margin: 0;">${fitzpatrickSummary}</p>`
              : ''
          }
          ${fitzpatrickType ? renderFitzpatrickScaleHtml(fitzpatrickType) : ''}
          <p style="font-size: 11px; color: #92400E; margin-top: 8px;">This is a visual, cosmetic estimate only and is not a medical diagnosis.</p>
        </div>`
            : ''
        }

        ${agingPreviewHtml}

        <pre style="white-space: pre-wrap; font-size: 13px; margin-top: 16px; color: #111827;">${reportText}</pre>

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

  // Clinic email HTML (kept)
  const clinicEmail = process.env.RESEND_CLINIC_EMAIL || 'contact@drlazuk.com';

  const clinicHtml = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 16px;">
      <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
        <h1 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">New Virtual Skin Analysis – Cosmetic Report</h1>
        <p style="font-size: 13px; color: #4B5563; margin-bottom: 8px;">A visitor completed the Dr. Lazuk virtual skin analysis.</p>
        <ul style="font-size: 13px; color: #374151; margin-bottom: 12px; padding-left: 18px;">
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Age Range:</strong> ${ageRange}</li>
          <li><strong>Primary Concern:</strong> ${safeConcern}</li>
          ${fitzpatrickType ? `<li><strong>Fitzpatrick Estimate:</strong> Type ${fitzpatrickType}</li>` : ''}
        </ul>
        ${fitzpatrickSummary ? `<p style="font-size: 13px; margin-bottom: 12px;"><strong>Fitzpatrick Summary:</strong> ${fitzpatrickSummary}</p>` : ''}

        ${
          photoDataUrl
            ? `
        <div style="margin: 12px 0 18px 0;">
          <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">Visitor photo (data URL):</p>
          <img src="${photoDataUrl}" alt="Uploaded skin photo" style="max-width: 210px; border-radius: 10px; border: 1px solid #E5E7EB;" />
        </div>`
            : ''
        }

        ${agingPreviewHtml}

        <hr style="border-top: 1px solid #E5E7EB; margin: 16px 0;" />
        <pre style="white-space: pre-wrap; font-size: 13px; color: #111827;">${reportText}</pre>
      </div>
    </div>
  `;

  // Send visitor + clinic emails
  await Promise.all([
    sendEmailWithResend({
      to: email,
      subject: 'Your Dr. Lazuk Virtual Skin Analysis Report',
      html: visitorHtml
    }),
    sendEmailWithResend({
      to: clinicEmail,
      subject: 'New Skincare Analysis Guest',
      html: clinicHtml
    })
  ]);

  // Response to frontend
  return res.status(200).json({
    ok: true,
    report: reportText,
    fitzpatrickType: fitzpatrickType || null,
    fitzpatrickSummary: fitzpatrickSummary || null,
    agingPreviewImages,
    // Helpful for debugging: confirms whether we had/enriched image analysis
    _debug: {
      usedIncomingImageAnalysis: !!incomingImageAnalysis,
      enrichedWithVision
    }
  });
};



