// lib/analysis.js
// Shared analysis helper for the skincare report.
//
// This file takes:
// - basic form data (ageRange, primaryConcern, visitorQuestion)
// - optional imageAnalysis (from /api/analyzeImage)
// and produces a structured context object that the LLM can use
// for tone, personalization, and the 0–90 day Glow Timeline.

function mapFitzNumericToRoman(num) {
  const map = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
    6: 'VI'
  };
  if (num === null || num === undefined) return null;
  return map[num] || null;
}

function inferFocusFromConcern(primaryConcern = '') {
  const c = primaryConcern.toLowerCase();

  if (
    c.includes('acne') ||
    c.includes('breakout') ||
    c.includes('blemish') ||
    c.includes('congestion')
  ) {
    return 'calming and clearing breakout-prone areas while protecting your barrier';
  }

  if (
    c.includes('pigment') ||
    c.includes('dark spot') ||
    c.includes('spots') ||
    c.includes('sun') ||
    c.includes('discoloration')
  ) {
    return 'softening uneven pigmentation, sun marks, and lingering dark spots';
  }

  if (
    c.includes('wrinkle') ||
    c.includes('fine line') ||
    c.includes('aging') ||
    c.includes('ageing') ||
    c.includes('firmness') ||
    c.includes('sag')
  ) {
    return 'supporting collagen, softening fine lines, and maintaining firm, lifted contours';
  }

  if (
    c.includes('redness') ||
    c.includes('sensitive') ||
    c.includes('irritation') ||
    c.includes('flare')
  ) {
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

/**
 * Build a single, structured analysis context for the LLM.
 *
 * @param {Object} params
 * @param {string} params.ageRange
 * @param {string} params.primaryConcern
 * @param {string} [params.visitorQuestion]
 * @param {Object} [params.imageAnalysis] - The JSON returned by /api/analyzeImage
 */
export function buildAnalysis({ ageRange, primaryConcern, visitorQuestion, imageAnalysis }) {
  const ia = imageAnalysis || {};
  const analysis = ia.analysis || {};
  const raw = ia.raw || {};
  const numericFitz = ia.fitzpatrickType ?? null;
  const romanFitz = mapFitzNumericToRoman(numericFitz);

  const selfieCompliment =
    analysis.complimentFeatures ||
    'You present with a naturally kind, open expression—my goal is simply to help your skin match the warmth you already carry.';

  // Build a compact but rich summary of what the image analysis saw.
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
      // Optional helper for the model — still cosmetic-only and estimated:
      fitzpatrickEstimateNumeric: numericFitz,
      fitzpatrickEstimateRoman: romanFitz
    },
    skinSummary: {
      keyFindingsText,
      activesHint,
      inClinicHint
    },
    timeline
  };
}

