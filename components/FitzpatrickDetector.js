// components/FitzpatrickDetector.js
// Simple Fitzpatrick skin type display component.

import React from "react";

const DESCRIPTIONS = {
  1: "Type I — Very fair skin, always burns, never tans. Requires extra caution with sun exposure.",
  2: "Type II — Fair skin, usually burns, tans minimally. Needs consistent daily SPF.",
  3: "Type III — Medium/light skin, sometimes burns, gradually tans.",
  4: "Type IV — Olive/light brown skin, rarely burns, tans easily.",
  5: "Type V — Brown skin, very rarely burns, tans very easily.",
  6: "Type VI — Deeply pigmented dark brown to black skin, almost never burns, always tans.",
};

export function FitzpatrickDetector({ type }) {
  if (!type) return null;

  const numeric = Number(type);
  const description = DESCRIPTIONS[numeric] || "Unknown Fitzpatrick type.";

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "12px 14px",
        borderRadius: "10px",
        background: "#f5f0f0",
        border: "1px solid #e2d6d6",
      }}
    >
      <strong>Fitzpatrick Skin Type: {numeric}</strong>
      <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "#555" }}>
        {description}
      </p>
    </div>
  );
}
