// components/ImageUploader.js
// Basic image uploader with preview and callback.

import React, { useState } from "react";

export function ImageUploader({ onImageSelected }) {
  const [preview, setPreview] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setPreview(base64);
      if (onImageSelected) {
        onImageSelected(base64);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        style={{
          display: "block",
          fontWeight: 500,
          marginBottom: "4px",
        }}
      >
        Upload your photo
      </label>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {preview && (
        <div
          style={{
            marginTop: "12px",
            borderRadius: "12px",
            overflow: "hidden",
            maxWidth: "240px",
          }}
        >
          <img
            src={preview}
            alt="Preview"
            style={{ width: "100%", display: "block" }}
          />
        </div>
      )}
    </div>
  );
}
