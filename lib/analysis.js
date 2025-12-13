// lib/analysis.js
// Shared analysis helper for the skincare report.
//
// IMPORTANT:
// This file supports TWO call signatures:
// 1) NEW (current): buildAnalysis({ form, selfie, vision })
// 2) LEGACY:        buildAnalysis({ ageRange, primaryConcern, visitorQuestion, imageAnalysis })
//
// It returns a structured context object that the LLM can use for:
// - personalization (selfie compliment + concrete details)
// - fitzpatrick framing (cosmetic estimate)
// - "what your skin is telling me" narrative spine
// - priorities + strategy guidance
// - 0–90 day Glow Timeline scaffold
// - carrying forward the 15-point checklist (if provided by vision)

function mapFitzNumericToRoman(num) {
  const map = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
  if (num === null || num === undefined) return null;
  return map[num] || null;
}

function normalizeRomanFitz(value) {
  if (!value) return null;
  if (typeof value === 'number') return mapFitzNumericToRoman(value);
  const up = String(value).toUpperCase().trim();
  return ['I', 'II', 'III', 'IV', 'V', 'VI'].includes(up) ? up : null;
}

function romanToNumeric(roman) {
  const r = normalizeRomanFitz(roman);
  if (!r) return null;
  return ['I', 'II', 'III', 'IV', 'V', 'VI'].indexOf(r) + 1;
}

function buildFitzpatrickInfo(romanType) {
  const t = normalizeRomanFitz(romanType);
  if (!t) {
    return {
      type: null,
      description:
        'Fitzpatrick type is a cosmetic estimate of how skin typically responds to sun exposure (burning vs. tanning).',
      riskNotes:
        'Because this is based on a photo, it is only a visual estimate — not a medical diagnosis.'
    };
  }

  // Cosmetic-only, no disease naming
  const map = {
    I: {
      description:
        'Type I skin typically burns very easily and tans minimally. It often needs extra daily sun protection to keep tone looking even over time.',
      riskNotes:
        'Cosmetically, sun exposure may show up faster as visible redness and early fine lines. Daily mineral sunscreen is your best long-term “anti-aging insurance.”'
    },
    II: {
      description:
        'Type II skin often burns easily and tans lightly. It tends to show sun-related tone changes relatively quickly without consistent protection.',
      riskNotes:
        'Cosmetically, uneven tone and visible sun marks can appear sooner if sunscreen is inconsistent. Gentle brightening + barrier support pair beautifully here.'
    },
    III: {
      description:
        'Type III skin may burn at first but can gradually tan. It often has a balanced mix of sun sensitivity and tanning response.',
      riskNotes:
        'Cosmetically, you can see both sun marks and post-blemish color lingering if the barrier is stressed. Consistent SPF + calm actives help keep tone refined.'
    },
    IV: {
      description:
        'Type IV skin usually tans more readily and burns less often. It can be more prone to lingering post-blemish discoloration when the skin gets irritated.',
      riskNotes:
        'Cosmetically, the biggest key is “gentle consistency” — avoid over-exfoliation, keep the barrier strong, and protect daily with mineral sunscreen to maintain even tone.'
    },
    V: {
      description:
        'Type V skin tans very easily and rarely burns. It often benefits from careful, barrier-first routines to reduce the chance of lingering dark marks after irritation.',
      riskNotes:
        'Cosmetically, irritation can leave longer-lasting tone changes. Choose calm, supportive formulas and introduce stronger actives slowly, with consistent SPF.'
    },
    VI: {
      description:
        'Type VI skin deeply tans and does not typically burn. It often responds best to steady, low-irritation routines that protect the barrier and keep tone luminous.',
      riskNotes:
        'Cosmetically, inflammation and over-exfoliation can lead to uneven tone that lingers. The most powerful strategy is gentle care + daily sun protection.'
    }
  };

  return {
    type: t,
    description: map[t].description,
    riskNotes: map[t].riskNotes
  };
}

function inferFocusFromConcern(primaryConcern = '') {
  const c = String(primaryConcern || '').toLowerCase();

  if (c.includes('acne') || c.includes('breakout') || c.includes('blemish') || c.includes('congestion')) {
    return 'calming and clearing breakout-prone areas while protecting your barrier';
  }

  if (c.includes('pigment') || c.includes('dark spot') || c.includes('spots') || c.includes('sun') || c.includes('discoloration')) {
    return 'softening uneven pigmentation, sun marks, and lingering dark spots';
  }

  if (c.includes('wrinkle') || c.includes('fine line') || c.includes('aging') || c.includes('ageing') || c.includes('firmness') || c.includes('sag')) {
    return 'supporting collagen, softening fine lines, and maintaining firm, lifted contours';
  }

  if (c.includes('redness') || c.includes('sensitive') || c.includes('irritation') || c.includes('flare')) {
    return 'calming visible redness and rebuilding a more resilient skin barrier';
  }

  return 'enhancing your overall glow, texture, and tone in a calm, sustainable way';
}

function buildTimelineScaffold(primaryConcern) {
  const focus = inferFocusFromConcern(primaryConcern);

  return {
    days_1_7: {
      theme: 'Reset & Reassure',
      goal: `Give your skin a chance to exhale and begin gently supporting ${focus}.`,
      notes: [
        'Focus on a very simple routine: gentle cleansing, hydration, and mineral sunscreen.',
        'Avoid harsh scrubs, over-exfoliating, or stacking too many new actives at once.',
        'Introduce one soothing, barrier-supporting step at night and watch how your skin responds.'
      ]
    },
    days_8_30: {
      theme: 'Correct & Refine',
      goal: `Begin targeted work on ${focus} while keeping your barrier calm and comfortable.`,
      notes: [
        'Layer in a single corrective active a few nights per week (retinoid or gentle acid, depending on tolerance).',
        'Alternate “active nights” with “recovery nights” rich in hydration and barrier support.',
        'If possible, pair your at-home routine with one or two in-clinic facials or treatments matched to your concern.'
      ]
    },
    days_31_90: {
      theme: 'Deepen & Maintain',
      goal: 'Strengthen collagen, refine texture and tone, and lock in sustainable habits.',
      notes: [
        'Gradually adjust the frequency of your chosen actives if your skin is calm and tolerating them well.',
        'Introduce a weekly ritual mask or at-home treatment to keep hydration and glow topped up.',
        'Consider more targeted in-clinic procedures (RF, PRP, microneedling, or roller massage) based on how your skin has responded.'
      ]
    }
  };
}

function pickPrimaryConcern(formPrimaryConcerns = []) {
  if (Array.isArray(formPrimaryConcerns) && formPrimaryConcerns.length) return formPrimaryConcerns[0];
  return null;
}

function buildPriorities({ primaryConcern, vision }) {
  const priorities = [];

  if (primaryConcern) {
    priorities.push({
      concern: primaryConcern,
      priority: 1,
      rationale: 'This is the primary concern you selected, so we anchor the plan around it.'
    });
  }

  const checklist = vision?.checklist15 || null;

  if (checklist) {
    const maybe = [
      { key: '8_barrierHealth', label: 'Barrier comfort & resilience' },
      { key: '2_textureSurfaceQuality', label: 'Texture refinement' },
      { key: '3_pigmentationColor', label: 'Tone evenness' },
      { key: '6_agingPhotoaging', label: 'Collagen & photoaging support' }
    ];

    for (const m of maybe) {
      const v = String(checklist[m.key] || '').trim();
      if (v) {
        priorities.push({
          concern: m.label,
          priority: priorities.length + 1,
          rationale: 'Based on the visual patterns noted in the selfie analysis.'
        });
      }
      if (priorities.length >= 4) break;
    }
  }

  return priorities;
}

function buildStrategy({ routineLevel, budgetLevel, primaryConcern }) {
  const rl = String(routineLevel || 'standard').toLowerCase();
  const bl = String(budgetLevel || 'mid-range').toLowerCase();

  let approach = 'calm, barrier-supportive, and consistent';
  if (rl.includes('minimal')) approach = 'simple, soothing, and low-friction';
  if (rl.includes('advanced')) approach = 'more targeted, but still barrier-first';

  let investmentLevel = 'mid';
  if (bl.includes('low') || bl.includes('budget')) investmentLevel = 'low';
  if (bl.includes('high') || bl.includes('premium') || bl.includes('lux')) investmentLevel = 'high';

  return {
    approach,
    investmentLevel,
    focus: inferFocusFromConcern(primaryConcern || '')
  };
}

function inferClothingColorFromSelfie(selfie) {
  const tags = Array.isArray(selfie?.tags) ? selfie.tags : [];
  // Look for patterns like "pink top", "black top"
  const topTag = tags.find((t) => typeof t === 'string' && t.toLowerCase().includes(' top'));
  if (topTag) return topTag.replace(/ top/i, '').trim();

  // If dominantColor is like "soft pink", keep it
  if (selfie?.dominantColor) return String(selfie.dominantColor);

  return null;
}

function buildSkinProfile({ form, vision }) {
  const declaredType = form?.skinType || null;

  const inferredTexture =
    vision?.texture ||
    vision?.inferredTexture ||
    vision?.globalTexture ||
    null;

  const overallGlow =
    vision?.overallGlow ||
    vision?.skinFindings ||
    null;

  const strengths = Array.isArray(vision?.strengths) ? vision.strengths : [];
  const visibleIssues = Array.isArray(vision?.issues) ? vision.issues : [];

  const checklist15 = vision?.checklist15 || null;

  return {
    declaredType,
    inferredTexture,
    overallGlow,
    strengths,
    visibleIssues,
    checklist15
  };
}

/**
 * Build a single, structured analysis context for the LLM.
 *
 * NEW signature:
 *   buildAnalysis({ form, selfie, vision })
 *
 * LEGACY signature (supported):
 *   buildAnalysis({ ageRange, primaryConcern, visitorQuestion, imageAnalysis })
 */
export function buildAnalysis(input = {}) {
  const isLegacy =
    Object.prototype.hasOwnProperty.call(input, 'ageRange') ||
    Object.prototype.hasOwnProperty.call(input, 'primaryConcern') ||
    Object.prototype.hasOwnProperty.call(input, 'imageAnalysis');

  // -----------------------------
  // LEGACY signature path
  // -----------------------------
  if (isLegacy) {
    const { ageRange, primaryConcern, visitorQuestion, imageAnalysis } = input;

    const ia = imageAnalysis || {};
    const analysis = ia.analysis || {};
    const raw = ia.raw || {};
    const numericFitz = ia.fitzpatrickType ?? null;
    const romanFitz = mapFitzNumericToRoman(numericFitz);
    const fitzInfo = buildFitzpatrickInfo(romanFitz);

    const selfieCompliment =
      analysis.complimentFeatures ||
      'You present with a naturally kind, open expression—my goal is simply to help your skin match the warmth you already carry.';

    const keyFindingsParts = [];
    if (analysis.skinFindings) keyFindingsParts.push(analysis.skinFindings);
    if (analysis.texture) keyFindingsParts.push(analysis.texture);
    if (analysis.poreBehavior) keyFindingsParts.push(analysis.poreBehavior);
    if (analysis.pigment) keyFindingsParts.push(analysis.pigment);
    if (analysis.fineLinesAreas) keyFindingsParts.push(analysis.fineLinesAreas);
    if (analysis.elasticity) keyFindingsParts.push(analysis.elasticity);

    const keyFindingsText =
      keyFindingsParts.length > 0
        ? keyFindingsParts.join(' ')
        : 'The skin shows common cosmetic signs of everyday life—subtle textural changes, gentle pigment variations, and a normal pattern of fine lines for your age range.';

    const activesHint =
      analysis.eveningActive ||
      'A gentle evening active, introduced slowly (such as a low-strength retinoid or mild acid), can be used a few nights per week as your barrier allows.';

    const inClinicHint =
      analysis.estheticRecommendations ||
      'HydraFacials, professional exfoliation, or collagen-supportive treatments can be layered in gradually to amplify your at-home routine.';

    const timeline = buildTimelineScaffold(primaryConcern || '');

    return {
      demographics: {
        ageRange: ageRange || null,
        primaryConcern: primaryConcern || null,
        visitorQuestion: visitorQuestion || null
      },
      selfie: {
        compliment: selfieCompliment,
        fitzpatrickEstimateNumeric: numericFitz,
        fitzpatrickEstimateRoman: romanFitz,
        tags: [],
        eyeColor: raw.eyeColor || null,
        hairColor: raw.hairColor || null,
        clothingColor: raw.clothingColor || null
      },
      fitzpatrick: {
        type: fitzInfo.type,
        description: fitzInfo.description,
        riskNotes: fitzInfo.riskNotes,
        estimateRoman: fitzInfo.type,
        estimateNumeric: romanToNumeric(fitzInfo.type)
      },
      skinSummary: {
        keyFindingsText,
        activesHint,
        inClinicHint
      },
      timeline
    };
  }

  // -----------------------------
  // NEW signature path
  // -----------------------------
  const { form = {}, selfie = {}, vision = {} } = input;

  const ageRange = form?.ageRange || null;
  const primaryConcern = pickPrimaryConcern(form?.primaryConcerns) || null;
  const visitorQuestion = form?.currentRoutine || null;

  const fitzRoman =
    normalizeRomanFitz(form?.fitzpatrickType) ||
    normalizeRomanFitz(vision?.fitzpatrickType) ||
    null;

  const fitzInfo = buildFitzpatrickInfo(fitzRoman);

  const selfieCompliment =
    selfie?.compliment ||
    vision?.complimentFeatures ||
    'You present with a naturally kind, open expression—my goal is simply to help your skin match the warmth you already carry.';

  const timeline = buildTimelineScaffold(primaryConcern || '');
  const skinProfile = buildSkinProfile({ form, vision });
  const priorities = buildPriorities({ primaryConcern, vision: skinProfile });

  const lifestyle = {
    routineLevel: form?.routineLevel || 'standard',
    budgetLevel: form?.budgetLevel || 'mid-range',
    currentRoutine: visitorQuestion || null,
    lifestyleNotes: form?.lifestyle || null
  };

  const strategy = buildStrategy({
    routineLevel: lifestyle.routineLevel,
    budgetLevel: lifestyle.budgetLevel,
    primaryConcern
  });

  const summaryParts = [];
  if (vision?.skinFindings) summaryParts.push(vision.skinFindings);
  if (vision?.texture) summaryParts.push(vision.texture);
  if (vision?.poreBehavior) summaryParts.push(vision.poreBehavior);
  if (vision?.pigment) summaryParts.push(vision.pigment);
  if (vision?.fineLinesAreas) summaryParts.push(vision.fineLinesAreas);
  if (vision?.elasticity) summaryParts.push(vision.elasticity);

  const keyFindingsText =
    summaryParts.length
      ? summaryParts.join(' ')
      : 'The skin shows common cosmetic signs of everyday life—subtle texture shifts, gentle tone variation, and a normal pattern of fine lines for your age range.';

  const clothingColor = inferClothingColorFromSelfie(selfie);

  return {
    demographics: {
      ageRange,
      primaryConcern,
      visitorQuestion
    },

    selfie: {
      url: selfie?.url || null,
      tags: Array.isArray(selfie?.tags) ? selfie.tags : [],
      dominantColor: selfie?.dominantColor || null,
      eyeColor: selfie?.eyeColor || null,
      hairColor: selfie?.hairColor || null,
      clothingColor,
      compliment: selfieCompliment
    },

    fitzpatrick: {
      type: fitzInfo.type,
      description: fitzInfo.description,
      riskNotes: fitzInfo.riskNotes,
      estimateRoman: fitzInfo.type,
      estimateNumeric: romanToNumeric(fitzInfo.type),
      note: 'Cosmetic estimate only; not a medical diagnosis.'
    },

    skinProfile,

    skinSummary: {
      keyFindingsText
    },

    priorities,

    lifestyle,

    strategy,

    timeline
  };
}



