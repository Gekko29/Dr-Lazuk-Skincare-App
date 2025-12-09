// api/openai-test.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Simple, cheap test: ask OpenAI for a tiny response
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: "Respond with exactly this text: OK-DR-LAZUK",
        },
      ],
      max_tokens: 10,
    });

    const text = completion.choices?.[0]?.message?.content ?? "";

    return res.status(200).json({ ok: true, result: text });
  } catch (error) {
    console.error("OpenAI test error:", error);
    return res.status(500).json({ ok: false, error: "OpenAI request failed" });
  }
}
