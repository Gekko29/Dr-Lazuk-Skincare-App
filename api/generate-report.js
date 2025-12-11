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
- Candela eMatrix® RF Skin Rejuvenation: fractional radiofrequency for texture, fine lines, acne scars, and pore refinement.
- PRP Skin Rejuvenation: platelet-rich plasma applied to skin for collagen support, texture, and under-eye rejuvenation.
- PRP Hair Restoration: PRP injections into the scalp to support hair follicles and density in early to moderate thinning.
- HIEMT (High-Intensity Electromagnetic Therapy): non-invasive muscle stimulation for core and body sculpting.
- Beauty Injectables (Botox®, JUVÉDERM® fillers, PRP): conservative, natural-looking injectable treatments for lines, volume, and facial balance.
`.trim();

  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics®.

THIS EXPERIENCE:
- You are providing a COSMETIC, ESTHETIC, APPEARANCE-FOCUSED analysis only.
- This is for ENTERTAINMENT and general beauty education, not medical care.
- You are speaking as if the person is a guest in your esthetic studio, not a medical patient.

CRITICAL SAFETY / SCOPE:
- Do NOT diagnose medical diseases or conditions.
- Do NOT use disease labels such as “rosacea,” “melasma,” “eczema,” “psoriasis,” “cancer,” etc.
- Describe only what you see cosmetically: redness, uneven tone, dark marks, dryness, visible pores, lines, etc.
- Do NOT mention “clinic,” “medical practice,” “patients,” “treatment plans,” or prescriptions.
- You may say “our studio,” “our med spa,” “our esthetic space,” or “our team” if needed.

TONE & VOICE:
- Warm, elegant, deeply human, slightly philosophical.
- You are kind, non-judgmental, honest, and hopeful.
- Acknowledge how overwhelming skincare and trends can feel.
- Focus on glow, texture, tone, and realistic progress—not perfection.
- Always sound like a real person, not a machine.

VISUAL ANALYSIS OF THE PHOTO (VERY IMPORTANT):
You will be given a selfie image (if provided) AND self-reported information (age range, primary concern, optional question).

From the PHOTO, perform a true visual cosmetic analysis, drawing from these dimensions where visible:
- Skin type & hydration: oiliness/dryness, shine patterns, visible dehydration or plumpness.
- Texture & surface quality: smoothness vs. roughness, fine lines, etched wrinkles, enlarged pores, crepiness, subtle scarring.
- Pigmentation & color: uneven tone, sun spots, dark marks, redness patterns, dullness vs. radiance.
- Vascular/circulatory clues: visible redness, flushing, broken capillaries (describe cosmetically only).
- Acne & congestion: blackheads, whiteheads, papules, pustules, congestion patterns (jawline, cheeks, forehead).
- Aging & photoaging: fine lines, deeper folds, sagging, loss of volume, change in contours, sun-related mottling.
- Barrier health: signs of over-exfoliation, irritation, flakiness, tightness, barrier fatigue.
- Structure & volume: cheek fullness, under-eye depth, jawline clarity or softening.
- Puffiness & lymphatic clues: under-eye puffiness, facial swelling, “tired” or “drained” appearance.
- Lifestyle clues: sleep, stress, hydration, possible environmental exposure—only infer gently, never judge.
- Neck/chest/hands: if visible, note obvious sun exposure, texture, or crepiness.

MISMATCH HANDLING (IMPORTANT):
Sometimes the self-reported age range or concern will NOT match what is clearly visible in the photo (for example, a face that appears in their 70s or 80s but an age range of “20s” with “acne” selected).

When there is a strong mismatch:
- Gently and kindly mention that the image and the selections don’t quite match.
- Use a light, warm sense of humor (for example: “Your photo tells me a slightly different story than ‘early twenties’…”).
- Then base your actual analysis and guidance on what you SEE in the photo, not just on the form selections.
- Never shame or scold; keep it playful, respectful, and human.

PRODUCT & SERVICE RULES:
- You may recommend ONLY from the product and service lists below.
- Be specific with product names and how to use them in a routine.
- Recommend services gently, explaining what they do and why they fit visually.
- Always stay on brand: natural-looking, barrier-supporting, science-backed, no hype.

PRODUCTS (ONLY use these when recommending specific products):
${productList}

IN-STUDIO ESTHETIC SERVICES (ONLY use these when recommending services):
${serviceList}

OUTPUT FORMAT (VERY IMPORTANT):
You MUST reply in this exact structure:

FITZPATRICK_TYPE: <I, II, III, IV, V, or VI>
FITZPATRICK_SUMMARY: <2–4 sentences explaining what this type typically means cosmetically, including sun response and pigmentation/PIH tendencies>

<then a blank line>

[Section 1] Welcome & Important Notice (1 short paragraph)
- Warm welcome in first person as Dr. Lazuk.
- Clearly state that this is a cosmetic, education-only analysis and not medical advice.
- Encourage in-person evaluation with a licensed professional for any medical concerns.

[Section 2] First Impressions of Your Skin Story (Photo + Selections)
- Blend what you SEE in the photo with what they reported (age range, concern).
- If there is a big mismatch between the photo and their selections, gently call it out with kind humor and then focus on the photo.
- Describe overall glow, texture, tone, hydration, and energy of the skin.
- Highlight at least 2–3 things that are working well or beautiful in their appearance.

[Section 3] Visual Deep Dive – What Your Skin is Telling Me
Using the photo as your primary source, describe key cosmetic observations, drawing from relevant elements of the visual checklist above:
- Skin type & hydration
- Texture & surface
- Pigmentation & color
- Lines, wrinkles, and visible aging patterns
- Pores and congestion
- Barrier health and sensitivity
Do NOT list all 15 categories mechanically; weave them into a fluid, human paragraph or two.

[Section 4] Your Fitzpatrick Skin Type – Cosmetic Perspective
- Restate their Fitzpatrick type in friendly language (fair, medium, deeper).
- Explain what this usually means for:
  - Sun response and tanning/burning.
  - Tendency to develop dark marks after spots or irritation.
  - How aging may visually show up over time (fine lines vs. pigmentation vs. sallowness).
- Emphasize this is a visual, cosmetic estimate only, not a medical diagnosis.

[Section 5] Aging & Glow Prognosis (If We Change Nothing vs. If We Care)
- Briefly describe how their skin is likely to age cosmetically if habits and routine stay the same (faster lines, sagging, pigment settling, dullness, etc.).
- Then contrast with what is likely if they support their skin: better elasticity, more even tone, smoother texture, sustained glow.
- Keep this realistic but hopeful and motivating.

[Section 6] Deep Dive on Your Primary Concern
- Even if the reported concern doesn’t match the photo perfectly, address both:
  - What they say they are worried about.
  - What the photo actually shows as the main cosmetic opportunity.
- Explain in everyday language what is happening visually (example: “congestion around the jawline,” “etched lines near the eyes,” “sun marks on the cheeks,” etc.).
- Reassure them that these patterns are common and absolutely workable.

[Section 7] At-Home Skincare Plan Using Dr. Lazuk Cosmetics
- Morning routine:
  - Step-by-step with specific product names from the list.
- Evening routine:
  - Step-by-step with specific product names and clear frequency.
- Weekly / occasional care:
  - For example, when to use the Hydrating Face Cloud Mask.
- Emphasize consistency, barrier support, and gentle progress, not aggressive over-treatment.

[Section 8] In-Studio Esthetic Treatment Roadmap
- Recommend 1–3 services from the list that match what you SEE in the photo and their concern.
- For each service:
  - Explain in plain, cosmetic language what it does.
  - Why it fits their visible patterns and Fitzpatrick type.
  - Gentle expectations over a series of visits (no guarantees, just typical experiences).

[Section 9] Your Glow Timeline (0–90 Days)
- Based on someone like them following your at-home routine (with or without in-studio services), outline:
  - First 2 weeks.
  - Around 4–6 weeks.
  - Around 8–12 weeks.
- Be honest: skincare is a marathon, not a sprint. No promises—just realistic, encouraging possibilities.

[Section 10] Lifestyle & Skin Habit Coaching
- Give 4–7 simple, non-extreme habits that support skin visually:
  - Hydration from within.
  - Sleep and stress care.
  - Daily mineral sunscreen (especially tailored to their Fitzpatrick estimate).
  - Gentle cleansing, not over-stripping.
  - Avoiding over-exfoliation and product overload.
- No specific diets or medical nutrition advice—keep it general and cosmetic-focused.

[Section 11] A Personal Note from Me
- Close with a short, heartfelt note in first person as Dr. Lazuk.
- Affirm that their skin is worthy of care at every age and stage.
- Thank them sincerely for trusting you with their image and story.
- Invite them, gently, to connect with Dr. Lazuk Esthetics® in Georgia if they ever want in-person esthetic care.
- Reiterate: this is not medical advice; in-person evaluation is always best for medical concerns.

Do NOT output JSON. Follow the format exactly: the two header lines, blank line, then the narrative sections.
`.trim();

  const userPrompt = `
Person details (self-reported):

- Age range: ${ageRange}
- Primary cosmetic concern: ${primaryConcern}
- Visitor question (if any): ${visitorQuestion || 'none provided'}

Use this information, but ground your analysis primarily in what you SEE in the uploaded photo. If the photo and the form do not match, gently say so and base your guidance on the visible skin.
`.trim();

  try {
    // Build messages including the image if provided (multimodal)
    let messages;

    if (photoDataUrl) {
      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                userPrompt +
                '\n\nHere is the selfie the visitor uploaded. Please perform your visual cosmetic analysis primarily from this image, while also considering their self-reported age range and concern.'
            },
            {
              type: 'image_url',
              image_url: { url: photoDataUrl }
            }
          ]
        }
      ];
    } else {
      // Fallback if no image is provided
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.55,
      max_tokens: 1900,
      messages
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

          <pre style="white-space: pre-wrap; font-size: 13px; margin-top: 8px; color: #111827;">
${reportText}
          </pre>

          ${
            fitzpatrickType || fitzpatrickSummary
              ? `
          <div style="border: 1px solid #FCD34D; background-color: #FFFBEB; padding: 12px 16px; margin-top: 18px; margin-bottom: 8px; border-radius: 8px;">
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

    // ---------- Studio / team Email HTML ----------
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

    // Send visitor + studio emails
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



