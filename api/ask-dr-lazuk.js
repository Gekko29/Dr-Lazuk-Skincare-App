// api/ask-dr-lazuk.js
// Dr. Lazuk chat endpoint with:
// - Safety + disclaimer
// - US-only geo gating
// - Soft rate limiting per IP to curb abuse

// ===== Simple in-memory rate limiter (per Lambda instance) =====
const rateLimitStore = new Map();
// Example: 20 requests per 5 minutes per IP
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip) {
  if (!ip) ip = "unknown";

  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  const { count, windowStart } = entry;
  const windowAge = now - windowStart;

  // Window expired → reset
  if (windowAge > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  // Still within window
  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - windowAge;
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  // Increment count
  rateLimitStore.set(ip, { count: count + 1, windowStart });
  return { allowed: true };
}

// ================================================================

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

  const { messages, isFirstReply } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_body",
      message: "messages array is required",
    });
  }

  // ---- Rate limiting per IP ----
  // Try to get a reasonably stable client identifier
  const ipHeader =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "";
  const ip = Array.isArray(ipHeader)
    ? ipHeader[0]
    : typeof ipHeader === "string"
    ? ipHeader.split(",")[0].trim()
    : "unknown";

  const limitResult = checkRateLimit(ip);

  if (!limitResult.allowed) {
    res.setHeader("Retry-After", String(limitResult.retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      message:
        "Too many requests in a short period. Please wait a bit before asking more questions.",
      retryAfterSeconds: limitResult.retryAfterSeconds,
    });
  }

  // ---- Geo restriction (US only) ----
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
`.trim();

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

