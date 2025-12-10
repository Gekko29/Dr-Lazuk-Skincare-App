// api/analyzeImage.js
// Serverless function to convert an image + optional notes
// into a structured analysis object for the Dr. Lazuk letter.
//
// Deployed on Vercel at: /api/analyzeImage

// Map raw interpreted data into the fields expected by your
// /api/generate-report or /api/chat-like narrative builder.
function mapRawAnalysisToTemplate(raw = {}) {
  const {
    eyeColor,
    wearingGlasses,
    clothingColor,
    globalTexture,
    tZonePores,
    pigmentType,
    pigmentLocation,
    fineLinesRegions,
    elasticityScore,
    lifestyleFlags,
  } = raw;

  // Compliment / feature highlight
  let complimentFeatures =
    "there is a softness in the way your features come together that feels very natural and kind";

  if (eyeColor === "blue") {
    complimentFeatures =
      "the way your bright blue eyes catch the light feels so open and confident";
  } else if (eyeColor === "green") {
    complimentFeatures =
      "your green eyes have a calm, luminous quality that feels very grounding and elegant";
  } else if (eyeColor === "brown") {
    complimentFeatures =
      "your warm brown eyes have a steady, gentle presence that photographs beautifully";
  }

  if (wearingGlasses) {
    complimentFeatures =
      "your glasses give you such a refined, intelligent elegance — they frame your features beautifully";
  }

  if (clothingColor === "pink") {
    complimentFeatures =
      "the soft pink you’re wearing brings a lovely warmth to your complexion and feels very harmonious with your features";
  }

  // High-level skin findings
  const skinFindings =
    globalTexture ||
    "gentle signs of dehydration and a bit of uneven tone that is very common";

  const texture =
    globalTexture ||
    "subtle areas of roughness that suggest your barrier is asking for more hydration and calm";

  const poreBehavior =
    tZonePores ||
    "pores that appear a bit more visible in your central T-zone when your skin is tired or stressed";

  const pigment =
    pigmentType && pigmentLocation
      ? `${pigmentType} that has settled around your ${pigmentLocation}`
      : "some areas of lingering sun-kissed pigment that have stayed longer than you’d like";

  const fineLinesAreas =
    fineLinesRegions ||
    "around your eyes and perhaps softly across your forehead";

  const elasticity =
    typeof elasticityScore === "number"
      ? elasticityScore < 0.4
        ? "a more noticeable softening of firmness that tells me your collagen really wants more consistent support"
        : elasticityScore < 0.7
        ? "a slight softening of firmness that hints at early collagen changes"
        : "a generally good level of firmness with just a touch of early relaxation in certain areas"
      : "a hint of loosened bounce in certain areas that tells me collagen wants more support";

  // Evening actives suggestion
  let eveningActive =
    "a gentle, low-strength retinoid used a few nights a week, or a mild mandelic acid serum if your skin is very sensitive";

  if (lifestyleFlags?.verySensitive) {
    eveningActive =
      "a mandelic acid or polyhydroxy acid serum once or twice a week, with plenty of barrier-repair nights in between";
  } else if (lifestyleFlags?.toleratesActivesWell) {
    eveningActive =
      "a low- to mid-strength retinoid three nights a week, alternating with deeply hydrating, barrier-focused nights";
  }

  const estheticRecommendations =
    "HydraFacials for clarity and glow, and microneedling or PRP if you ever wish to focus more deeply on collagen and firmness";

  return {
    complimentFeatures,
    skinFindings,
    texture,
    poreBehavior,
    pigment,
    fineLinesAreas,
    elasticity,
    eveningActive,
    estheticRecommendations,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { imageBase64, notes } = req.body || {};

    if (!imageBase64 && !notes) {
      return res.status(400).json({
        error:
          "Please provide at least 'imageBase64' or 'notes' in the request body.",
      });
    }

    // Right now this is a *stub* interpretation.
    // You can later plug in real vision analysis here.
    const lowerNotes = (notes || "").toLowerCase();

    const raw = {
      eyeColor: lowerNotes.includes("blue eyes")
        ? "blue"
        : lowerNotes.includes("green eyes")
        ? "green"
        : lowerNotes.includes("brown eyes")
        ? "brown"
        : undefined,
      wearingGlasses: lowerNotes.includes("glasses"),
      clothingColor: lowerNotes.includes("pink top") ? "pink" : undefined,
      globalTexture: lowerNotes.includes("rough")
        ? "noticeable roughness in some areas, especially where the skin feels a bit overworked"
        : undefined,
      tZonePores: lowerNotes.includes("oily t-zone")
        ? "pores that are more visible and active in your T-zone, especially when your skin is oily or stressed"
        : undefined,
      pigmentType: lowerNotes.includes("sun spots")
        ? "soft sun-induced spots"
        : undefined,
      pigmentLocation: lowerNotes.includes("cheeks")
        ? "cheeks"
        : lowerNotes.includes("forehead")
        ? "forehead"
        : undefined,
      fineLinesRegions: lowerNotes.includes("crow's feet")
        ? "around your eyes, especially in the crow's feet area"
        : undefined,
      elasticityScore: lowerNotes.includes("loose")
        ? 0.3
        : lowerNotes.includes("firm")
        ? 0.8
        : undefined,
      lifestyleFlags: {
        verySensitive: lowerNotes.includes("sensitive"),
        toleratesActivesWell: lowerNotes.includes("tolerates actives"),
      },
    };

    const analysis = mapRawAnalysisToTemplate(raw);

    return res.status(200).json({
      success: true,
      raw,
      analysis,
    });
  } catch (error) {
    console.error("Error in /api/analyzeImage:", error);
    return res.status(500).json({
      success: false,
      error:
        "I’m having trouble analyzing the image right now. Please try again in a moment.",
    });
  }
}
