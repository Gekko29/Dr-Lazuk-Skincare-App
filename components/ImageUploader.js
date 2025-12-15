// components/ImageUploader.js
// Selfie uploader with preview + OPTIONAL notice block.
// Used by Analysis (required + notices) and Ask (optional + notices hidden)
//
// Updates:
// ✅ Validates file type + max size (default 8MB, configurable)
// ✅ Prevents huge base64 payloads: resizes + compresses on client before converting to dataURL
// ✅ Better UX: “Remove / Replace”, helper text, accessible styling
// ✅ Keeps API contract the same: onImageSelected(base64DataUrl | null)

import React, { useMemo, useRef, useState } from "react";

export function ImageUploader({
  onImageSelected,
  required = false,
  showNotices = true,
  title = "Upload your selfie",
  maxFileMB = 8,
  maxSidePx = 1200, // keeps payload smaller while preserving detail
  jpegQuality = 0.85,
}) {
  const inputRef = useRef(null);

  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const maxBytes = useMemo(() => maxFileMB * 1024 * 1024, [maxFileMB]);

  function reset() {
    setPreview(null);
    setFileName("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    if (onImageSelected) onImageSelected(null);
  }

  async function handleFileChange(e) {
    setError("");

    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validations
    if (!file.type || !file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, HEIC, etc.).");
      resetInputOnly();
      return;
    }

    if (file.size > maxBytes) {
      setError(`That file is too large. Please choose an image under ${maxFileMB}MB.`);
      resetInputOnly();
      return;
    }

    setFileName(file.name || "");

    try {
      const dataUrl = await fileToOptimizedDataUrl(file, { maxSidePx, jpegQuality });

      setPreview(dataUrl);
      if (onImageSelected) onImageSelected(dataUrl);
    } catch (err) {
      console.error("Image processing error:", err);
      setError("We couldn’t process that image. Please try a different photo.");
      resetInputOnly();
    }
  }

  function resetInputOnly() {
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      {showNotices ? (
        <div
          style={{
            border: "1px solid #E5E7EB",
            background: "#F9FAFB",
            borderRadius: "12px",
            padding: "12px 14px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: "6px", color: "#111827" }}>
            Before you begin
          </div>

          <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.45 }}>
            <p style={{ margin: "0 0 8px 0" }}>
              <strong>USA only:</strong> Detailed virtual skin analysis is currently available only
              for visitors located in the United States.
            </p>

            <p style={{ margin: "0 0 8px 0" }}>
              <strong>One analysis every 30 days:</strong> To protect quality and prevent “chasing
              changes” too frequently, we limit each email to one full report every 30 days so you
              can actually see meaningful progress.
            </p>

            <p style={{ margin: 0 }}>
              <strong>Timing:</strong> Your detailed analysis typically takes{" "}
              <strong>30–60 seconds</strong> to complete once you submit your selfie.
            </p>

            <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6B7280" }}>
              Tip: Face the window, remove harsh filters, and keep your expression relaxed.
            </p>
          </div>
        </div>
      ) : null}

      <label
        style={{
          display: "block",
          fontWeight: 900,
          marginBottom: "6px",
          color: "#111827",
        }}
      >
        {title} {required ? <span style={{ color: "#b00020" }}>*</span> : null}
      </label>

      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          required={required && !preview}
          style={{
            padding: "8px",
            borderRadius: "10px",
            border: "1px solid #E5E7EB",
            background: "#fff",
          }}
        />

        {preview ? (
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #E5E7EB",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Remove
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: "6px", fontSize: "12px", color: "#6B7280" }}>
        {fileName ? (
          <span>
            Selected: <strong style={{ color: "#111827" }}>{fileName}</strong>
          </span>
        ) : (
          <span>Accepted: JPG/PNG/HEIC. Max {maxFileMB}MB.</span>
        )}
      </div>

      {error ? (
        <div style={{ marginTop: "10px", color: "#b00020", fontSize: "12px", fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      {preview ? (
        <div
          style={{
            marginTop: "12px",
            borderRadius: "14px",
            overflow: "hidden",
            maxWidth: "260px",
            border: "1px solid #E5E7EB",
            background: "#fff",
          }}
        >
          <img
            src={preview}
            alt="Selfie preview"
            style={{ width: "100%", display: "block" }}
          />
        </div>
      ) : null}
    </div>
  );
}

// --- helpers ---
// Convert file -> optimized dataURL by resizing on a canvas + exporting JPEG.
// Keeps payloads small and avoids Vercel body-size pain.
function fileToOptimizedDataUrl(file, { maxSidePx = 1200, jpegQuality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const { width, height } = img;

        // Scale down if needed
        const scale = Math.min(1, maxSidePx / Math.max(width, height));
        const outW = Math.round(width * scale);
        const outH = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");

        // Draw
        ctx.drawImage(img, 0, 0, outW, outH);

        // Export (JPEG is much smaller than PNG for photos)
        const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);

        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

