// api/analyzeImage.js
// Image analysis stub: accepts an image + optional notes and returns
// a structured analysis object suitable for the /api/chat analysis mode,
// plus an inferred Fitzpatrick skin type for the UI.

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

// Very simple heuristic Fitzpatrick classifier based on free-text notes.
// This is just a stub so the UI has something meaningful to display.
function inferFitzpatrickTypeFromNotes(notes = "") {
  const text = notes.toLowerCase();

  // Hard signals
  if (text.includes("always burns") || text.includes("never tans")) return 1;
  if (text.includes("very fair") || text.includes("pale")) return 1;
  if (text.includes("fair skin") || text.includes("usually burns")) return 2;
  if (text.includes("sometimes burns") || text.includes("light tan"))
    return 3;
  if (text.includes("olive skin") || text.includes("rarely burns")) return 4;
  if (text.includes("brown skin") || text.includes("very rarely burns"))
    return 5;
  if (text.includes("deeply pigmented") || text.includes("dark brown"))
    return 6;

  // Soft default if nothing specific is mentioned
  return 3; // Type III is the statistical “middle”
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
          "Please provide at least 'imageBase64' or 'notes' for analysis.",
      });
    }

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
    const fitzpatrickType = inferFitzpatrickTypeFromNotes(notes || "");

    return res.status(200).json({
      raw,
      analysis,
      fitzpatrickType,
    });
  } catch (error) {
    console.error("Error in /api/analyzeImage:", error);
    return res.status(500).json({
      error:
        "I’m having trouble analyzing the image right now. Please try again in a moment.",
    });
  }
}

