// api/ask-dr-lazuk.js
// Dr. Lazuk Q&A endpoint with basic IP-based rate limiting

// ---- Simple in-memory rate limiting (per server instance) ----
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 10;          // 10 requests per 15 minutes per IP

// Store of { ip: { count, windowStart } }
const rateLimitStore = new Map();

function getClientIp(req) {
  // Try common headers Vercel/Node will expose
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  const vercelIp = req.headers['x-vercel-ip'];

  if (typeof xRealIp === 'string' && xRealIp) return xRealIp;

  if (typeof xForwardedFor === 'string' && xForwardedFor) {
    // "ip1, ip2, ip3"
    return xForwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
    return xForwardedFor[0];
  }

  if (typeof vercelIp === 'string' && vercelIp) return vercelIp;

  return 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const existing = rateLimitStore.get(ip);

  // First time we've seen this IP, or window has expired
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return { limited: false, retryAfterMs: 0 };
  }

  // Still within the current window
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - existing.windowStart);
    return { limited: true, retryAfterMs };
  }

  existing.count += 1;
  rateLimitStore.set(ip, existing);
  return { limited: false, retryAfterMs: 0 };
}

// ---- Main handler ----

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'OPENAI_API_KEY is not set in the environment'
    });
  }

  const { messages, isFirstReply } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_body',
      message: 'messages array is required'
    });
  }

  // Geo restriction (US-only)
  const country = req.headers['x-vercel-ip-country'];
  if (country && country !== 'US') {
    return res.status(403).json({
      ok: false,
      error: 'geo_restricted',
      message:
        'The Dr. Lazuk virtual skincare assistant chat is currently available to U.S. visitors only.'
    });
  }

  // ---- Rate limiting check ----
  const ip = getClientIp(req);
  const { limited, retryAfterMs } = checkRateLimit(ip);

  if (limited) {
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    // Optional: standard Retry-After header (in seconds)
    res.setHeader('Retry-After', String(retryAfterSeconds));

    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      message:
        'You’ve reached the temporary limit for how many questions you can ask in a short time. Please wait a bit and try again.',
      retryAfterMs
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
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: chatMessages,
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(500).json({
        ok: false,
        error: 'openai_http_error',
        status: response.status,
        body: errorBody
      });
    }

    const data = await response.json();
    let reply =
      data?.choices?.[0]?.message?.content ||
      "I'm sorry, I wasn’t able to generate a response just now.";

    // On the first AI reply of the chat, explicitly prepend the disclaimer
    if (isFirstReply) {
      const disclaimer =
        'Important: This conversation is for general education and entertainment only and is not medical advice. For any personal or urgent concerns, please see a licensed medical professional.\n\n';
      reply = disclaimer + reply;
    }

    return res.status(200).json({
      ok: true,
      reply
    });

  } catch (error) {
    console.error('ask-dr-lazuk error:', error);
    return res.status(500).json({
      ok: false,
      error: 'openai_request_failed',
      message: String(error?.message || error)
    });
  }
}

