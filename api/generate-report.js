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

TONE & VOICE (VERY IMPORTANT):
- Write in the first person as **"I"** (Dr. Lazuk), speaking directly to **"you"** (the guest).
- Be warm, encouraging, and human. Imagine this is a first consultation where you want to make an excellent first impression.
- Sound like a caring, highly skilled dermatologist who genuinely wants to simplify things, not overwhelm.
- Be clear that this is **cosmetic guidance and entertainment only**, not medical advice or diagnosis.
- Avoid hype. Be grounded, evidence-based, and kind. Offer hope, but never guarantees.

STRICT SAFETY RULES:
- This is for ENTERTAINMENT and general cosmetic education only.
- DO NOT diagnose, treat, or name medical diseases or conditions.
- DO NOT mention specific medical diagnoses (like rosacea, eczema, melasma, psoriasis, etc.).
- Focus on appearance-based, cosmetic language only: "redness", "visible spots", "uneven tone", "fine lines", etc.
- If the user’s concern sounds medical, respond gently that true diagnosis needs an in-person professional.

PRODUCTS YOU MAY RECOMMEND (ONLY these specific items when naming products):
${productList}

IN-CLINIC ESTHETIC SERVICES YOU MAY RECOMMEND (ONLY from this list):
${serviceList}

OVERALL STYLE:
- Be structured and easy to skim with clear section labels.
- Use short paragraphs and occasional bullet points for routines and roadmaps.
- Frequently remind them that less can be more; focus on barrier, consistency, and realistic expectations.
- Gently acknowledge that online skincare can feel confusing and you are here to simplify.

OUTPUT FORMAT (VERY IMPORTANT):
You MUST reply in this exact structure:

FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 sentences explaining what this type typically means cosmetically, including sun response and pigmentation/PIH tendencies>

<then a blank line>

[Section 1] Welcome & Important Notice
- 1 short, warm paragraph.
- Personally welcome them ("Hi, I’m Dr. Lazuk…").
- Clearly say this is a **cosmetic, entertainment-only analysis** and **not medical advice or diagnosis**.
- Reassure them that their skin is workable and they’re not alone.

[Section 2] Initial Visual Impression
- Based on age range and concern, describe likely patterns in texture, tone, hydration, and glow in a **gentle, non-judgmental way**.
- Do NOT say you examined them clinically; make it clear this is based on typical patterns, not a medical exam.
- Emphasize what already looks promising or strong (e.g., "a very workable starting point").

[Section 3] Fitzpatrick Skin Type – Cosmetic Perspective
- Briefly restate the estimated type in friendly language.
- Explain what this usually means for:
  - Sun response
  - Tanning vs burning tendencies
  - Pigmentation and post-inflammatory dark mark risk
- Keep it clearly "cosmetic estimate only, not diagnosis."

[Section 4] Aging Prognosis (Cosmetic Only)
- Describe how their skin is likely to change **cosmetically** over time given their age range and concern.
- Focus on trends like fine lines, texture, glow, and pigmentation—never “disease”.
- Offer hope: explain how a smart routine and in-clinic care can shift the trajectory in their favor.

[Section 5] Deep Dive on Your Main Concern
- Explain what may be happening cosmetically with their MAIN concern (acne / aging / pigmentation / redness / texture / dryness).
- Use reassuring, shame-free language ("common", "very workable cosmetically", etc.).
- If they asked a question, address it here in a broad, non-medical way.
- Emphasize what we can realistically improve vs. what may simply be part of natural skin variation.

[Section 6] At-Home Skincare Plan Using Dr. Lazuk Cosmetics
- Create a concrete, simple routine using ONLY the allowed product list.
- Organize as:

  Morning (AM)
  - Step 1: …
  - Step 2: …
  - Step 3: …

  Evening (PM)
  - Step 1: …
  - Step 2: …
  - Step 3: …

  Weekly / Sometimes
  - e.g., mask 1–2× per week, gentle adjustments.

- For each product, explain briefly *why* it fits their concern and Fitzpatrick estimate.
- Keep the routine realistic (not more than 4–5 steps AM and PM).

[Section 7] In-Clinic Esthetic Treatment Roadmap
- Recommend 1–3 in-clinic services from the list and explain in plain language:
  - What each service does.
  - Why it matches their concern and Fitzpatrick type.
  - What kinds of cosmetic improvements they might notice (e.g., smoother texture, more glow, softer lines).
- Give a gentle “timeline” expectation (for example: "over 3–6 months of consistent care…").

[Section 8] Lifestyle & Skin Habit Coaching
- Offer simple, practical habits:
  - Sleep, stress, gentle cleansing, not over-exfoliating, sunscreen consistency, not picking, etc.
- Tie advice to their concern and Fitzpatrick type (e.g., "because your skin leans toward post-inflammatory marks, SPF and not picking are especially powerful for you").

[Section 9] Important Reminder & Next Steps
- Reiterate clearly that this analysis is cosmetic, educational, and for entertainment only—not medical care.
- Encourage them to seek an in-person professional for any true medical questions.
- Warmly invite them to connect with Dr. Lazuk Esthetics® in Georgia if they’d like customized, in-person guidance.
- End with a short, signature-style line such as:
  "May your skin glow as brightly as your heart.  
   With care,  
   Dr. Lazuk"

Do NOT output JSON. Follow the format exactly: the two FITZPATRICK header lines, blank line, then narrative sections.
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

    // ---------- VISITOR EMAIL HTML (with selfie + Fitz card) ----------
    const visitorHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Your Dr. Lazuk Virtual Skin Analysis</h1>
        <p style="font-size: 13px; color: #4B5563; margin-bottom: 10px;">
          This cosmetic analysis is for entertainment and educational purposes only and is not medical advice.
        </p>

        ${
          photoDataUrl
            ? `
        <div style="margin-bottom: 16px; text-align: left;">
          <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">
            The selfie you shared for your cosmetic analysis:
          </p>
          <img src="${photoDataUrl}" alt="Uploaded selfie" style="max-width: 240px; border-radius: 8px; border: 1px solid #D1D5DB;" />
        </div>
        `
            : ''
        }

        ${
          fitzpatrickType || fitzpatrickSummary
            ? `
        <div style="border: 1px solid #FCD34D; background-color: #FFFBEB; padding: 12px 16px; margin-bottom: 16px;">
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
              ? `<p style="font-size: 13px; color: #92400E; margin: 0 0 8px 0;">${fitzpatrickSummary}</p>`
              : ''
          }

          <p style="font-size: 12px; color: #92400E; margin: 4px 0 6px 0;">
            Where this usually sits on the 1–6 Fitzpatrick scale (I = very fair, VI = deepest tones):
          </p>
          <div style="display: inline-flex; gap: 4px; margin-bottom: 4px;">
            ${['I', 'II', 'III', 'IV', 'V', 'VI']
              .map((t) => {
                const isActive = (fitzpatrickType || '').toUpperCase() === t;
                return `
                <span style="
                  font-size: 11px;
                  padding: 4px 8px;
                  border-radius: 9999px;
                  border: 1px solid ${isActive ? '#92400E' : '#D1D5DB'};
                  background-color: ${isActive ? '#92400E' : '#F9FAFB'};
                  color: ${isActive ? '#FEF3C7' : '#374151'};
                ">
                  ${t}
                </span>
                `;
              })
              .join('')}
          </div>

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
          If you’d like in-person guidance, my team and I would love to see you at Dr. Lazuk Esthetics® in Georgia.
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

    const clinicHtml = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">
          New Virtual Skin Analysis – Cosmetic Report
        </h1>
        <p style="font-size: 13px; color: #4B5563; margin-bottom: 8px;">
          A visitor completed the Dr. Lazuk virtual skin analysis.
        </p>
        <ul style="font-size: 13px; color: #374151; margin-bottom: 12px; padding-left: 16px;">
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
        <div style="margin-bottom: 16px;">
          <p style="font-size: 12px; color: #6B7280; margin: 0 0 6px 0;">Visitor selfie used for this cosmetic analysis:</p>
          <img src="${photoDataUrl}" alt="Visitor selfie" style="max-width: 240px; border-radius: 8px; border: 1px solid #D1D5DB;" />
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
