// api/openai-test.js (CommonJS version)

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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

    const text =
      (completion.choices &&
        completion.choices[0] &&
        completion.choices[0].message &&
        completion.choices[0].message.content) ||
      "";

    return res.status(200).json({ ok: true, result: text });
  } catch (error) {
    console.error("OpenAI test error:", error);
    return res.status(500).json({
      ok: false,
      error: "OpenAI request failed",
      // You can temporarily uncomment this line if you really need to see details in the browser:
      // details: String(error?.message || error)
    });
  }
};
