// api/generate-report.js (CommonJS-compatible for Vercel)
// NOTE: We keep this file CJS to match your current runtime.
// We dynamically import ../lib/analysis.js because it uses ESM "export".

const OpenAIImport = require('openai');
const OpenAI = OpenAIImport.default ?? OpenAIImport;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- ESM import helper (for lib/analysis.js) ---
let _buildAnalysis = null;
async function getBuildAnalysis() {
  if (_buildAnalysis) return _buildAnalysis;
  const mod = await import('../lib/analysis.js');
  _buildAnalysis = mod.buildAnalysis;
  return _buildAnalysis;
}
async function ensureImageAnalysis({ photoDataUrl, imageAnalysis }) {
  if (imageAnalysis) return imageAnalysis;
  if (!photoDataUrl) return null;

  // Call your existing /api/analyzeImage if frontend didn't send imageAnalysis.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  if (!base) {
    console.warn('No base URL available to call /api/analyzeImage; returning null imageAnalysis.');
    return null;
  }

  try {
    const r = await fetch(`${base}/api/analyzeImage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoDataUrl })
    });

    if (!r.ok) {
      console.error('ensureImageAnalysis: analyzeImage failed', r.status, await r.text());
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('ensureImageAnalysis exception:', e);
    return null;
  }
}

// Small helper to render a simple Fitzpatrick scale line in HTML
function renderFitzpatrickScaleHtml(type) {
  if (!type) return '';
  const types = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const normalized = String(type).toUpperCase();
  const line = types.map((t) => (t === normalized ? `<strong>${t}</strong>` : t)).join(' · ');
  return `<p style="font-size: 12px; color: #92400E; margin-top: 6px;">
    Cosmetic Fitzpatrick scale: ${line}
  </p>`;
}

// Helper to send email using Resend
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
    return {
      noChange10: null,
      noChange20: null,
      withCare10: null,
      withCare20: null
    };
  }
}

// Build analysis context using your REAL lib/analysis.js signature
async function buildAnalysisContext({ ageRange, primaryConcern, visitorQuestion, imageAnalysis }) {
  const buildAnalysis = await getBuildAnalysis();
  return buildAnalysis({ ageRange, primaryConcern, visitorQuestion, imageAnalysis });
}

module.exports = async function handler(req, res) {
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
    photoDataUrl,
    imageAnalysis
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

  // 🔥 Loud debug so you can see whether the app is actually using image analysis
  const hasImageAnalysis =
    !!imageAnalysis &&
    typeof imageAnalysis === 'object' &&
    (imageAnalysis.analysis || imageAnalysis.raw || imageAnalysis.fitzpatrickType != null);

  console.log('HAS_IMAGE_ANALYSIS', hasImageAnalysis);
  if (imageAnalysis?.analysis) console.log('IMAGE_ANALYSIS_KEYS', Object.keys(imageAnalysis.analysis));
  if (imageAnalysis?.raw) console.log('IMAGE_RAW_KEYS', Object.keys(imageAnalysis.raw));

  const analysisContext = await buildAnalysisContext({
    ageRange,
    primaryConcern,
    visitorQuestion,
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

  // ✅ UPDATED prompt: aligns to YOUR ACTUAL analysisContext shape (demographics/selfie/skinSummary/timeline)
  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics®.

VOICE & STYLE (NON-NEGOTIABLE):
- Write as "I" speaking directly to "you" in a warm, elegant, deeply human tone.
- This should feel like a personal letter from a real dermatologist, not a template.
- Luxury-clinical: premium, polished, never cold or robotic.
- Avoid bullet-heavy instruction lists; favor flowing paragraphs.
- Do NOT invent visual details that are not present in the provided context.

CRITICAL SAFETY / SCOPE:
- Entertainment + cosmetic education only.
- Do NOT diagnose or name medical conditions.
- Only describe visible cosmetic features (tone, texture, dryness, oiliness, fine lines, pigment variation).

PRODUCT & SERVICE RULES:
- Recommend ONLY from the product list and service list below.

PRODUCTS:
${productList}

SERVICES:
${serviceList}

YOU WILL RECEIVE A JSON "Structured analysis context" with THIS SHAPE:
- demographics: ageRange, primaryConcern, visitorQuestion
- selfie: compliment, fitzpatrickEstimateNumeric, fitzpatrickEstimateRoman
- skinSummary: keyFindingsText, activesHint, inClinicHint
- timeline: days_1_7, days_8_30, days_31_90 (each with theme, goal, notes)

YOU MUST USE IT:
- Paraphrase selfie.compliment in your own words (don’t copy it verbatim).
- Use skinSummary.keyFindingsText as the backbone of “what I’m seeing.”
- Use skinSummary.activesHint and inClinicHint to guide routine/treatment suggestions.
- Weave the timeline into prose (first week… days 8–30… days 31–90), describing what they’ll notice.

OUTPUT FORMAT (MUST FOLLOW EXACTLY):
FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 cosmetic sentences>

<blank line>

<one continuous personal letter, no section headings>
May your skin always glow as bright as your smile. ~ Dr. Lazuk
`.trim();

  const userPrompt = `
Person details:
- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question (if any): ${visitorQuestion || 'none provided'}

Structured analysis context (do NOT print this JSON; weave it into the narrative):
${JSON.stringify(analysisContext, null, 2)}

Raw image analysis payload (do NOT dump; use only to stay grounded):
${JSON.stringify(imageAnalysis || {}, null, 2)}

Respect the Fitzpatrick estimate if present in the context.
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

    reportText = reportText.trim();
    const cleanedReportText = reportText.replace(/^\[Section\s+\d+\][^\n]*\n?/gm, '').trim();

    const safeConcern = primaryConcern || 'Not specified';

    const agingPreviewImages = await generateAgingPreviewImages({
      ageRange,
      primaryConcern,
      fitzpatrickType
    });

    console.log('AGING_PREVIEW_IMAGES', JSON.stringify(agingPreviewImages, null, 2));

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
              <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">~10 years – with supportive care</p>
            </div>`
                : ''
            }
            ${
              agingPreviewImages.withCare20
                ? `
            <div>
              <img src="${agingPreviewImages.withCare20}" alt="Approximate 20-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
              <p style="font-size: 11px; color: #4B5563; margin-top: 4px;">~20 years – with supportive care</p>
            </div>`
                : ''
            }
          </div>
        </div>
      `;
    }

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
                ? `<p style="font-size: 13px; font-weight: 600; color: #92400E; margin: 0 0 4px 0;">Type ${fitzpatrickType}</p>`
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

          <pre style="white-space: pre-wrap; font-size: 13px; margin-top: 16px; color: #111827;">${cleanedReportText}</pre>

          <hr style="border-top: 1px solid #E5E7EB; margin: 24px 0;" />

          <p style="font-size: 12px; color: #6B7280; margin-bottom: 4px;">
            If you have any medical concerns or skin conditions, please see a qualified in-person professional.
          </p>
          <p style="font-size: 12px; color: #6B7280;">
            With care,<br/>
            Dr. Lazuk Esthetics® &amp; Dr. Lazuk Cosmetics®
          </p>
        </div>
      </div>
    `;

    const clinicEmail = process.env.RESEND_CLINIC_EMAIL || 'contact@drlazuk.com';

    const clinicHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5; background-color: #F9FAFB; padding: 16px;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 20px 24px;">
          <h1 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">
            New Virtual Skin Analysis – Cosmetic Report
          </h1>
          <ul style="font-size: 13px; color: #374151; margin-bottom: 12px; padding-left: 18px;">
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Age Range:</strong> ${ageRange}</li>
            <li><strong>Primary Concern:</strong> ${safeConcern}</li>
            ${fitzpatrickType ? `<li><strong>Fitzpatrick Estimate:</strong> Type ${fitzpatrickType}</li>` : ''}
          </ul>

          ${agingPreviewHtml}

          <hr style="border-top: 1px solid #E5E7EB; margin: 16px 0;" />
          <pre style="white-space: pre-wrap; font-size: 13px; color: #111827;">${cleanedReportText}</pre>
        </div>
      </div>
    `;

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
};

