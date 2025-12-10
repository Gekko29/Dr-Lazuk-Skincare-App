// components/FitzpatrickDetector.js
// Fitzpatrick skin type display with color scale and description.

import React from "react";

const TYPE_INFO = {
  1: {
    label: "Type I",
    desc: "Very fair skin, always burns, never tans. Needs extreme sun protection.",
    color: "#ffe5d9",
  },
  2: {
    label: "Type II",
    desc: "Fair skin, usually burns, tans minimally. Requires consistent SPF and hats.",
    color: "#ffd7ba",
  },
  3: {
    label: "Type III",
    desc: "Medium/light skin, sometimes burns, gradually tans. Still prone to sun damage.",
    color: "#fec89a",
  },
  4: {
    label: "Type IV",
    desc: "Olive/light brown skin, rarely burns, tans easily. Risk of hyperpigmentation with sun or inflammation.",
    color: "#e0a96d",
  },
  5: {
    label: "Type V",
    desc: "Brown skin, very rarely burns, tans very easily. Higher risk of dark spots and PIH after irritation.",
    color: "#b5835a",
  },
  6: {
    label: "Type VI",
    desc: "Deeply pigmented dark brown to black skin, almost never burns. Needs careful protection against dark spots, uneven tone, and scarring.",
    color: "#6b4f3f",
  },
};

const SCALE_ORDER = [1, 2, 3, 4, 5, 6];

export function FitzpatrickDetector({ type }) {
  if (!type) return null;

  const numeric = Number(type);
  const info = TYPE_INFO[numeric] || TYPE_INFO[3];

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "14px 16px",
        borderRadius: "12px",
        background: "#f8f3f3",
        border: "1px solid #e4d5d5",
      }}
    >
      <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Fitzpatrick Skin Type: {info.label}</strong>
        <span
          style={{
            fontSize: "0.8rem",
            padding: "2px 8px",
            borderRadius: "999px",
            background: "#efe2ff",
            color: "#6b3fad",
          }}
        >
          Auto-detected
        </span>
      </div>

      {/* Color scale */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "4px",
          marginBottom: "10px",
        }}
      >
        {SCALE_ORDER.map((t) => {
          const item = TYPE_INFO[t];
          const isActive = t === numeric;
          return (
            <div
              key={t}
              style={{
                height: "20px",
                borderRadius: "8px",
                background: item.color,
                border: isActive ? "2px solid #222" : "1px solid rgba(0,0,0,0.1)",
                boxShadow: isActive ? "0 0 0 2px rgba(0,0,0,0.15)" : "none",
                position: "relative",
              }}
              title={item.label}
            >
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    top: "-18px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    background: "#fff",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    border: "1px solid #ddd",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        {info.desc}
      </p>
    </div>
  );
}


