// components/OutputCard.js
// Shared output display component (copy-friendly + nicer UX)

import React, { useMemo, useState } from "react";

export function OutputCard({ title = "Output", value }) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => (value == null ? "" : String(value)), [value]);
  const hasText = text.trim().length > 0;

  function resetCopiedSoon() {
    try {
      if (typeof window !== "undefined") {
        window.setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      // no-op
    }
  }

  async function handleCopy() {
    if (!hasText) return;

    // Modern clipboard
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        resetCopiedSoon();
        return;
      }
    } catch {
      // fall through to legacy copy
    }

    // Legacy fallback
    try {
      if (typeof document === "undefined") return;

      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);

      setCopied(true);
      resetCopiedSoon();
    } catch (e) {
      console.error("Copy failed:", e);
    }
  }

  function handleDownloadTxt() {
    if (!hasText) return;
    if (typeof document === "undefined") return;

    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "dr-lazuk-letter.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    }
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
        <h3 style={{ fontSize: "1rem", margin: 0, fontWeight: 700, color: "#111827" }}>
          {title}
        </h3>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            aria-live="polite"
            style={{
              fontSize: "12px",
              color: copied ? "#16A34A" : "transparent",
              fontWeight: 700,
              minWidth: "72px",
              textAlign: "right",
            }}
          >
            {copied ? "Copied ✓" : "Copied"}
          </span>

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

      {!hasText ? (
        <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px" }}>
          Once your report is generated, you’ll see the full letter here (and it will also be emailed to you).
        </div>
      ) : null}

      <textarea
        readOnly
        value={text}
        rows={14}
        placeholder="Your personalized Dr. Lazuk message will appear here..."
        onFocus={(e) => {
          if (!hasText) return;
          // Safer selection timing in some browsers
          try {
            if (typeof window !== "undefined" && window.requestAnimationFrame) {
              window.requestAnimationFrame(() => e.target.select());
            } else {
              e.target.select();
            }
          } catch {
            // no-op
          }
        }}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "12px",
          borderRadius: "12px",
          border: "1px solid #E5E7EB",
          background: "#FAFAFA",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
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
