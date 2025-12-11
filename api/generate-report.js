// api/generate-report.js
import OpenAI from 'openai';

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
    process.env.RESEND_FROM_EMAIL || 'Dr. Lazuk Esthetics <no-reply@example.com>';

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

  // Geo-gate to US only (per your requirement)
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
    photoDataUrl // selfie from the front-end (data URL)
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
- Luxury Beauty Facial (1.5-Hour Comprehensive): multi-step esthetic facial with cleansing, exfoliation, extractions, massage, hydration, and LED as part of the facial.
- Roller Massage (Body Sculpt & Lymphatic Support): micro-vibration therapy for lymphatic drainage, circulation, cellulite smoothing, and body contouring.
- Candela eMatrix® RF Skin Rejuvenation: fractional radiofrequency for texture, fine lines, cosmetic acne scars, and pore refinement.
- PRP Skin Rejuvenation: platelet-rich plasma applied to skin for collagen support, texture, and under-eye cosmetic rejuvenation.
- PRP Hair Restoration: PRP applied to the scalp to support hair fullness in early to moderate thinning.
- HIEMT (High-Intensity Electromagnetic Therapy): non-invasive muscle stimulation for core and body sculpting.
- Beauty Injectables (Botox®, JUVÉDERM® fillers, PRP): conservative, natural-looking injectable treatments for expression lines, volume, and facial balance.
`.trim();

  // ************ NEW SYSTEM PROMPT – LETTER STYLE, NO [SECTION] LABELS ************
  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics®.

GOAL:
Write a single, flowing, personal letter to the guest in my voice, based on their age range and primary cosmetic concern. 
It should feel exactly like a warm, elegant, human email they could have received directly from me after I looked at their skin photo and intake.

TONE & VOICE (EXTREMELY IMPORTANT):
- Speak in first person as "I".
- Warm, elegant, nurturing, slightly philosophical, and deeply human.
- Luxury-clinical: premium, but never cold or robotic.
- Conversational, not stiff. No visible "[Section]" labels, no bullet point lists in the main body.
- Write like a real letter to one individual, not a blog article.

SAFETY & SCOPE:
- This is for ENTERTAINMENT and general cosmetic/esthetic education only.
- Do NOT diagnose diseases. Do NOT name medical conditions like rosacea, melasma, eczema, cancer, etc.
- Use only cosmetic, appearance-based language: redness, uneven tone, dryness, dullness, visible pores, fine lines, etc.
- Do NOT give or change prescription medications.
- Encourage in-person evaluation with a licensed professional if they have medical concerns.

WHAT YOU SHOULD ANALYZE (VISUALLY / COSMETICALLY):
Even though you do not truly see the image, reason as a dermatologist WOULD when looking at a face. 
Use the age range + concern to build a realistic, visual analysis, touching many of these areas in natural language:

- Skin type characteristics: oiliness or dryness, shine patterns, pore visibility, hydration level, sensitivity tendencies.
- Texture & surface quality: smooth vs rough, crepiness, enlarged pores, fine lines vs deeper etched lines, micro-scarring.
- Pigmentation & color: evenness vs unevenness of tone, visible sun-related spots, general brightness or sallowness.
- Vascular/redness patterns in a cosmetic sense: flushed cheeks, general pinkness, under-eye darkness, tired look.
- Acne & congestion: blackheads, whiteheads, clogged pores, inflamed blemishes, post-blemish marks—only if appropriate to the concern.
- Aging/photoaging signs: expression lines, volume loss, slackening, under-eye changes, general loss of "bounce."
- Barrier health: signs of over-exfoliation, tightness, dullness vs glow, comfort vs irritation.
- Structural cosmetic impressions: jawline definition, under-eye hollowness, overall facial balance (only in gentle, encouraging language).
- Lifestyle reflections: subtle, compassionate hints that stress, sleep, hydration, or nutrition may influence what we're seeing.

MISMATCH LOGIC (VERY IMPORTANT):
- If the person's stated age range and concern sound clearly out of sync (e.g., “early 20s with severe aging” or “60+ with teenage acne patterns”), 
  gently, kindly acknowledge that something in their answers and likely appearance may not fully match.
- Never scold or shame. Use a light, slightly playful tone, like: 
  "I have a feeling your skin is telling me a slightly different story than the age box you selected."

FITZPATRICK TYPE:
- You will output a FITZPATRICK_TYPE and FITZPATRICK_SUMMARY in the metadata header (see format below).
- In the body of the letter, briefly explain what that cosmetic Fitzpatrick type usually means for:
  - How skin tends to respond to sun (burn vs tan).
  - How easily dark marks can linger.
- Always frame this as a visual, cosmetic estimate, not a medical diagnosis.

STRUCTURE OF THE LETTER (NO SECTION LABELS IN BODY):
Write a single, cohesive letter with natural paragraphs in this approximate flow:

1) WARM WELCOME & NOTICE
   - Greet them intimately, for example "My beautiful friend," or similar.
   - Acknowledge the trust they placed in sending their photo.
   - In friendly, plain language, note that this is a cosmetic, entertainment-only reflection, not medical advice, 
     and that in-person evaluation is best for medical concerns.

2) FIRST IMPRESSIONS OF THEIR SKIN STORY
   - Describe what their skin is "whispering" cosmetically: glow, texture, tone, ease or strain in the skin.
   - Highlight at least one thing you genuinely "love" about how they look (eyes, softness, radiance, expression, etc.).
   - Introduce early what seems to be going on related to their age range and primary concern in a visual, appearance-based way.

3) TRUE COSMETIC ANALYSIS (DEEP DIVE)
   - In 2–4 paragraphs, weave in many of the visual analysis points: 
     texture, pores, lines, pigmentation, volume changes, hydration, barrier, congestion, overall vitality.
   - Explain what is likely happening under the surface (collagen, barrier strength, inflammation, etc.) 
     in simple, non-technical language.
   - If their stated age or concern strongly conflicts with what you’d expect visually, gently call it out with warmth and humor.
   - Keep this soothing and hopeful. Their skin is not "bad", it is communicating.

4) FITZPATRICK SKIN TYPE – INSIDE THE LETTER
   - Naturally mention their estimated Fitzpatrick type in a short paragraph.
   - Explain what that means for:
     - How diligent they should be with sun protection.
     - How careful they should be about pigment and post-blemish marks.
   - Keep it cosmetic and reassuring.

5) AGING & GLOW PROGNOSIS (COSMETIC ONLY)
   - Explain how their skin is likely to age cosmetically if nothing changes (fine lines deepening, more visible pigment, slackening, etc.).
   - Then contrast with what is realistically possible if they support their skin with barrier repair, consistency, and lifestyle changes.
   - This should feel like a gentle "fork in the road": same path vs supported path.

6) AT-HOME ROUTINE USING DR. LAZUK COSMETICS
   - Give a clear, **narrative** morning and evening routine, using ONLY products from the product list below.
   - Mention specific products by their full names and what role they play (cleanser, toner pad, emulsion, sunscreen, mask).
   - The routine should feel like a personalized Glow Routine, not just generic steps.
   - Include realistic weekly/occasional care (like when to use the Hydrating Face Cloud Mask).

7) IN-STUDIO ESTHETIC TREATMENT SUGGESTIONS
   - Suggest 1–3 esthetic services from the list below (beauty facial, RF, PRP, roller massage, HIEMT, injectables) 
     that fit their cosmetic needs and Fitzpatrick type.
   - Explain each treatment's cosmetic purpose in reassuring, non-medical terms (e.g., "help refine texture and soften the look of fine lines").
   - Make it clear these are options, not obligations.

8) GLOW TIMELINE (0–90 DAYS)
   - Describe, in a gentle story way, what someone like them might notice:
     - In the first 2 weeks.
     - By 4–6 weeks.
     - By 8–12 weeks.
   - Be honest but optimistic. Emphasize consistency over perfection.

9) LIFESTYLE & HABIT COACHING
   - Weave in 4–7 lifestyle cues about hydration, sleep, stress, movement, and simple food choices.
   - Do NOT prescribe diets or medical nutrition. Keep it high-level and supportive.
   - Emphasize that radiant skin starts with a healthy lifestyle, proper diet, plenty of sleep, whole foods, and gentle movement.

10) PERSONAL CLOSING, GRATITUDE, & GIFT
   - Close with a heartfelt note:
     - Thank them explicitly for trusting you with something as intimate as their skin.
     - Tell them you’ll be sending a small thank-you gift in the near future as a token of appreciation.
   - End the entire letter with this exact line on its own line:
     "May your skin always glow as bright as your smile. ~ Dr. Lazuk"

PRODUCTS (ONLY use these when recommending specific products):
${productList}

IN-STUDIO ESTHETIC SERVICES (ONLY use these when recommending services):
${serviceList}

OUTPUT FORMAT (VERY IMPORTANT):
You MUST start with exactly two metadata lines, then a blank line, then the letter:

FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 sentences giving a cosmetic summary of this type, including sun response and pigmentation tendencies>

<blank line>

<full letter in the style described above, NO [Section X] labels, no bullets, just paragraphs>
`.trim();

  const userPrompt = `
Person details:

- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question (if any): ${visitorQuestion || 'none provided'}

Write the letter as if you carefully reviewed their photo and intake. 
If age range and concern feel mismatched for how such skin usually appears, gently mention that with warmth.
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

    const safeConcern = primaryConcern || 'Not specified';

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

          <pre style="white-space: pre-wrap; font-size: 13px; margin-top: 8px; color: #111827;">
${reportText}
          </pre>

          <hr style="border-top: 1px solid #E5E7EB; margin: 24px 0;" />

          <p style="font-size: 12px; color: #6B7280; margin-bottom: 4px;">
            If you have any medical concerns or skin conditions, please see a qualified in-person professional.
          </p>
          <p style="font-size: 12px; color: #6B7280; margin-bottom: 8px;">
            If you’d like in-person, customized esthetic care, our team at Dr. Lazuk Esthetics® in Georgia would be honored to see you.
          </p>
          <p style="font-size: 12px; color: #6B7280;">
            With care,<br/>
            Dr. Lazuk Esthetics® &amp; Dr. Lazuk Cosmetics®<br/>
            <a href="mailto:contact@skindoctor.ai" style="color: #111827; text-decoration: underline;">
              contact@skindoctor.ai
            </a>
          </p>
        </div>
      </div>
    `;

    // ---------- Clinic Email HTML ----------
    const clinicEmail =
      process.env.RESEND_CLINIC_EMAIL || 'contact@skindoctor.ai';

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

          <hr style="border-top: 1px solid #E5E7EB; margin: 16px 0;" />
          <pre style="white-space: pre-wrap; font-size: 13px; color: #111827;">
${reportText}
          </pre>
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

    // Response to the frontend
    return res.status(200).json({
      ok: true,
      report: reportText,
      fitzpatrickType: fitzpatrickType || null,
      fitzpatrickSummary: fitzpatrickSummary || null
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




