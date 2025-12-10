// components/FitzpatrickDetector.js
// Fitzpatrick skin type display with color bar + friendly description.

import React from "react";

const TYPES = {
  1: {
    label: "Type I",
    description:
      "Very fair skin, always burns, never tans. Needs very high, consistent sun protection and gentle actives.",
  },
  2: {
    label: "Type II",
    description:
      "Fair skin, usually burns, tans minimally. Daily broad-spectrum SPF is essential, plus cautious use of peels and lasers.",
  },
  3: {
    label: "Type III",
    description:
      "Medium/light skin, sometimes burns, gradually tans. Can usually tolerate more active treatments with proper protection.",
  },
  4: {
    label: "Type IV",
    description:
      "Olive/light brown skin, rarely burns, tans easily. Great candidate for many esthetic procedures with careful pigment management.",
  },
  5: {
    label: "Type V",
    description:
      "Brown skin, very rarely burns, tans very easily. Needs special attention to pigmentary risks with lasers, peels, and heat-based treatments.",
  },
  6: {
    label: "Type VI",
    description:
      "Deeply pigmented dark brown to black skin, almost never burns. High priority on pigment-safe parameters for all energy devices.",
  },
};

// Simple gradient from very fair → very deep
const BAR_COLORS = [
  "#ffe5e0", // I
  "#ffd2b3", // II
  "#ffecb3", // III
  "#e0ffb3", // IV
  "#b3ffd9", // V
  "#80c7ff", // VI
];

export function FitzpatrickDetector({ type, detectedBy = "auto" }) {
  if (!type) return null;

  const numeric = Number(type);
  const info = TYPES[numeric];

  if (!info) {
    return (
      <div
        style={{
          marginTop: "16px",
          padding: "12px 14px",
          borderRadius: "10px",
          background: "#f5f0f0",
          border: "1px solid #e2d6d6",
          fontSize: "0.9rem",
        }}
      >
        <strong>Fitzpatrick Skin Type:</strong>{" "}
        <span style={{ color: "#555" }}>Unknown</span>
      </div>
    );
  }

  const detectedLabel =
    detectedBy === "auto"
      ? "Detected automatically based on your photo."
      : detectedBy === "manual"
      ? "Selected based on your answers."
      : null;

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "14px 16px",
        borderRadius: "12px",
        background: "#faf5f5",
        border: "1px solid #e4d5d5",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "10px",
        }}
      >
        <strong>Fitzpatrick Skin Type</strong>
        <span
          style={{
            fontWeight: 600,
            fontSize: "0.95rem",
            color: "#444",
          }}
        >
          {info.label} (Type {numeric})
        </span>
      </div>

      {/* Color bar */}
      <div style={{ marginBottom: "10px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            borderRadius: "999px",
            overflow: "hidden",
            border: "1px solid #e0d0d0",
          }}
        >
          {BAR_COLORS.map((color, index) => {
            const segmentType = index + 1;
            const isActive = segmentType === numeric;
            return (
              <div
                key={segmentType}
                style={{
                  height: "10px",
                  background: color,
                  opacity: isActive ? 1 : 0.5,
                  boxShadow: isActive
                    ? "0 0 0 2px rgba(0,0,0,0.12) inset"
                    : "none",
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            marginTop: "4px",
            color: "#777",
          }}
        >
          <span>Type I</span>
          <span>Type VI</span>
        </div>
      </div>

      <p style={{ margin: "0 0 4px", fontSize: "0.9rem", color: "#555" }}>
        {info.description}
      </p>

      {detectedLabel && (
        <p
          style={{
            margin: 0,
            fontSize: "0.8rem",
            color: "#888",
          }}
        >
          {detectedLabel}
        </p>
      )}
    </div>
  );
}



