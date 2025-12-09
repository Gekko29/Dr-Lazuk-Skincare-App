// api/generate-report.js
// Main endpoint to generate the Dr. Lazuk skincare + esthetic report with OpenAI.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is not set in the environment",
    });
  }

  // Geo restriction: US only
  const country = req.headers["x-vercel-ip-country"];
  if (country && country !== "US") {
    return res.status(403).json({
      ok: false,
      error: "geo_restricted",
      message:
        "The Dr. Lazuk Skincare Analysis app is currently available to U.S. visitors only.",
    });
  }

  let body;
  try {
    body = req.body || {};
  } catch {
    body = {};
  }

  const { email, ageRange, primaryConcern, visitorQuestion } = body;

  if (!email || !ageRange || !primaryConcern) {
    return res.status(400).json({
      ok: false,
      error: "missing_fields",
      message: "Email, ageRange, and primaryConcern are required.",
    });
  }

  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® in Johns Creek, Georgia.

RULES:
- This analysis is for ENTERTAINMENT ONLY and is NOT medical advice.
- Do NOT diagnose, do NOT mention diseases, and do NOT suggest prescription-only treatments.
- Focus on skin wellness, cosmetic concerns, and gentle, realistic guidance.
- Never mention that you are an AI; speak in first-person as Dr. Lazuk.

You must always:
1) Provide a structured but conversational report with sections:
   - Initial Skin Snapshot
   - Aging & Skin-Future Outlook (non-scary, supportive)
   - Esthetic Deep-Dive (in-clinic services)
   - Daily Skincare Plan (AM and PM)
   - Lifestyle & Habit Tweaks
   - Important Notice (reminding them this is not medical care)

2) Make recommendations from these APPROVED esthetic services only:
   - Luxury Beauty Facials (1.5-hour comprehensive)
   - Roller Massage (body sculpt + lymphatic support)
   - Candela eMatrix® RF Skin Rejuvenation
   - PRP Skin Rejuvenation
   - PRP Hair Restoration
   - HIEMT body contouring and core-strength treatments
   - Beauty Injectables (Botox®, JUVÉDERM® fillers, PRP)

3) When suggesting a service, always explain:
   - why it fits their age range and primary concern,
   - what results they may see and over what timeframe,
   - any typical number of sessions and expected downtime (if any).

4) Use a tone that is warm, expert, and reassuring—never judgmental.

5) Remind them subtly that a real in-person consultation is needed for any true diagnosis or medical advice.
`;

  const userPrompt = `
Visitor email: ${email}
Age range: ${ageRange}
Primary cosmetic concern: ${primaryConcern}
Visitor question (if any): ${visitorQuestion || "none"}

Create a detailed, easy-to-read entertainment-only skincare analysis and esthetic roadmap, tailored to this age range and concern, using the rules above.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1600,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(500).json({
        ok: false,
        error: "openai_http_error",
        status: response.status,
        body: errorBody,
      });
    }

    const data = await response.json();
    const report =
      data?.choices?.[0]?.message?.content ||
      "I’m sorry, I was unable to generate a report at this time.";

    // TODO: integrate real email sending here using Resend, SendGrid, etc.
    // For now, just return the report to the frontend and let it show it
    // while you work on email delivery.

    return res.status(200).json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error("generate-report error:", error);
    return res.status(500).json({
      ok: false,
      error: "openai_request_failed",
      message: String(error?.message || error),
    });
  }
}
