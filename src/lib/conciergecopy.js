// src/lib/conciergeCopy.js
// Locked copy for Lazuk Esthetics AI Concierge (The Esthetics Suite)
// Do not edit text directly in components—import from here.

export const CONCIERGE_COPY = {
  brand: {
    suiteName: "The Esthetics Suite",
    conciergeName: "Lazuk Esthetics AI Concierge",
  },

  // Used on the esthetics landing/intake screen (before gating)
  landing: {
    title: "The Esthetics Suite",
    subtitle: "AI Concierge — Esthetic Protocols",
    bridge: [
      "Your skin analysis mapped the surface. This experience explores what lies beneath.",
      "The Esthetics Suite is an interactive conversation with the Lazuk Esthetics AI Concierge, designed to understand your goals, preferences, and constraints so we can curate a personalized esthetic protocol for review with your provider.",
      "This is not a booking and not a diagnosis. It’s a curated conversation designed to prepare a thoughtful consultation with our providers.",
    ].join("\n\n"),
    cta: "Enter The Esthetics Suite",
  },

  // First concierge messages after gating succeeds (typed flow start)
  opening: {
    // Use template variables: {{firstName}}
    systemIntro: [
      "Hi {{firstName}} — welcome to The Esthetics Suite.",
      "",
      "I’m the Lazuk Esthetics AI Concierge.",
      "Based on the information you’ve shared, I’ll guide you through a brief, personalized conversation to understand your goals, preferences, and constraints.",
      "",
      "This isn’t a diagnosis or a booking.",
      "It’s a curated conversation designed to prepare a thoughtful consultation with our providers.",
      "",
      "Let’s begin.",
    ].join("\n"),
    firstLiveQuestion:
      "What would you most like to change, improve, or protect about your appearance or overall skin health right now?",
  },

  // Optional mid-flow reassurance (use once after 2–3 exchanges)
  midFlow: {
    reassurance: [
      "Thank you — this is very helpful.",
      "",
      "I want to be clear: what we’re building here is a recommended path, not a locked plan.",
      "Everything will be reviewed and refined with your provider during consultation.",
    ].join("\n"),
  },

  // Final recap + consultation handoff (end of flow)
  closing: {
    // Use template variables: {{firstName}}
    recapIntro: [
      "{{firstName}}, based on what you’ve shared, I’ve curated a personalized esthetic journey designed to support your goals while respecting your preferences and timing.",
      "",
      "This protocol reflects:",
      "• What you want to improve or protect",
      "• How aggressive or conservative you prefer to be",
      "• Any constraints you’ve shared",
      "• And how we can support both immediate results and long-term skin health",
    ].join("\n"),

    consultHandoff: [
      "The next step is a consultation with a Lazuk Esthetics provider.",
      "",
      "During that visit:",
      "• Your protocol will be reviewed together",
      "• Any medical considerations will be confirmed",
      "• Timing, sequencing, and options will be finalized",
      "• And any questions you’ve raised will be addressed directly",
      "",
      "A summary of today’s conversation and your curated protocol will be sent to you, and shared with our team.",
    ].join("\n"),

    nextStepQuestion: [
      "How would you prefer to move forward?",
      "• Have a specialist contact you to schedule",
      "• Reach out by email at your convenience",
      "• Or review everything first and decide later",
    ].join("\n"),

    finalThanks:
      "{{firstName}}, thank you for taking the time to share this. We look forward to continuing the conversation with you.",
  },

  // Generic disclaimers (if you want to reuse in UI footer)
  disclaimers: {
    short:
      "This concierge provides informational protocol suggestions and is not medical advice. Final treatment paths are confirmed in consultation. A medical questionnaire will be required before the appointment.",
  },

  // Common gating / error messages (optional)
  gates: {
    outsideServiceArea:
      "This experience is currently limited to the Atlanta metro area.",
    rateLimited:
      "You’ve reached the limit of 2 runs within 24 hours for this email/IP.",
    geoUnavailable:
      "We couldn’t confirm your location right now. Please try again later.",
    invalidInput: "Please check your information and try again.",
    generic: "Please try again.",
  },
};

// Simple template helper (optional) to keep components clean.
// Example: t(CONCIERGE_COPY.opening.systemIntro, { firstName })
export function t(template, vars = {}) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] == null ? "" : String(vars[k])
  );
}
