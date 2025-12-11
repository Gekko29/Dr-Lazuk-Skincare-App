// analysis.js
// Best-effort standalone analysis builder for the Skincare Analysis App.
//
// This file is designed to sit “under” api/generate-report.js.
// generate-report.js should call buildAnalysis(...) with the raw form + selfie
// data, then send the returned object to the LLM in a single, structured prompt.
//
// If your project uses ES modules, swap the `module.exports` at the bottom for:
//   export { buildAnalysis };

/**
 * @typedef {Object} SelfieMeta
 * @property {string} [url]                 - Public URL of the uploaded selfie
 * @property {string[]} [tags]              - e.g. ["glasses","smiling","floral top","blue eyes"]
 * @property {string} [dominantColor]       - e.g. "soft pink", "emerald green"
 * @property {string} [eyeColor]            - e.g. "light blue", "brown"
 * @property {string} [hairColor]           - e.g. "dark brown"
 */

/**
 * @typedef {Object} VisionAnalysis
 * @property {string[]} [issues]            - e.g. ["fine lines", "hyperpigmentation"]
 * @property {string[]} [strengths]         - e.g. ["even tone", "defined cheekbones"]
 * @property {string} [texture]             - e.g. "smooth", "rough", "enlarged pores"
 * @property {string} [overallGlow]         - e.g. "dull", "radiant", "balanced"
 */

/**
 * @typedef {Object} FormData
 * @property {string} [firstName]
 * @property {number} [age]
 * @property {string} [gender]              - free text
 * @property {string} [location]            - city/region if captured
 * @property {string} [skinType]           - "oily" | "dry" | "combination" | "normal" | "sensitive" | undefined
 * @property {string} [fitzpatrickType]    - "I"|"II"|"III"|"IV"|"V"|"VI"|undefined
 * @property {string[]} [primaryConcerns]  - e.g. ["acne", "wrinkles", "dark spots"]
 * @property {string[]} [secondaryConcerns]
 * @property {string} [routineLevel]       - "minimalist" | "standard" | "advanced"
 * @property {string} [budgetLevel]        - "budget-friendly" | "mid-range" | "luxury"
 * @property {string} [currentRoutine]     - free text summary
 * @property {string} [lifestyle]          - free text (sleep, stress, diet notes)
 */

/**
 * @typedef {Object} AnalysisInput
 * @property {FormData} form
 * @property {SelfieMeta} [selfie]
 * @property {VisionAnalysis} [vision]
 */

/**
 * Generate a warm, specific compliment based on selfie meta.
 * This is meant to be dropped as a sentence into Section 1 of the report
 * (Dr. Lazuk’s “personal letter” intro).
 *
 * @param {SelfieMeta} selfie
 * @returns {string | null}
 */
function buildPersonalCompliment(selfie = {}) {
  if (!selfie) return null;

  const lines = [];

  const tags = (selfie.tags || []).map(t => t.toLowerCase());

  const hasGlasses = tags.some(t => t.includes('glasses'));
  const hasSmile = tags.some(t => t.includes('smile') || t.includes('smiling'));
  const floralTop = tags.find(t => t.includes('floral'));
  const colorTag = selfie.dominantColor || tags.find(t => t.includes('pink') || t.includes('blue') || t.includes('green') || t.includes('white'));

  if (hasSmile) {
    lines.push(
      "The first thing I noticed in your photo is your beautiful, genuine smile—it already does half the work of any skincare routine."
    );
  }

  if (selfie.eyeColor) {
    lines.push(
      `Your ${selfie.eyeColor.toLowerCase()} eyes have a brightness that I want your skin to echo—calm, clear, and full of light.`
    );
  }

  if (hasGlasses) {
    lines.push(
      "I also love how your glasses frame your features—they give you a very polished, intelligent look that pairs perfectly with a refined skincare plan."
    );
  }

  if (floralTop || colorTag) {
    const desc = floralTop ? "floral top" : colorTag;
    lines.push(
      `The ${desc} you’re wearing adds such a soft, elegant vibe—my goal is to bring that same softness and radiance into your skin.`
    );
  }

  if (!lines.length) {
    // Gentle, generic fallback
    return "You have a naturally kind, open expression in your photo—my goal is to help your skin reflect that same warmth and confidence every day.";
  }

  // Join 1–3 sentences max to avoid overdoing it
  return lines.slice(0, 3).join(' ');
}

/**
 * Score and sort concerns into high / medium priority.
 *
 * @param {string[]} primary
 * @param {string[]} secondary
 */
function buildConcernPriorities(primary = [], secondary = []) {
  const scored = [];

  const pushIf = (label, baseScore) => {
    if (!label) return;
    scored.push({ label, score: baseScore });
  };

  primary.forEach(c => pushIf(c, 3));
  secondary.forEach(c => pushIf(c, 2));

  // Group some classic "foundational" issues slightly higher
  scored.forEach(item => {
    const l = item.label.toLowerCase();
    if (l.includes('barrier') || l.includes('sensitivity') || l.includes('redness')) {
      item.score += 0.5;
    }
    if (l.includes('melasma') || l.includes('pigment') || l.includes('dark spot')) {
      item.score += 0.25;
    }
    if (l.includes('acne') || l.includes('breakout') || l.includes('congestion')) {
      item.score += 0.75;
    }
  });

  // Deduplicate by label
  const map = new Map();
  for (const item of scored) {
    if (!map.has(item.label) || map.get(item.label).score < item.score) {
      map.set(item.label, item);
    }
  }

  const unique = Array.from(map.values()).sort((a, b) => b.score - a.score);

  return unique.map((item, idx) => {
    const priority = idx === 0 ? 'immediate' : item.score >= 3 ? 'high' : 'supportive';
    return {
      label: item.label,
      priority,
      rationale: buildConcernRationale(item.label, priority)
    };
  });
}

/**
 * Short rationale snippets to help the LLM speak in a more grounded, clinical way.
 */
function buildConcernRationale(label, priority) {
  const lower = label.toLowerCase();

  if (lower.includes('acne') || lower.includes('breakout') || lower.includes('congestion')) {
    return priority === 'immediate'
      ? 'Active breakouts create inflammation, pigment changes, and scarring over time, so they sit at the top of the priority list.'
      : 'Controlling congestion quietly protects your collagen, your pigment balance, and your confidence.';
  }

  if (lower.includes('wrinkle') || lower.includes('fine line') || lower.includes('aging')) {
    return 'Fine lines and wrinkles are closely tied to collagen loss and UV exposure, so they benefit from a calm, consistent long-term plan.';
  }

  if (lower.includes('dark spot') || lower.includes('pigment') || lower.includes('melasma')) {
    return 'Pigment and dark spots require a gentle, steady approach—aggressive or rushed treatments often make them worse.';
  }

  if (lower.includes('redness') || lower.includes('rosacea') || lower.includes('sensitivity') || lower.includes('barrier')) {
    return 'Your skin barrier is your foundation. When it is calm and stable, every corrective treatment works better and with less irritation.';
  }

  return 'This concern is important, but we’ll fold it into a calm, stepwise plan so your skin never feels overwhelmed.';
}

/**
 * Build a simple 1–90 day scaffold that the LLM can expand into Dr. Lazuk’s
 * warm, “personal letter” style.
 *
 * @param {Object} opts
 * @param {string[]} [opts.topConcerns]
 * @param {string} [opts.skinType]
 */
function buildTimelineScaffold({ topConcerns = [], skinType } = {}) {
  const main = topConcerns[0] || null;

  const focusWord = main
    ? main.toLowerCase()
    : 'overall skin health';

  const typeNote = (() => {
    if (!skinType) return null;
    const s = skinType.toLowerCase();
    if (s === 'oily') return 'We keep textures feather-light and non-comedogenic so pores stay clear.';
    if (s === 'dry') return 'We lean into replenishing, cushiony textures that restore your barrier.';
    if (s === 'combination') return 'We balance your oilier T-zone with extra comfort for the drier areas.';
    if (s === 'sensitive') return 'We move gently, with barrier-safe actives and careful patch testing.';
    return null;
  })();

  return {
    days_1_7: {
      theme: 'Reset and calm',
      goal: `Stabilize your barrier so we can safely address ${focusWord}.`,
      notes: [
        'Strip the routine back to gentle cleansing, hydration, and mineral sunscreen.',
        'Pause harsh scrubs, new actives, and anything that stings or burns.',
        'Introduce one soothing treatment at night (for example, a peptide + Centella emulsion).',
        typeNote
      ].filter(Boolean)
    },
    days_8_30: {
      theme: 'Correct and refine',
      goal: `Begin targeted work on ${focusWord} while keeping your barrier calm.`,
      notes: [
        'Layer in one corrective active (for example, a gentle retinoid or pigment serum) 2–3 nights per week.',
        'Use “buffering” with a hydrating emulsion to reduce irritation risk.',
        'Schedule or continue professional treatments in-clinic that match your concerns (HydraFacial, nano-needling, PRP, or oxygen facials).'
      ]
    },
    days_31_90: {
      theme: 'Deep repair and long-term glow',
      goal: 'Build collagen, even out tone, and lock in habits that keep your results stable.',
      notes: [
        'Gradually increase the frequency of tolerated actives while watching for dryness or redness.',
        'Add or maintain a weekly “ritual” mask night to re-hydrate and reset.',
        'Consider advanced in-clinic treatments (RF, PRP, roller massage for lymphatic drainage) based on how your skin responds.'
      ]
    }
  };
}

/**
 * Provide some structured Fitzpatrick info for the report + image section.
 *
 * @param {string | undefined} type
 */
function buildFitzpatrickSummary(type) {
  if (!type) return null;

  const t = String(type).toUpperCase();

  const base = {
    type: t,
    // You can map this to a static image path in your frontend:
    // e.g. `/images/fitzpatrick/fitz-${t}.png`
    imageSlug: `fitz-${t}`
  };

  switch (t) {
    case 'I':
      return {
        ...base,
        description: 'Very fair skin, often with light eyes and hair, burns easily and rarely tans.',
        riskNotes: 'Highest UV sensitivity; daily high-protection mineral sunscreen is non-negotiable.'
      };
    case 'II':
      return {
        ...base,
        description: 'Fair skin that burns easily and tans minimally.',
        riskNotes: 'Still highly prone to sun damage, pigment, and early fine lines.'
      };
    case 'III':
      return {
        ...base,
        description: 'Light to medium skin that sometimes burns and gradually tans.',
        riskNotes: 'Balanced UV response but still vulnerable to premature aging and pigment changes over time.'
      };
    case 'IV':
      return {
        ...base,
        description: 'Olive or light brown skin that rarely burns and tans more easily.',
        riskNotes: 'Lower burn risk but higher risk of post-inflammatory hyperpigmentation after irritation or inflammation.'
      };
    case 'V':
      return {
        ...base,
        description: 'Brown skin that very rarely burns and tans readily.',
        riskNotes: 'Focus on preventing pigment changes and respecting the barrier when introducing stronger actives.'
      };
    case 'VI':
      return {
        ...base,
        description: 'Deeply pigmented brown to darkest brown skin that almost never burns.',
        riskNotes: 'Highest melanin protection but also higher tendency for pigment shifts after inflammation or trauma.'
      };
    default:
      return { ...base, description: '', riskNotes: '' };
  }
}

/**
 * Main function that generate-report.js should call.
 *
 * @param {AnalysisInput} input
 */
function buildAnalysis(input) {
  const form = input.form || {};
  const selfie = input.selfie || {};
  const vision = input.vision || {};

  const compliment = buildPersonalCompliment(selfie);
  const concernPriorities = buildConcernPriorities(
    form.primaryConcerns || [],
    form.secondaryConcerns || []
  );
  const timeline = buildTimelineScaffold({
    topConcerns: concernPriorities.map(c => c.label),
    skinType: form.skinType
  });
  const fitz = buildFitzpatrickSummary(form.fitzpatrickType);

  const strengths = vision.strengths || [];
  const issues = vision.issues || [];

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      version: '1.0.0-analysis-layer'
    },

    user: {
      firstName: form.firstName || null,
      age: form.age || null,
      gender: form.gender || null,
      location: form.location || null
    },

    selfie: {
      url: selfie.url || null,
      compliment,
      tags: selfie.tags || [],
      dominantColor: selfie.dominantColor || null,
      eyeColor: selfie.eyeColor || null,
      hairColor: selfie.hairColor || null
    },

    fitzpatrick: fitz,

    skinProfile: {
      declaredType: form.skinType || null,
      inferredTexture: vision.texture || null,
      overallGlow: vision.overallGlow || null,
      strengths,
      visibleIssues: issues
    },

    priorities: concernPriorities,

    lifestyle: {
      routineLevel: form.routineLevel || null,
      budgetLevel: form.budgetLevel || null,
      currentRoutine: form.currentRoutine || null,
      lifestyleNotes: form.lifestyle || null
    },

    // 1–90 day plan scaffold for the LLM to turn into warm prose
    timeline,

    // Helper flag so the LLM knows how ambitious to be
    strategy: {
      approach:
        form.routineLevel === 'minimalist'
          ? 'keep it simple, low-step, high-impact'
          : form.routineLevel === 'advanced'
          ? 'layered, stepwise, but still barrier-friendly'
          : 'balanced, 4–6 thoughtful steps',
      investment:
        form.budgetLevel === 'budget-friendly'
          ? 'prioritize multi-tasking products and at-home consistency'
          : form.budgetLevel === 'luxury'
          ? 'comfortably integrate in-clinic procedures and higher-end actives'
          : 'mix smart at-home care with occasional professional treatments'
    }
  };
}

module.exports = {
  buildAnalysis
};
