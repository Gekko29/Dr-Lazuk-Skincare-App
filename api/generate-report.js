// api/generate-report.js
import OpenAI from 'openai';
import { buildAnalysis } from '../lib/analysis'; // lib/analysis.js at project root

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
    'Dr. Lazuk Esthetics <no-reply@drlazuk.com>'; // default to verified domain

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
    const size = '1024x1024';

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

  // Build structured context using the *new* lib/analysis.js API
  const analysisContext = buildAnalysis({
    ageRange,
    primaryConcern,
    visitorQuestion,
    imageAnalysis: imageAnalysis || null
  });

  // (Optional) log for debugging, comment out in production
  // console.log('ANALYSIS_CONTEXT', JSON.stringify(analysisContext, null, 2));

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
- Vary your metaphors and wording; do NOT repeat the same images in every letter. Make each letter feel freshly written for this one person.

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

STRUCTURED ANALYSIS CONTEXT YOU WILL RECEIVE:
You will receive a JSON "Structured analysis context" with these fields:
- demographics: { ageRange, primaryConcern, visitorQuestion }
- selfie: {
    compliment: a warm, custom compliment phrase,
    fitzpatrickEstimateNumeric: 1–6 or null,
    fitzpatrickEstimateRoman: "I"–"VI" or null
  }
- skinSummary: {
    keyFindingsText: a compact narrative of what the image analysis saw,
    activesHint: guidance on evening actives,
    inClinicHint: guidance on in-clinic options
  }
- timeline: days_1_7 / days_8_30 / days_31_90 each with { theme, goal, notes }

You will ALSO receive the raw selfie / image analysis JSON, which includes:
- "analysis": high-level cosmetic findings
- "raw": low-level cues like:
  - raw.wearingGlasses (boolean)
  - raw.eyeColor (e.g. "blue", "brown", "green")
  - raw.clothingColor (e.g. "pink", "black", "white")
  - raw.holdingFlowers or similar visual tags (if present)
Use these raw fields to infer at least ONE CONCRETE visual detail in the opening (for example: glasses, eye color, clothing color, bouquet of flowers, or similar).

YOU MUST:
- Use selfie.compliment (if present) and paraphrase it in your own words.
- Mention at least ONE specific, concrete visual detail that is plausible from the raw JSON (such as their glasses, eye color, clothing color, or the fact they are holding flowers).
- Use skinSummary.keyFindingsText as the spine of your description of what their skin is "telling" you.
- Use the three timeline phases (days_1_7, days_8_30, days_31_90) in natural prose.

LETTER STRUCTURE GUIDANCE:

A. OPENING & DISCLAIMER (first 1–2 paragraphs)
- Paraphrase selfie.compliment.
- Mention at least one concrete visual detail from the selfie.
- Clearly state that you are looking at a cosmetic, appearance-only snapshot.
- Warmly weave in the education/entertainment-only disclaimer.

B. WHAT THEIR SKIN IS "TELLING" YOU (next 1–2 paragraphs)
- Use skinSummary.keyFindingsText plus the ageRange and primaryConcern to describe the story of their skin.
- Do this as a kind narrative, not a checklist.

C. FITZPATRICK COSMETIC PERSPECTIVE (1 short paragraph)
- Explain what their Fitzpatrick type means cosmetically (sun response and pigment).
- Emphasize this is a visual, cosmetic estimate and not a medical diagnosis.

D. AGING & GLOW PROGNOSIS (1–2 paragraphs)
- Describe how their skin might visually age if they:
  1) do very little, vs.
  2) follow a calm, supportive routine.
- Be realistic, hopeful, and never fear-based.

E. DEEP DIVE ON PRIMARY CONCERN (1–2 paragraphs)
- Tie this tightly to their primaryConcern.
- Explain, in cosmetic terms, what is likely happening and what principles help.

F. AT-HOME PLAN WITH DR. LAZUK COSMETICS (2–3 paragraphs)
- Build a morning and evening plan using ONLY the allowed products.
- Keep it simple, human, and doable. Explain why steps are there.

G. IN-CLINIC ESTHETIC ROADMAP (1–2 paragraphs)
- Suggest a conservative, realistic path using the allowed services.
- Frame everything as options, not requirements.

H. 0–90 DAY GLOW TIMELINE (1–2 paragraphs, woven into the letter)
- Refer explicitly but naturally to:
  • the first week,
  • days 8–30,
  • days 31–90.
- For each, describe what they may feel and notice if they follow your guidance.

I. LIFESTYLE & HABIT COACHING (1 paragraph)
- Gentle, non-judgmental tips on sleep, stress, sun behavior, etc.

J. CLOSING NOTE (final paragraph)
- Close as a heartfelt letter from Dr. Lazuk.
- END with exactly:
  "May your skin always glow as bright as your smile." ~ Dr. Lazuk

GENERAL WRITING RULES:
- Do NOT mention or show the JSON or the term "analysis context" in the letter.
- Do NOT output bullet-heavy "to-do" lists.
- Keep the letter feeling like one continuous conversation, not rigid sections.
- Never apologize or sound like an AI model.
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

Please infer a Fitzpatrick type while respecting any estimate in the selfie analysis. Emphasize that this is cosmetic-only.
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

    // Strip "[Section N]" lines if the model ever emits them
    const cleanedReportText = reportText
      .replace(/^\[Section\s+\d+\][^\n]*\n?/gm, '')
      .trim();

    const safeConcern = primaryConcern || 'Not specified';

    // Generate the 4 aging preview images (may gracefully return nulls)
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
      process.env.RESEND_CLINIC_EMAIL || 'contact@drlazuk.com';

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

}

