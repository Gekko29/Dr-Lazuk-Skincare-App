// api/openai-test.js
//
// Simple OpenAI connectivity test using fetch instead of the openai SDK.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is not set in the environment",
    });
  }

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
          {
            role: "user",
            content: "Respond with exactly this text: OK-DR-LAZUK",
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(500).json({
        ok: false,
        error: "OpenAI HTTP error",
        status: response.status,
        body: errorBody,
      });
    }

    const data = await response.json();
    const text =
      data?.choices?.[0]?.message?.content || "(no content from OpenAI)";

    return res.status(200).json({ ok: true, result: text });
  } catch (error) {
    console.error("OpenAI test error:", error);
    return res.status(500).json({
      ok: false,
      error: "OpenAI request failed",
      details: String(error?.message || error),
    });
  }
}
