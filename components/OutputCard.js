// components/OutputCard.js
// Shared output display component.

import React from "react";

export function OutputCard({ title = "Output", value }) {
  return (
    <div style={{ marginTop: "24px" }}>
      <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>{title}</h3>
      <textarea
        readOnly
        value={value}
        rows={12}
        placeholder="Your personalized Dr. Lazuk message will appear here..."
        style={{
          width: "100%",
          resize: "vertical",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
          whiteSpace: "pre-wrap",
        }}
      />
    </div>
  );
}
