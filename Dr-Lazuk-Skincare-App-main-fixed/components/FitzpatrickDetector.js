// components/FitzpatrickDetector.js
// Fitzpatrick skin type display with subtle scale + cosmetic disclaimer.
// Accepts numeric (1–6) OR Roman ("I"–"VI").
//
// Updates:
// ✅ Cleaner, more premium UI + smaller footprint
// ✅ Explicit “cosmetic estimate” disclaimer (non-diagnostic)
// ✅ Works with "1", 1, "I", "iv", etc.
// ✅ Doesn’t show anything if type is null/invalid
// ✅ Optional "detectedBy" label (auto/manual/custom)

import React from "react";

const TYPES = {
  1: {
    label: "Type I",
    description:
      "Very fair skin that burns easily and rarely tans. Prioritize daily broad-spectrum SPF and gentle actives.",
  },
  2: {
    label: "Type II",
    description:
      "Fair skin that usually burns and tans lightly. Daily SPF and careful pacing with stronger actives are key.",
  },
  3: {
    label: "Type III",
    description:
      "Medium/light skin that may burn and gradually tans. Often tolerates actives well with consistent sun protection.",
  },
  4: {
    label: "Type IV",
    description:
      "Olive/light brown skin that rarely burns and tans easily. Keep pigment-supporting care in mind with procedures.",
  },
  5: {
    label: "Type V",
    description:
      "Brown skin that very rarely burns and tans very easily. Use pigment-safe settings and calm-barrier strategies.",
  },
  6: {
    label: "Type VI",
    description:
      "Deeply pigmented skin that almost never burns. Prioritize pigment-safe parameters for heat-based treatments.",
  },
};

const ROMAN_TO_NUM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

// Neutral “tone scale” (not literal skin color)
const BAR_COLORS = [
  "#F3F4F6", // I
  "#E5E7EB", // II
  "#D1D5DB", // III
  "#9CA3AF", // IV
  "#6B7280", // V
  "#374151", // VI
];

function normalizeFitzType(type) {
  if (type === null || type === undefined) return null;

  // number
  if (typeof type === "number" && Number.isFinite(type) && type >= 1 && type <= 6) return type;

  // numeric string (strict-ish)
  if (typeof type === "string") {
    const t = type.trim();
    if (/^[1-6]$/.test(t)) return Number(t);
    const roman = t.toUpperCase();
    if (ROMAN_TO_NUM[roman]) return ROMAN_TO_NUM[roman];
    return null;
  }

  // fallback coercion
  const asNum = Number(type);
  if (Number.isFinite(asNum) && asNum >= 1 && asNum <= 6) return asNum;

  return null;
}

export function FitzpatrickDetector({
  type,
  detectedBy = "auto", // "auto" | "manual" | "custom"
  showDisclaimer = true,
}) {
  const numeric = normalizeFitzType(type);
  if (!numeric) return null;

  const info = TYPES[numeric];
  if (!info) return null;

  const detectedLabel =
    detectedBy === "auto"
      ? "Estimated from your photo."
      : detectedBy === "manual"
      ? "Selected from your inputs."
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: "14px",
        padding: "14px 16px",
        borderRadius: "14px",
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "baseline",
          marginBottom: "8px",
        }}
      >
        <div style={{ fontWeight: 900, color: "#111827" }}>Fitzpatrick Skin Type</div>
        <div style={{ fontWeight: 800, color: "#111827" }}>{info.label}</div>
      </div>

      {/* Scale */}
      <div style={{ marginBottom: "10px" }}>
        <div
          aria-label="Fitzpatrick scale I through VI"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            borderRadius: "999px",
            overflow: "hidden",
            border: "1px solid #E5E7EB",
          }}
        >
          {BAR_COLORS.map((color, index) => {
            const segmentType = index + 1;
            const isActive = segmentType === numeric;
            return (
              <div
                key={segmentType}
                aria-label={`Type ${segmentType}${isActive ? " (selected)" : ""}`}
                title={`Type ${segmentType}`}
                style={{
                  height: "10px",
                  background: color,
                  opacity: isActive ? 1 : 0.35,
                  boxShadow: isActive ? "0 0 0 2px rgba(0,0,0,0.18) inset" : "none",
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            marginTop: "5px",
            color: "#6B7280",
          }}
        >
          <span>Type I</span>
          <span>Type VI</span>
        </div>
      </div>

      <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#374151", lineHeight: 1.5 }}>
        {info.description}
      </p>

      {detectedLabel ? (
        <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#6B7280" }}>
          {detectedLabel}
        </p>
      ) : null}

      {showDisclaimer ? (
        <p style={{ margin: 0, fontSize: "11px", color: "#9CA3AF" }}>
          Cosmetic estimate only — not a medical diagnosis.
        </p>
      ) : null}
    </div>
  );
}


