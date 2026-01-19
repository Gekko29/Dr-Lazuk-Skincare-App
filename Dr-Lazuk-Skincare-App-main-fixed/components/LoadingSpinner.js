// components/LoadingSpinner.js
// Simple, reusable loading indicator.

import React from "react";

export function LoadingSpinner({ label = "Loading..." }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "0.9rem",
        color: "#555",
      }}
    >
      <span
        style={{
          width: "14px",
          height: "14px",
          borderRadius: "999px",
          border: "2px solid #ddd",
          borderTopColor: "#333",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span>{label}</span>
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
