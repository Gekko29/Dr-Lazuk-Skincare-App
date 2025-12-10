// components/FitzpatrickDetector.js
// Visual Fitzpatrick skin type indicator with color bars + description.

import React from "react";

const DESCRIPTIONS = {
  1: "Type I — Very fair skin, always burns, never tans. Needs maximum daily UV protection.",
  2: "Type II — Fair skin, usually burns, tans minimally. Requires strict daily SPF and shade.",
  3: "Type III — Medium/light skin, sometimes burns, gradually tans. Still needs consistent SPF.",
  4: "Type IV — Olive/light brown skin, rarely burns, tans easily. SPF protects against aging and pigment.",
  5: "Type V — Brown skin, very rarely burns, tans very easily. Focus on pigment and texture protection.",
  6: "Type VI — Deeply pigmented dark brown to black skin, almost never burns. SPF is key for tone and long-term health.",
};

const TYPE_LABELS = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
};

const TYPE_COLORS = {
  1: "#ffe5dc", // very fair
  2: "#ffd3b0",
  3: "#f5c27a",
  4: "#e0a45e",
  5: "#b37245",
  6: "#743921", // deepest
};

export function FitzpatrickDetector({ type }) {
  if (!type) return null;

  const numeric = Number(type);
  if (!numeric || numeric < 1 || numeric > 6) return null;

  const description = DESCRIPTIONS[numeric] || "Unknown Fitzpatrick type.";
  const label = TYPE_LABELS[numeric] || String(numeric);

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "14px 16px",
        borderRadius: "14px",
        background: "#fdf7f6",
        border: "1px solid #f0d7d0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "8px",
          gap: "8px",
        }}
      >
        <div>
          <strong style={{ fontSize: "0.95rem" }}>
            Fitzpatrick Skin Type: {numeric} ({label})
          </strong>
        </div>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: "999px",
            fontSize: "0.75rem",
            background: "#fbe0da",
            color: "#6a2c27",
            whiteSpace: "nowrap",
          }}
        >
          Auto-detected estimate
        </span>
      </div>

      {/* Color bar */}
      <div
        style={{
          display: "flex",
          borderRadius: "999px",
          overflow: "hidden",
          border: "1px solid #f0d7d0",
          marginBottom: "6px",
        }}
      >
        {Array.from({ length: 6 }).map((_, index) => {
          const value = index + 1;
          const isActive = value === numeric;
          return (
            <div
              key={value}
              style={{
                flex: 1,
                height: "14px",
                backgroundColor: TYPE_COLORS[value],
                opacity: isActive ? 1 : 0.4,
                position: "relative",
                transition: "opacity 0.2s ease",
              }}
            />
          );
        })}
      </div>

      {/* Below-bar labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.7rem",
          color: "#7a5a4f",
          marginBottom: "6px",
        }}
      >
        <span>Very fair</span>
        <span>Fair</span>
        <span>Medium</span>
        <span>Olive</span>
        <span>Brown</span>
        <span>Deep</span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "0.85rem",
          color: "#5a4a45",
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>

      <p
        style={{
          margin: "6px 0 0",
          fontSize: "0.75rem",
          color: "#9a7b70",
        }}
      >
        This helps me choose safer settings for lasers, peels, and light-based
        treatments, and tailor your long-term skin strategy.
      </p>
    </div>
  );
}

