// api/generate-report.js
import OpenAI from 'openai';
import { buildAnalysis } from '../lib/analysis'; // lib/analysis.js is at project root

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Small helper to render a simple Fitzpatrick scale line in HTML
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

// Helper to send email using Resend
async function sendEmailWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    'Dr. Lazuk Esthetics <no-reply@drlazuk.com>'; // ✅ default to verified domain

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
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html
      })
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Resend email error:', res.status, body);
    }
  } catch (err) {
    console.error('Resend email exception:', err);
  }
}

/**
 * Generate 4 AI "future you" images using OpenAI Images
 */
async function generateAgingPreviewImages({ ageRange, primaryConcern, fitzpatrickType }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      noChange10: null,
      noChange20: null,
      withCare10: null,
      withCare20: null
    };
  }

  const baseAgeText = ageRange ? `who is currently in the ${ageRange} age range` : 'adult';
  const concernText = primaryConcern
    ? `with a primary cosmetic concern of ${primaryConcern}`
    : 'with common cosmetic skin concerns';
  const fitzText = fitzpatrickType
    ? `with Fitzpatrick type ${fitzpatrickType}`
    : 'with a realistic skin tone and texture';

  const baseStyle =
    'ultra-realistic portrait, neutral expression, studio lighting, no makeup, no filters, no beautification, subtle signs of aging rendered honestly but respectfully';

  const prompts = {
    noChange10: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 10 years in the future if they do not meaningfully improve their skincare routine — more pronounced fine lines, duller tone, more visible sun and lifestyle effects, but still treated respectfully as a real human. ${baseStyle}.`,
    noChange20: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 20 years in the future with minimal skincare support — deeper wrinkles, more sagging, more uneven pigment and sun markings, but still dignified and human, no caricature. ${baseStyle}.`,
    withCare10: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 10 years in the future if they follow a gentle, consistent, dermatologist-guided skincare routine with sun protection, hydration, and barrier support — smoother texture, healthier glow, more even tone, realistic aging but clearly well cared-for skin. ${baseStyle}.`,
    withCare20: `A ${baseAgeText} ${concernText}, ${fitzText}, imagined about 20 years in the future with consistent skincare, sun protection, and healthy lifestyle habits — naturally aged but radiant, balanced skin, softened lines, graceful aging, no unrealistic perfection. ${baseStyle}.`
  };

  try {
    const size = '1024x1024'; // ✅ OpenAI-supported size

    const [imgNo10, imgNo20, imgCare10, imgCare20] = await Promise.all([
      client.images.generate({
        model: 'gpt-image-1',
        prompt: prompts.noChange10,
        size
      }),
      client.images.generate({
        model: 'gpt-image-1',
        prompt: prompts.noChange20,
        size
      }),
      client.images.generate({
        model: 'gpt-image-1',
        prompt: prompts.withCare10,
        size
      }),
      client.images.generate({
        model: 'gpt-image-1',
        prompt: prompts.withCare20,
        size
      })
    ]);

    return {
      noChange10: imgNo10?.data?.[0]?.url || null,
      noChange20: imgNo20?.data?.[0]?.url || null,
      withCare10: imgCare10?.data?.[0]?.url || null,
      withCare20: imgCare20?.data?.[0]?.url || null
    };
  } catch (err) {
    console.error('Error generating aging preview images:', err);
    return {
      noChange10: null,
      noChange20: null,
      withCare10: null,
      withCare20: null
    };
  }
}

// Helper: map imageAnalysis (from /api/analyzeImage) into the shape lib/analysis.js expects
function buildAnalysisContext({
  ageRange,
  primaryConcern,
  visitorQuestion,
  photoDataUrl,
  imageAnalysis
}) {
  const ia = imageAnalysis || {};
  const raw = ia.raw || {};
  const vision = ia.analysis || {};

  // Map numeric Fitzpatrick (1–6) to Roman "I"–"VI" if present
  let fitzRoman = null;
  if (typeof ia.fitzpatrickType === 'number') {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    fitzRoman = romans[ia.fitzpatrickType - 1] || null;
  } else if (typeof ia.fitzpatrickType === 'string') {
    const up = ia.fitzpatrickType.toUpperCase();
    if (['I', 'II', 'III', 'IV', 'V', 'VI'].includes(up)) {
      fitzRoman = up;
    }
  }

  // Build tags for the selfie compliment engine
  const tags = [];
  if (raw.wearingGlasses) tags.push('glasses');
  if (raw.eyeColor) tags.push(`${raw.eyeColor} eyes`);
  if (raw.clothingColor) tags.push(`${raw.clothingColor} top`);

  const selfieMeta = {
    url: photoDataUrl || null,
    tags,
    dominantColor: raw.clothingColor === 'pink' ? 'soft pink' : null,
    eyeColor: raw.eyeColor || null,
    hairColor: raw.hairColor || null,
    // ⭐ NEW: pass through the vision compliment so the letter can sound specific
    compliment: vision.complimentFeatures || null
  };

  // Consolidated vision summary (fixing duplicate declaration)
  const visionSummary = {
    issues: [],
    strengths: [],
    texture: vision.texture || raw.globalTexture || null,
    overallGlow: vision.overallGlow || vision.skinFindings || null,
    pigment: vision.pigment || raw.pigmentType || null,
    fineLines: vision.fineLinesAreas || raw.fineLinesRegions || null,
    elasticity: vision.elasticity || null
  };

  if (vision.poreBehavior || raw.tZonePores) {
    visionSummary.issues.push('visible pores');
  }
  if (vision.pigment || raw.pigmentType) {
    visionSummary.issues.push('pigment variations');
  }
  if (vision.fineLinesAreas || raw.fineLinesRegions) {
    visionSummary.issues.push('fine lines');
  }
  if (raw.globalTexture) {
    visionSummary.issues.push('texture irregularities');
  }

  // Form data for lib/analysis.js
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
    ageRange: ageRange || null // not used directly, but harmless
  };

  return buildAnalysis({
    form,
    selfie: selfieMeta,
    vision: visionSummary
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ ok: false, error: 'OPENAI_API_KEY is not set in the environment' });
  }

  // Geo-gate to US only
  const country = req.headers['x-vercel-ip-country'];
  if (country && country !== 'US') {
    return res.status(403).json({
      ok: false,
      error: 'geo_blocked',
      message:
        'This virtual skincare analysis is currently available only to visitors in the United States.'
    });
  }

  const {
    email,
    ageRange,
    primaryConcern,
    visitorQuestion,
    photoDataUrl, // selfie from the front-end (data URL)
    imageAnalysis // OPTIONAL: result from /api/analyzeImage
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

  // Build structured context (form + selfie + vision) from imageAnalysis
  const analysisContext = buildAnalysisContext({
    ageRange,
    primaryConcern,
    visitorQuestion,
    photoDataUrl,
    imageAnalysis
  });

  // Context for products and services so the model stays on-brand
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

  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics®.

VOICE & STYLE (NON-NEGOTIABLE):
- Write as "I" speaking directly to "you" in a warm, elegant, deeply human tone.
- This should feel like a personal letter from a real dermatologist, not a template or brochure.
- Balance scientific insight with compassion and encouragement.
- Sound "luxury-clinical": premium, polished, but never cold or robotic.
- Avoid lists that feel like instructions; favor short, flowing paragraphs that guide and reassure.
- Vary your metaphors and wording; do NOT repeat the same images (e.g., "quiet narrative", "gatekeeper") in every letter. Make each letter feel freshly written for this one person.

CRITICAL SAFETY / SCOPE:
- This is for ENTERTAINMENT and general cosmetic education only.
- DO NOT diagnose, treat, or name medical diseases or conditions.
- DO NOT mention words like "rosacea", "melasma", "eczema", "psoriasis", "cancer", etc.
- Only describe visible, cosmetic features: redness, uneven tone, texture, dryness, oiliness, fine lines, etc.
- Refer to everything as "cosmetic", "visual", or "appearance-based" rather than medical.

PRODUCT & SERVICE RULES:
- You may recommend ONLY from the product list and service list below.
- Be specific with product names and how to use them in a routine.
- Recommend services gently, explaining what they do and why they fit the person's cosmetic goals.
- Always stay on brand: natural-looking, barrier-supporting, science-backed, no hype, no extremes.

PRODUCTS (ONLY use these when recommending specific products):
${productList}

IN-CLINIC ESTHETIC SERVICES (ONLY use these when recommending services):
${serviceList}

HOW TO USE THE STRUCTURED ANALYSIS CONTEXT (IMPORTANT):
You will receive a JSON "Structured analysis context" in the user message. It contains, among other things:
- user: name/age/location if provided
- selfie: a selfie-based compliment source (selfie.compliment, tags, colors)
- fitzpatrick: cosmetic Fitzpatrick info (type, description, riskNotes)
- skinProfile: declaredType (skin type), inferredTexture, overallGlow, strengths, visibleIssues
- priorities: a sorted list of concerns with priority and rationale
- lifestyle: routineLevel, budgetLevel, currentRoutine, lifestyleNotes
- timeline: days_1_7 / days_8_30 / days_31_90 with theme, goal, notes
- strategy: overall approach and investment level

You MUST incorporate this context so the letter feels specific to THIS person, not generic:

A. OPENING & DISCLAIMER (first 1–2 paragraphs)
- If selfie.compliment is present, you MUST paraphrase it in your own words as Dr. Lazuk.
- Explicitly mention at least ONE concrete visual detail from the selfie (for example: their eyes, smile, glasses, hair, clothing color or pattern, bouquet of flowers, or overall vibe).
- Mention that you are looking at a cosmetic, appearance-only snapshot of their skin.
- Briefly include the education/entertainment-only disclaimer in a warm, human way.

B. WHAT THEIR SKIN IS "TELLING" YOU (next 1–2 paragraphs)
- Use skinProfile.inferredTexture, skinProfile.overallGlow, strengths, and visibleIssues
  as the spine of this part.
- Describe what their skin is "telling" you in a kind, narrative way – NOT as a checklist.
- Tie in age range and primary concern so it feels personally observed, not generic.

C. FITZPATRICK COSMETIC PERSPECTIVE (1 short paragraph)
- Explain, in cosmetic terms only, what their Fitzpatrick type means for sun response and pigment risk.
- Emphasize this is a visual, cosmetic estimate and not a medical diagnosis.

D. AGING & GLOW PROGNOSIS (1–2 paragraphs)
- Based on their current cosmetic pattern (texture, pigment, fine lines, elasticity),
  describe how their skin might age visually if they:
  1) do very little, vs.
  2) follow a calm, supportive routine.
- Keep this realistic, hopeful, and never fear-based.

E. DEEP DIVE ON PRIMARY CONCERN (1–2 paragraphs)
- Anchor this tightly to their primary concern and the visibleIssues in the context.
- Explain what you see that relates to their concern (visually and cosmetically),
  why it behaves the way it does, and what principles help improve it over time.
- You may use analogies, but vary them from person to person so it does not feel copy-pasted.

F. AT-HOME PLAN WITH DR. LAZUK COSMETICS (2–3 paragraphs)
- Build a morning and evening plan using ONLY the allowed product list.
- Make it feel simple and doable (not 20 steps).
- Let lifestyle.routineLevel and strategy.approach guide how advanced the routine can be.
- Explain *why* each step is there in human language, not just product stacking.

G. IN-CLINIC ESTHETIC ROADMAP (1–2 paragraphs)
- Use priorities and skinProfile to propose a realistic path
  (e.g., start with facials, then consider RF/PRP if appropriate).
- Keep it conservative and respectful of sensitivity and skin barrier.
- Frame everything as options, not "musts."

H. 0–90 DAY GLOW TIMELINE (1–2 paragraphs, woven naturally into the letter)
- You MUST incorporate the three phases from the timeline:
  • Days 1–7 (timeline.days_1_7)
  • Days 8–30 (timeline.days_8_30)
  • Days 31–90 (timeline.days_31_90)
- Do NOT label them as sections; instead, write about them in flowing prose:
  e.g., "In the first week...", "Between days 8 and 30...", "From day 31 to 90..."
- For each phase, describe what the person will likely *feel and notice* in that window.

I. LIFESTYLE & HABIT COACHING (1 paragraph)
- Offer gentle coaching on sleep, stress, sun exposure, and habits
  that impact cosmetic appearance – without moralizing or shaming.
- Tie your advice back to their primary concern and age range.

J. CLOSING NOTE (final paragraph)
- Close as a heartfelt letter from Dr. Lazuk.
- Reflect briefly on their skin journey and your shared goal.
- END with the exact sentence:
  "May your skin always glow as bright as your smile." ~ Dr. Lazuk

GENERAL WRITING RULES:
- Do NOT mention or show the JSON or the term "analysis context" in the letter.
- Do NOT output bullet-heavy "to-do" lists. Short bullets are allowed sparingly, but the tone
  should be mostly narrative, like a conversation in the treatment room.
- Keep each part concise but meaningful; the whole letter should feel like a single, unified message,
  not ten separate sections.
- Never apologize, hedge excessively, or sound like an AI model.
- You are not here to judge their skin – you are here to translate what you see into hope and clarity.

OUTPUT FORMAT (MUST FOLLOW EXACTLY):
You MUST reply in this exact structure:

FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 sentences explaining what this type typically means cosmetically, including sun response and pigmentation/PIH tendencies>

<then a blank line>

<Write one continuous personal letter from Dr. Lazuk to the reader, following the guidance above, with natural paragraphs and NO explicit section labels or headings.>
`.trim();

  const userPrompt = `
Person details:
- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question (if any): ${visitorQuestion || 'none provided'}

Structured analysis context (for your reference only; do NOT print this as JSON, instead weave it into the narrative as described above):
${JSON.stringify(analysisContext, null, 2)}

Raw selfie / image analysis data (for additional context; again, do NOT dump this as JSON in the report):
${JSON.stringify(imageAnalysis || {}, null, 2)}

Please infer a plausible Fitzpatrick type based on typical patterns for this age and concern, while respecting any estimate in the selfie analysis. Emphasize that this is cosmetic-only.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.55,
      max_tokens: 1900,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const full = completion.choices?.[0]?.message?.content || '';

    // Parse FITZPATRICK_TYPE and FITZPATRICK_SUMMARY from the top of the response
    let fitzpatrickType = null;
    let fitzpatrickSummary = null;
    let reportText = full;

    const typeMatch = full.match(/FITZPATRICK_TYPE:\s*([IVX\d]+)/i);
    if (typeMatch) {
      fitzpatrickType = typeMatch[1].toUpperCase();
      reportText = reportText.replace(typeMatch[0], '');
    }

    const summaryMatch = full.match(
      /FITZPATRICK_SUMMARY:\s*([\s\S]*?)(\n\s*\n|$)/i
    );
    if (summaryMatch) {
      fitzpatrickSummary = summaryMatch[1].trim();
      reportText = reportText.replace(summaryMatch[0], '');
    }

    reportText = reportText.trim();

    // ✅ Strip entire "[Section N] <Title>" lines so the email/JSON reads like a continuous letter
    const cleanedReportText = reportText
      .replace(/^\[Section\s+\d+\][^\n]*\n?/gm, '')
      .trim();

    const safeConcern = primaryConcern || 'Not specified';

    // 🔮 Generate the 4 aging preview images (may gracefully return nulls)
    const agingPreviewImages = await generateAgingPreviewImages({
      ageRange,
      primaryConcern,
      fitzpatrickType
    });

    // TEMP: log what we actually got back
    console.log('AGING_PREVIEW_IMAGES', JSON.stringify(agingPreviewImages, null, 2));

    // Build the "Your Skin's Future Story — A Preview" HTML block
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
              <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">
                ~10 years from now – minimal skincare changes
              </p>
            </div>
            `
                : ''
            }
            ${
              agingPreviewImages.noChange20
                ? `
            <div>
              <img src="${agingPreviewImages.noChange20}" alt="Approximate 20-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
              <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">
                ~20 years from now – minimal skincare changes
              </p>
            </div>
            `
                : ''
            }
            ${
              agingPreviewImages.withCare10
                ? `
            <div>
              <img src="${agingPreviewImages.withCare10}" alt="Approximate 10-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
              <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">
                ~10 years from now – with consistent, supportive care
              </p>
            </div>
            `
                : ''
            }
            ${
              agingPreviewImages.withCare20
                ? `
            <div>
              <img src="${agingPreviewImages.withCare20}" alt="Approximate 20-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
              <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">
                ~20 years from now – with consistent, supportive care
              </p>
            </div>
            `
                : ''
            }
          </div>
        </div>
      `;
    }

    // ---------- Visitor Email HTML ----------
    const visitorHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 20px;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
          <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">
            Your Dr. Lazuk Virtual Skin Analysis
          </h1>
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
          </div>
          `
              : ''
          }

          ${
            fitzpatrickType || fitzpatrickSummary
              ? `
          <div style="border: 1px solid #FCD34D; background-color: #FFFBEB; padding: 12px 16px; margin-bottom: 16px; border-radius: 8px;">
            <h2 style="font-size: 14px; font-weight: 700; color: #92400E; margin: 0 0 4px 0;">
              Fitzpatrick Skin Type (Cosmetic Estimate)
            </h2>
            ${
              fitzpatrickType
                ? `<p style="font-size: 13px; font-weight: 600; color: #92400E; margin: 0 0 4px 0;">
                Type ${fitzpatrickType}
              </p>`
                : ''
            }
            ${
              fitzpatrickSummary
                ? `<p style="font-size: 13px; color: #92400E; margin: 0;">${fitzpatrickSummary}</p>`
                : ''
            }
            ${fitzpatrickType ? renderFitzpatrickScaleHtml(fitzpatrickType) : ''}
            <p style="font-size: 11px; color: #92400E; margin-top: 8px;">
              This is a visual, cosmetic estimate only and is not a medical diagnosis.
            </p>
          </div>
          `
              : ''
          }

          ${agingPreviewHtml}

          <pre style="white-space: pre-wrap; font-size: 13px; margin-top: 16px; color: #111827;">
${cleanedReportText}
          </pre>

          <hr style="border-top: 1px solid #E5E7EB; margin: 24px 0;" />

          <p style="font-size: 12px; color: #6B7280; margin-bottom: 4px;">
            If you have any medical concerns or skin conditions, please see a qualified in-person professional.
          </p>
          <p style="font-size: 12px; color: #6B7280; margin-bottom: 8px;">
            If you’d like in-person, customized care, our team at Dr. Lazuk Esthetics® in Georgia would be honored to see you.
          </p>
          <p style="font-size: 12px; color: #6B7280;">
            With care,<br/>
            Dr. Lazuk Esthetics® &amp; Dr. Lazuk Cosmetics®<br/>
            <a href="mailto:contact@drlazuk.com" style="color: #111827; text-decoration: underline;">
              contact@drlazuk.com
            </a>
          </p>
        </div>
      </div>
    `;

    // ---------- Clinic Email HTML ----------
    const clinicEmail =
      process.env.RESEND_CLINIC_EMAIL || 'contact@drlazuk.com'; // ✅ default to drlazuk.com

    const clinicHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 16px;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
          <h1 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">
            New Virtual Skin Analysis – Cosmetic Report
          </h1>
          <p style="font-size: 13px; color: #4B5563; margin-bottom: 8px;">
            A visitor completed the Dr. Lazuk virtual skin analysis.
          </p>
          <ul style="font-size: 13px; color: #374151; margin-bottom: 12px; padding-left: 18px;">
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Age Range:</strong> ${ageRange}</li>
            <li><strong>Primary Concern:</strong> ${safeConcern}</li>
            ${
              fitzpatrickType
                ? `<li><strong>Fitzpatrick Estimate:</strong> Type ${fitzpatrickType}</li>`
                : ''
            }
          </ul>
          ${
            fitzpatrickSummary
              ? `<p style="font-size: 13px; margin-bottom: 12px;"><strong>Fitzpatrick Summary:</strong> ${fitzpatrickSummary}</p>`
              : ''
          }

          ${
            photoDataUrl
              ? `
          <div style="margin: 12px 0 18px 0;">
            <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">Visitor photo (data URL):</p>
            <img src="${photoDataUrl}" alt="Uploaded skin photo" style="max-width: 210px; border-radius: 10px; border: 1px solid #E5E7EB;" />
          </div>
          `
              : ''
          }

          ${agingPreviewHtml}

          <hr style="border-top: 1px solid #E5E7EB; margin: 16px 0;" />
          <pre style="white-space: pre-wrap; font-size: 13px; color: #111827;">
${cleanedReportText}
          </pre>
        </div>
      </div>
    `;

    // Send visitor + clinic emails (fire and forget)
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

    // Response to the frontend
    return res.status(200).json({
      ok: true,
      report: cleanedReportText,
      fitzpatrickType: fitzpatrickType || null,
      fitzpatrickSummary: fitzpatrickSummary || null,
      agingPreviewImages
    });
  } catch (error) {
    console.error('generate-report error:', error);
    return res.status(500).json({
      ok: false,
      error: 'openai_error',
      message: error?.message || 'Unknown error calling OpenAI'
    });
  }
}

