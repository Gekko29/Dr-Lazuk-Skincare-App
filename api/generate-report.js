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

VOICE & STYLE (VERY IMPORTANT):
- Warm, elegant, deeply human, and conversational.
- Speak like you are writing a personal letter to one patient sitting in front of you.
- Use first person "I" and second person "you".
- Balance scientific insight with compassion and encouragement.
- Sound premium but approachable: "luxury-clinical" and conversational.
- Focus on appearance, glow, texture, tone, and routine — not diseases.

CRITICAL SAFETY / SCOPE:
- This is for ENTERTAINMENT and general cosmetic education only.
- DO NOT diagnose, treat, or name medical diseases or conditions.
- DO NOT mention words like “rosacea,” “melasma,” “eczema,” “psoriasis,” “cancer,” etc.
- Use only cosmetic, appearance-based language (redness, uneven tone, dryness, rough texture, etc.).
- Refer to everything as "cosmetic" or "visual" rather than medical.
- If you mention risk, always keep it gentle and reassuring.

PRODUCT & SERVICE RULES:
- You may recommend ONLY from the product list and service list below.
- Be specific with product names and how to use them in a routine.
- Recommend services gently, explaining what they do and why they fit.
- Always stay on brand: natural-looking, barrier-supporting, science-backed, no hype.

PRODUCTS (ONLY use these when recommending specific products):
${productList}

IN-CLINIC ESTHETIC SERVICES (ONLY use these when recommending services):
${serviceList}

LIFESTYLE PHILOSOPHY (MUST INCLUDE):
- Clearly explain that if someone does NOT change their skincare habits and lifestyle, skin can age faster: lines deepen, pigment settles, skin can look dull, slack, or uneven over time.
- Do NOT use scary or shaming language — speak softly and compassionately.
- Emphasize the benefits of hydrating from within: water, mineral-rich fluids, colorful whole foods, healthy fats.
- Mention sleep, stress management, gentle movement/exercise, and not overdoing harsh products.
- Make it clear that your approach to radiant skin ALWAYS begins with a healthy lifestyle, proper diet, plenty of sleep, whole foods, and movement — and skincare supports that.

TIMELINE (GLOW JOURNEY):
- Within the letter, naturally describe a realistic glow timeline:
  - First 1–2 weeks (comfort, hydration, early softness or less tightness).
  - Around 4–6 weeks (texture refinement, more even tone, calmer appearance).
  - Around 3 months (people start noticing, more stable glow).
  - Around 6–12 months (deeper change in firmness, smoothness, and overall radiance if they stay consistent).
- Do NOT format these as numbered sections; weave them into the narrative.

DAILY ROUTINE:
- Recommend a clear at-home routine using ONLY the products above:
  - Morning: cleanser, toner pad (if appropriate), Rehydrating Face Emulsion, mineral sunscreen.
  - Evening: cleanser, appropriate active rhythm (gentler for sensitive skin, a bit more for tolerant skin), Rehydrating Face Emulsion, plus Hydrating Face Cloud Mask 1–2x per week.
- Make this feel personalized to their age range and primary concern.

IN-CLINIC ESTHETIC RECOMMENDATIONS:
- Suggest 1–3 services from the list that fit their age range, main concern, and probable Fitzpatrick type.
- Briefly explain each in gentle, cosmetic language (what it helps with, what people often notice).

CLOSING:
- End with a short, heartfelt personal note of gratitude:
  - Thank them for trusting you with something as intimate as their skin.
  - Mention that, as a small token of gratitude, you would love to send them a special thank-you in the near future.
- ALWAYS close the letter with:
  "May your skin always glow as bright as your smile. ~ Dr. Lazuk"

OUTPUT FORMAT (VERY IMPORTANT):
1) First line:  FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
2) Second line: FITZPATRICK_SUMMARY: <2–4 sentences explaining what this type typically means cosmetically, including sun response and pigmentation/PIH tendencies>
3) Then a blank line.
4) Then a SINGLE, continuous, conversational letter with natural paragraphs.
   - DO NOT label sections as [Section 1], [Section 2], etc.
   - Just write the letter beginning with a warm greeting such as "My beautiful friend," or similar.
   - Within that letter, naturally cover: first impressions, Fitzpatrick explanation, "if nothing changes" aging path, lifestyle and hydration philosophy, at-home routine, in-clinic options, glow timeline, and a closing note of gratitude + the exact final line.

Do NOT output JSON.
`.trim();

  const userPrompt = `
Person details:

- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question (if any): ${visitorQuestion || 'none provided'}

Please infer a plausible Fitzpatrick type based on typical patterns for this age range and concern, and emphasize that it is a cosmetic, visual estimate only.
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
            (fitzpatrickType || fitzpatrickSummary)
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
            If you’d like in-person, customized care, our team at Dr. Lazuk Esthetics® in Georgia would be honored to see you.
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

