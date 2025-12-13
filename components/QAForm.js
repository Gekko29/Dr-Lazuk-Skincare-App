// components/QAForm.js
// Reusable form for Ask-Dr-Lazuk Q&A.
// Now supports OPTIONAL selfie upload for more personalized answers.

import React from "react";
import { ImageUploader } from "./ImageUploader";

export function QAForm({
  question,
  onChange,
  onSubmit,
  loading,
  photoDataUrl,
  onPhotoSelected,
}) {
  return (
    <form onSubmit={onSubmit}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
        Ask Dr. Lazuk a Skincare Question
      </h2>
      <p style={{ color: "#777", marginBottom: "16px" }}>
        Type your question below. If you’d like, upload a selfie so I can tailor
        my answer to what’s visible cosmetically (education-only).
      </p>

      {/* Optional selfie upload */}
      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: "6px" }}>
          Optional: Upload a selfie for more personalized guidance
        </label>

        <ImageUploader onImageSelected={onPhotoSelected} />

        {photoDataUrl ? (
          <p style={{ marginTop: "8px", color: "#666", fontSize: "0.9rem" }}>
            ✅ Selfie attached — I’ll reference only what’s visibly present (cosmetic-only).
          </p>
        ) : (
          <p style={{ marginTop: "8px", color: "#666", fontSize: "0.9rem" }}>
            No selfie uploaded (totally fine).
          </p>
        )}
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label
          style={{
            display: "block",
            fontWeight: 500,
            marginBottom: "4px",
          }}
        >
          Your question
        </label>
        <textarea
          value={question}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="e.g. My skin is oily but sensitive. How should I cleanse without stripping it?"
          style={{
            width: "100%",
            resize: "vertical",
            padding: "8px",
            borderRadius: "8px",
            border: "1px solid #ddd",
            fontFamily: "inherit",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !question.trim()}
        style={{
          marginTop: "8px",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: "#222",
          color: "#fff",
          fontWeight: 500,
          minWidth: "180px",
        }}
      >
        {loading ? "Asking..." : "Ask Dr. Lazuk"}
      </button>
    </form>
  );
}

