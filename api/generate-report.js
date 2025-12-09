// api/generate-report.js
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    photoDataUrl
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

  // Only allow image data URLs for the photo
  const safePhotoDataUrl =
    typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image')
      ? photoDataUrl
      : null;

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

Your job is to create a LONG, warm, detailed, COSMETIC-ONLY virtual skincare analysis report.

Important rules:
- This is for ENTERTAINMENT and general cosmetic education only.
- DO NOT diagnose, treat, or name medical diseases or conditions.
- Use gentle, reassuring language.
- You may recommend ONLY from the product list and service list below.
- Always stay on brand for Dr. Lazuk: natural-looking, barrier-supporting, science-backed, no hype.

PRODUCTS (ONLY use these when recommending specific products):
${productList}

IN-CLINIC ESTHETIC SERVICES (ONLY use these when recommending services):
${serviceList}

OUTPUT FORMAT (VERY IMPORTANT):
You MUST reply in this exact structure:

FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 sentences explaining what this type typically means cosmetically, including sun response and pigmentation/PIH tendencies>

<then a blank line>

[Section 1] Welcome & Important Notice (1 short paragraph)
- Explain this is a cosmetic, entertainment-only analysis, not medical advice.

[Section 2] Initial Visual Impression
- Based on age range and concern, describe the likely patterns in texture, tone, hydration, and glow (without sounding like you saw a clinical exam).

[Section 3] Fitzpatrick Skin Type – Cosmetic Perspective
- Briefly restate the type in human-friendly language.
- Explain what this means for sun, pigmentation risk, and cosmetic aging.

[Section 4] Aging Prognosis (Cosmetic Only)
- Describe how their skin is likely to age cosmetically given age range and concern.
- No disease language, only appearance-oriented.

[Section 5] Deep Dive on Primary Concern
- Explain what may be happening cosmetically with their MAIN concern (acne / aging / pigmentation / redness / texture / dryness).
- If they asked a question, address it here in a broad, non-medical way.

[Section 6] At-Home Skincare Plan Using Dr. Lazuk Cosmetics
- Morning routine: list specific product names from the product list and how to use them.
- Evening routine: list specific product names and how to use them.
- Weekly or cycle-based suggestions (e.g., masks) using only the listed products.

[Section 7] In-Clinic Esthetic Treatment Roadmap
- Recommend 1–3 in-clinic services from the list, explain:
  - What each does in plain language.
  - Why it matches their concern and Fitzpatrick type.
  - What kind of cosmetic improvements they might notice over time.

[Section 8] Lifestyle & Skin Habit Coaching
- Simple, realistic habits that support their concern (sleep, gentle cleansing, avoiding over-exfoliation, sun protection, etc.).

[Section 9] Important Reminder & Next Steps
- Reiterate that this is NOT medical advice.
- Encourage seeing a qualified in-person professional for any medical concerns.
- Invite them to contact or visit Dr. Lazuk Esthetics® in Georgia for in-person care.

Do NOT output JSON. Follow the format exactly: the two header lines, blank line, then narrative sections.
`.trim();

  const userPrompt = `
Person details:

- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question (if any): ${visitorQuestion || 'none provided'}

Please infer a plausible Fitzpatrick type based on typical patterns for this age and concern, but emphasize that it is an estimate and cosmetic-only.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.5,
      max_tokens: 1800,
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

    // Normalize type and build Fitzpatrick scale HTML
    const normalizedType = fitzpatrickType
      ? fitzpatrickType.toString().toUpperCase().replace(/[^IVX\d]/g, '')
      : null;

    const fpBoxes = ['I', 'II', 'III', 'IV', 'V', 'VI'];

    let fitzScaleHtml = '';
    if (normalizedType) {
      fitzScaleHtml = `
        <div style="display:flex; gap:4px; margin-top:8px;">
          ${fpBoxes
            .map((t) => {
              const active = normalizedType === t;
              const bg = active ? '#F59E0B' : '#F9FAFB';
              const color = active ? '#FEFCE8' : '#374151';
              const border = active ? '#D97706' : '#E5E7EB';
              const fontWeight = active ? '700' : '500';
              return `
                <div style="
                  flex:1;
                  text-align:center;
                  font-size:11px;
                  padding:4px 0;
                  border:1px solid ${border};
                  border-radius:999px;
                  background-color:${bg};
                  color:${color};
                  font-weight:${fontWeight};
                ">
                  ${t}
                </div>
              `;
            })
            .join('')}
        </div>
        <p style="font-size:11px; color:#92400E; margin-top:6px;">
          Type I is very fair and tends to burn easily; Type VI is deeply pigmented and rarely burns. This is a cosmetic estimate only, not a medical classification.
        </p>
      `;
    }

    // Visitor email HTML (with selfie + Fitz scale)
    const visitorHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Your Dr. Lazuk Virtual Skin Analysis</h1>
        <p style="font-size: 13px; color: #4B5563; margin-bottom: 16px;">
          This cosmetic analysis is for entertainment and educational purposes only and is not medical advice.
        </p>

        ${
          safePhotoDataUrl
            ? `
        <div style="margin: 12px 0 20px 0;">
          <p style="font-size: 11px; color:#6B7280; margin: 0 0 4px 0;">
            The photo you shared for this cosmetic analysis:
          </p>
          <img
            src="${safePhotoDataUrl}"
            alt="Your submitted selfie"
            style="max-width: 220px; border-radius: 12px; border: 1px solid #E5E7EB;"
          />
        </div>
        `
            : ''
        }

        ${
          normalizedType || fitzpatrickSummary
            ? `
        <div style="border: 1px solid #FCD34D; background-color: #FFFBEB; padding: 12px 16px; margin-bottom: 16px;">
          <h2 style="font-size: 14px; font-weight: 700; color: #92400E; margin: 0 0 4px 0;">
            Fitzpatrick Skin Type (Cosmetic Estimate)
          </h2>
          ${
            normalizedType
              ? `<p style="font-size: 13px; font-weight: 600; color: #92400E; margin: 0 0 4px 0;">
              Type ${normalizedType}
            </p>`
              : ''
          }
          ${
            fitzpatrickSummary
              ? `<p style="font-size: 13px; color: #92400E; margin: 0 0 4px 0;">${fitzpatrickSummary}</p>`
              : ''
          }
          ${fitzScaleHtml}
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
        <p style="font-size: 12px; color: #6B7280;">
          With care,<br/>
          Dr. Lazuk Esthetics® &amp; Dr. Lazuk Cosmetics®<br/>
          <a href="mailto:contact@skindoctor.ai" style="color: #111827; text-decoration: underline;">
            contact@skindoctor.ai
          </a>
        </p>
      </div>
    `;

    const clinicEmail =
      process.env.RESEND_CLINIC_EMAIL || 'contact@skindoctor.ai';

    // Clinic email – includes selfie + basic metadata + full report
    const clinicHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">
          New Virtual Skin Analysis – Cosmetic Report
        </h1>
        <p style="font-size: 13px; color: #4B5563; margin-bottom: 8px;">
          A visitor completed the Dr. Lazuk virtual skin analysis.
        </p>
        <ul style="font-size: 13px; color: #374151; margin-bottom: 12px;">
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Age Range:</strong> ${ageRange}</li>
          <li><strong>Primary Concern:</strong> ${safeConcern}</li>
          ${
            normalizedType
              ? `<li><strong>Fitzpatrick Estimate:</strong> Type ${normalizedType}</li>`
              : ''
          }
        </ul>
        ${
          fitzpatrickSummary
            ? `<p style="font-size: 13px; margin-bottom: 12px;"><strong>Fitzpatrick Summary:</strong> ${fitzpatrickSummary}</p>`
            : ''
        }
        ${
          safePhotoDataUrl
            ? `
        <div style="margin: 12px 0 16px 0;">
          <p style="font-size: 11px; color:#6B7280; margin: 0 0 4px 0;">
            Visitor-provided photo (for cosmetic context only):
          </p>
          <img
            src="${safePhotoDataUrl}"
            alt="Submitted selfie"
            style="max-width: 180px; border-radius: 10px; border: 1px solid #E5E7EB;"
          />
        </div>
        `
            : ''
        }
        <hr style="border-top: 1px solid #E5E7EB; margin: 16px 0;" />
        <pre style="white-space: pre-wrap; font-size: 13px; color: #111827;">
${reportText}
        </pre>
      </div>
    `;

    // Send visitor + clinic emails (non-blocking from UX perspective)
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

    // JSON response to the frontend (unchanged shape, but now also has selfie + Fitz server-side)
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

