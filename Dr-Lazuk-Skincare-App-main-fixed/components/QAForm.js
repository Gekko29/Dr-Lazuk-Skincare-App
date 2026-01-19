// components/QAForm.js
// Reusable form for Ask-Dr-Lazuk Q&A + OPTIONAL selfie upload.

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

      <div
        style={{
          border: "1px solid #E5E7EB",
          background: "#F9FAFB",
          borderRadius: "12px",
          padding: "12px 14px",
          marginBottom: "14px",
          color: "#374151",
          fontSize: "0.92rem",
          lineHeight: 1.45,
        }}
      >
        <strong>Optional:</strong> Upload a selfie if you’d like a more personalized,
        appearance-based response (for example: redness vs. dryness vs. texture). This is
        cosmetic education only — no medical diagnosis.
      </div>

      <ImageUploader
        onImageSelected={onPhotoSelected}
        required={false}
        showNotices={false} // ✅ hide analysis-only notices here
        title="Optional selfie (for more personalized context)"
      />

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

