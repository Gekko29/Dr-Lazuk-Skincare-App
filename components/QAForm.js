// components/QAForm.js
// Reusable form for Ask-Dr-Lazuk Q&A.
// Now supports OPTIONAL selfie upload (photoDataUrl).

import React from "react";

export function QAForm({
  question,
  onChange,
  onSubmit,
  loading,
  photoDataUrl,
  onPhotoSelected,
}) {
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      if (onPhotoSelected) onPhotoSelected(base64);
    };
    reader.readAsDataURL(file);
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
        Ask Dr. Lazuk a Skincare Question
      </h2>
      <p style={{ color: "#777", marginBottom: "16px" }}>
        Type your question below. Optionally upload a selfie to help me tailor my
        answer cosmetically.
      </p>

      {/* Optional selfie */}
      <div style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
          Optional selfie (for cosmetic context)
        </label>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {photoDataUrl ? (
          <div
            style={{
              marginTop: "10px",
              borderRadius: "12px",
              overflow: "hidden",
              maxWidth: "220px",
              border: "1px solid #eee",
            }}
          >
            <img
              src={photoDataUrl}
              alt="Selfie preview"
              style={{ width: "100%", display: "block" }}
            />
          </div>
        ) : null}
      </div>

      {/* Question */}
      <div style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
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
