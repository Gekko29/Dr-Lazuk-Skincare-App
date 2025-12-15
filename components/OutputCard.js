// components/OutputCard.js
// Shared output display component (copy-friendly + nicer UX)

import React, { useMemo, useState } from "react";

export function OutputCard({ title = "Output", value }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => (value == null ? "" : String(value)), [value]);
  const hasText = text.trim().length > 0;

  async function handleCopy() {
    if (!hasText) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      return;
    } catch {
      // Fallback for older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch (e) {
        console.error("Copy failed:", e);
      }
    }
  }

  function handleDownloadTxt() {
    if (!hasText) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "dr-lazuk-letter.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "10px",
        }}
      >
        <h3 style={{ fontSize: "1rem", margin: 0, fontWeight: 700, color: "#111827" }}>{title}</h3>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {copied ? (
            <span style={{ fontSize: "12px", color: "#16A34A", fontWeight: 600 }}>Copied ✓</span>
          ) : null}

          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasText}
            style={{
              border: "1px solid #E5E7EB",
              background: hasText ? "#111827" : "#9CA3AF",
              color: "#fff",
              padding: "8px 10px",
              borderRadius: "10px",
              fontSize: "12px",
              cursor: hasText ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
            aria-label="Copy letter to clipboard"
            title={hasText ? "Copy to clipboard" : "Generate a letter first"}
          >
            Copy
          </button>

          <button
            type="button"
            onClick={handleDownloadTxt}
            disabled={!hasText}
            style={{
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
              color: hasText ? "#111827" : "#9CA3AF",
              padding: "8px 10px",
              borderRadius: "10px",
              fontSize: "12px",
              cursor: hasText ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
            aria-label="Download letter as a text file"
            title={hasText ? "Download .txt" : "Generate a letter first"}
          >
            Download .txt
          </button>
        </div>
      </div>

      <textarea
        readOnly
        value={text}
        rows={14}
        placeholder="Your personalized Dr. Lazuk message will appear here..."
        onFocus={(e) => {
          // Helpful: auto-select text for quick manual copy
          if (hasText) e.target.select();
        }}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "12px",
          borderRadius: "12px",
          border: "1px solid #E5E7EB",
          background: "#FAFAFA",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: "12.5px",
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          color: "#111827",
          outline: "none",
        }}
      />
    </div>
  );
}
