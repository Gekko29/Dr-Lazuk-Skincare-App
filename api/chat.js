// api/chat.js
// Unified endpoint for:
// 1) Personalized skin analysis letter ("analysis" mode – no OpenAI call)
// 2) Ask-Dr-Lazuk Q&A ("qa" mode – uses OpenAI)

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DR_LAZUK_QA_SYSTEM_PROMPT = `
You are Dr. Iryna Lazuk — a board-certified dermatologist, founder, educator, 
and the warm, charismatic clinical voice of Dr. Lazuk Esthetics®.

Your tone is:
- Elegant
- Empathetic
- Nurturing
- Philosophical
- Uplifting
- Deeply personal

You speak to clients as if they are sitting in your treatment chair, 
and you see the emotional story behind their skin.

When answering questions:
- Use plain language; avoid heavy medical jargon.
- Be kind, reassuring, and realistic.
- Offer practical, step-by-step guidance.
- Do NOT sound robotic or generic.
- Do NOT make diagnoses; instead, speak in terms of likelihoods and guidance.
- Do NOT mention that you are an AI or language model.

You ALWAYS close each answer with:
"May your skin always glow as bright as your smile. ~ Dr. Lazuk"
`.trim();

/**
 * Build the personalized skin analysis narrative using
 * the conversational Dr. Lazuk letter we designed.
 *
 * This is pure template logic (no OpenAI call).
 *
 * Expected body.analysis structure:
 * {
 *   complimentFeatures?: string,
 *   skinFindings?: string,
 *   texture?: string,
 *   poreBehavior?: string,
 *   pigment?: string,
 *   fineLinesAreas?: string,
 *   elasticity?: string,
 *   eveningActive?: string,
 *   estheticRecommendations?: string
 * }
 */
function buildAnalysisLetter(analysis = {}) {
  const {
    complimentFeatures = "there is a softness in the way your features come together that feels very natural and kind",
    skinFindings = "gentle signs of dehydration, early expression lines, and a touch of uneven tone that is very common",
    texture = "subtle areas of roughness that suggest your barrier is asking for more hydration and calm",
    poreBehavior = "pores that appear a bit more visible in your central T-zone when your skin is tired or stressed",
    pigment = "some areas of lingering sun-kissed pigment that have stayed longer than you’d like",
    fineLinesAreas = "around your eyes and perhaps softly across your forehead",
    elasticity = "a hint of loosened bounce in certain areas that tells me collagen wants more support",
    eveningActive = "a gentle, low-strength retinoid used a few nights a week, or a mild mandelic acid serum if your skin is very sensitive",
    estheticRecommendations = "HydraFacials for clarity and glow, and microneedling or PRP if you ever wish to focus more deeply on collagen and firmness"
  } = analysis;

  return `
My beautiful friend,

The moment your photo appeared, something about you immediately drew me in — ${complimentFeatures} — and I want you to know how lovely that small detail felt to me. It's often the tiniest expressions that reveal the most about someone’s energy. And as I look at your skin now, I don’t just see surface details; I see the story your lifestyle, stress, environment, and routines have been writing quietly over time.

Your skin is whispering. Everything it shows me — ${skinFindings}, the way the light rests on certain areas, the way your pores behave when they’re tired, the delicate patterns of pigment — these are not flaws. They are simply honest conversations your skin is trying to have with you. And I’m here to translate them gently.

There are subtle signs that your barrier has been working a little too hard for you lately. I see ${texture}, ${poreBehavior}, and the beginnings of expression lines ${fineLinesAreas} — all perfectly normal, but each one telling me that your skin is craving deeper support, nourishment, and consistency. None of this worries me. These are the exact conditions that respond beautifully when we show the skin a new way forward.

But before I tell you what I expect for you when you follow the right path… let me talk to you softly about what happens when someone continues down the same routine, without shifting habits or supporting their skin’s deeper needs.

Skin is alive. It remembers everything — the late nights, the skipped hydration, the stress, the sugar, the quick cleanses, the forgotten sunscreen. When we don’t listen to its early requests, skin begins to age in a way that feels faster than it should. Lines that were once faint can settle more deeply. Skin can gradually lose its firmness, almost like it’s giving up its structure too soon. The glow dims. Pigment settles. Pores stretch. Elasticity softens, and the contours of the face begin to blur earlier than nature ever intended — not because you are doing anything “wrong,” but simply because your skin doesn’t yet have what it truly needs.

I want you to hear this with love:
Your skin wants to thrive. It just needs your participation.

And one of the most powerful ways you can participate is by nourishing yourself from within. My entire philosophy — and the results my patients experience — always begin with hydration, sleep, whole foods, and movement. You cannot glow on the outside if you’re dehydrated internally. You cannot expect elastic, youthful skin if your body is exhausted. You cannot out-mask, out-serum, or out-spa a lifestyle that leaves your cells thirsty.

When you hydrate deeply — truly hydrate, with water, mineral-rich fluids, and whole, living foods — something miraculous happens. Fine lines soften. Inflammation quiets. Your barrier becomes stronger, more resilient. Your under-eyes look brighter. Your texture begins to feel velvety and calm. Pair this with plenty of sleep, nourishing meals, colorful plants, healthy fats, daily movement that brings blood flow to your face, and moments of real rest, and suddenly your skin is no longer working against life… it’s working with it.

But let me bring you back to your transformation, because your potential is extraordinary.

If you nourish your skin inside and out, your journey will unfold in beautiful stages. Within the first two weeks, you will feel your face soften — that subtle tightness or dull look begins to ease. By four to six weeks, your pores will look more refined, your tone brighter, and your skin more even and calm. Around three months, people start to notice — the kind of noticing you can’t fake. They may not know exactly what changed, but they’ll sense that you look more rested, more luminous, more “you.”

Between six and nine months, deeper transformation reveals itself. Collagen begins to respond to the kindness you’ve been giving it. Your skin’s elasticity improves, and the way light reflects off your face feels more harmonious and smooth. By one year, your skin becomes a new baseline — not a temporary “good phase,” but a sustained level of radiance, firmness, and calm that feels like the new normal.

And this is where esthetic treatments gently enter the story, only if and when you want them to. If you ever decide to elevate your results beyond products and lifestyle, I would guide you toward options like ${estheticRecommendations}. They are not requirements. They are invitations — beautiful tools I can use to help your skin go even further once the foundation is strong.

Your daily Glow Routine, however, will be your anchor — the rhythm that steadies your skin and sets the foundation for every improvement you will see.

In the morning, begin by cleansing with my Rejuvenating Face Wash, massaging it slowly so that it can lift away the night without disturbing your natural barrier. Then, brighten your skin with a niacinamide or vitamin C step to gently refine pores and even your tone. After that, apply my Rehydrating Face Emulsion with Centella and peptides — this is where your barrier is strengthened, your collagen is whispered back awake, and your skin is soothed. Finally, protect everything you’ve just done with my Natural Mineral Sunscreen, which shields you from the quiet, daily UV exposure that is responsible for so much visible aging.

In the evening, cleanse again with intention, letting the day melt away from your skin. Then use an active step that is carefully chosen for your skin’s needs — for you, I would suggest ${eveningActive}, used thoughtfully and not excessively. Follow with a generous layer of the Rehydrating Face Emulsion to feed your skin peptides and calm overnight. If your barrier feels tired or overworked, add a soothing mask once or twice a week, like tucking your skin under a warm, comforting blanket.

Follow this rhythm, and all the little whispers your skin has been trying to tell you — the tightness, the roughness, the unevenness, the early slackening — will soften, and then gradually fade.

Before I close, I want to say something from my heart.

Thank you — truly — for trusting me with something as intimate as your skin. I never take that trust lightly. And as a small expression of my gratitude, I’ll be sending you a special thank-you soon… just a gentle token from me to you, to remind you how honored I am to be part of your journey.

You are doing beautifully. And your skin is about to do even better.

May your skin always glow as bright as your smile. ~ Dr. Lazuk
  `.trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = req.body || {};

    // mode: "analysis" → build narrative locally
    // mode: "qa"       → Ask Dr Lazuk (OpenAI)
    //
    // Backwards compatibility:
    // - If body.analysis exists → analysis
    // - Else if question/messages exist → qa
    const explicitMode = body.mode;
    const inferredMode =
      explicitMode ||
      (body.analysis ? "analysis" : body.question || body.messages ? "qa" : null);

    if (!inferredMode) {
      return res.status(400).json({
        error:
          "Invalid request. Provide either 'mode: analysis' with 'analysis' data or 'mode: qa' with 'question' / 'messages'.",
      });
    }

    // ANALYSIS MODE
    if (inferredMode === "analysis") {
      const analysis = body.analysis || {};
      const letter = buildAnalysisLetter(analysis);
      return res.status(200).json({ mode: "analysis", output: letter });
    }

    // Q&A MODE
    if (inferredMode === "qa") {
      const question = body.question;
      const messages = body.messages;

      let openAiMessages;

      if (Array.isArray(messages) && messages.length > 0) {
        openAiMessages = [
          { role: "system", content: DR_LAZUK_QA_SYSTEM_PROMPT },
          ...messages,
        ];
      } else if (typeof question === "string" && question.trim().length > 0) {
        openAiMessages = [
          { role: "system", content: DR_LAZUK_QA_SYSTEM_PROMPT },
          { role: "user", content: question.trim() },
        ];
      } else {
        return res.status(400).json({
          error:
            "For Q&A mode, provide either 'question' (string) or 'messages' (array).",
        });
      }

      const completion = await client.chat.completions.create({
        model: "gpt-4.1",
        messages: openAiMessages,
        temperature: 0.7,
      });

      const answer = completion.choices?.[0]?.message?.content ?? "";

      return res.status(200).json({
        mode: "qa",
        output: answer,
      });
    }

    return res.status(400).json({ error: "Unsupported mode." });
  } catch (error) {
    console.error("API Error in /api/chat:", error);
    return res.status(500).json({
      error:
        "I’m having trouble connecting right now. Please try again in a moment.",
    });
  }
}

