// components/ImageUploader.js
// Selfie uploader with preview + REQUIRED notice block

import React, { useState } from "react";

export function ImageUploader({ onImageSelected, required = false }) {
  const [preview, setPreview] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setPreview(base64);
      if (onImageSelected) onImageSelected(base64);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        style={{
          border: "1px solid #E5E7EB",
          background: "#F9FAFB",
          borderRadius: "12px",
          padding: "12px 14px",
          marginBottom: "12px",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: "6px" }}>
          Before we begin
        </div>

        <div style={{ fontSize: "0.92rem", color: "#374151", lineHeight: 1.45 }}>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>USA only:</strong> Detailed virtual skin analysis is currently available
            only for visitors located in the United States.
          </p>

          <p style={{ margin: "0 0 8px 0" }}>
            <strong>One analysis every 30 days:</strong> To protect quality and prevent
            “chasing changes” too frequently, we limit each email to one full report every 30 days
            so you can actually see meaningful progress.
          </p>

          <p style={{ margin: 0 }}>
            <strong>Timing:</strong> Your detailed analysis typically takes{" "}
            <strong>30–60 seconds</strong> to complete once you submit your selfie.
          </p>
        </div>
      </div>

      <label
        style={{
          display: "block",
          fontWeight: 500,
          marginBottom: "4px",
        }}
      >
        Upload your selfie {required ? <span style={{ color: "#b00020" }}>*</span> : null}
      </label>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        required={required}
      />

      {preview && (
        <div
          style={{
            marginTop: "12px",
            borderRadius: "12px",
            overflow: "hidden",
            maxWidth: "240px",
          }}
        >
          <img src={preview} alt="Preview" style={{ width: "100%", display: "block" }} />
        </div>
      )}
    </div>
  );
}

