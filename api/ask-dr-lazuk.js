// api/ask-dr-lazuk.js
// Chat-style "Ask Dr. Lazuk" endpoint with:
// - Safety / disclaimer
// - Optional US-only geo restriction
// - In-memory rate limiting per client

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

  // ---------- RATE LIMITING ----------

  // e.g. max 30 chat requests per 15 minutes per client
  const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const RATE_LIMIT_MAX_REQUESTS = 30;

  // module-level store: Map<clientId, { count, start }>
  if (!globalThis.__ASK_DR_LAZUK_RATE_STORE__) {
    globalThis.__ASK_DR_LAZUK_RATE_STORE__ = new Map();
  }
  const rateLimitStore = globalThis.__ASK_DR_LAZUK_RATE_STORE__;

  function getClientId(req) {
    const headerIp =
      req.headers["x-real-ip"] ||
      (Array.isArray(req.headers["x-real-ip"])
        ? req.headers["x-real-ip"][0]
        : null) ||
      req.headers["x-forwarded-for"] ||
      (Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : null);

    const ip = (headerIp || "").toString().split(",")[0].trim() || "unknown_ip";

    const userKey =
      (req.headers["x-user-key"] &&
        req.headers["x-user-key"].toString().trim()) ||
      "";

    return userKey ? `${ip}:${userKey}` : ip;
  }

  function isRateLimited(clientId) {
    const now = Date.now();
    const existing = rateLimitStore.get(clientId);

    if (!existing) {
      rateLimitStore.set(clientId, { count: 1, start: now });
      return false;
    }

    if (now - existing.start > RATE_LIMIT_WINDOW_MS) {
      // reset window
      rateLimitStore.set(clientId, { count: 1, start: now });
      return false;
    }

    existing.count += 1;
    if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
      return true;
    }

    return false;
  }

  const clientId = getClientId(req);
  if (isRateLimited(clientId)) {
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      message:
        "You’ve reached the current chat request limit. Please wait a little while before trying again.",
    });
  }

  // ---------- EXISTING BODY / SAFETY LOGIC ----------

  const { messages, isFirstReply } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_body",
      message: "messages array is required",
    });
  }

  // Optional: same US-only geo restriction as the analysis if you want consistency
  const country = req.headers["x-vercel-ip-country"];
  if (country && country !== "US") {
    return res.status(403).json({
      ok: false,
      error: "geo_restricted",
      message:
        "The Dr. Lazuk virtual skincare assistant chat is currently available to U.S. visitors only.",
    });
  }

  const systemPrompt = `
You are Dr. Iryna Lazuk, a dermatologist and founder of Dr. Lazuk Esthetics® and Dr. Lazuk Cosmetics® in Johns Creek, Georgia.

IMPORTANT SAFETY RULES:
- This chat is for GENERAL EDUCATION and ENTERTAINMENT ONLY.
- Do NOT give medical diagnoses.
- Do NOT say anything is a cure.
- Do NOT tell people to stop or change prescription medications.
- Always encourage in-person consultation with a licensed medical professional for personal medical questions.

TONE & STYLE:
- Warm, clear, honest, reassuring, and professional.
- Speak in first person as "I".
- Keep answers practical and easy to follow.
- When appropriate, you may reference in-clinic esthetic services (facials, PRP, eMatrix RF, roller massage, HIEMT, beauty injectables) and Dr. Lazuk Cosmetics skincare products in a natural, non-pushy way.

If a user’s question sounds urgent or serious (sudden changes, severe pain, bleeding, infection, rapidly growing lesion, etc.), clearly recommend they seek prompt in-person medical evaluation.
`;

  // Map frontend history to OpenAI format (we add the system message server-side)
  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: chatMessages,
          max_tokens: 800,
          temperature: 0.7,
        }),
      }
    );

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
    let reply =
      data?.choices?.[0]?.message?.content ||
      "I'm sorry, I wasn’t able to generate a response just now.";

    // On the first AI reply of the chat, explicitly prepend the disclaimer
    if (isFirstReply) {
      const disclaimer =
        "Important: This conversation is for general education and entertainment only and is not medical advice. For any personal or urgent concerns, please see a licensed medical professional.\n\n";
      reply = disclaimer + reply;
    }

    return res.status(200).json({
      ok: true,
      reply,
    });
  } catch (error) {
    console.error("ask-dr-lazuk error:", error);
    return res.status(500).json({
      ok: false,
      error: "openai_request_failed",
      message: String(error?.message || error),
    });
  }
}

