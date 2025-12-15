// components/AnalysisForm.js
// Form for generate-report inputs:
// firstName, email, ageRange, primaryConcern, visitorQuestion
//
// NOTE: Your original file had a stray/unmatched closing block at the bottom.
// This version fixes that + improves UX while staying compatible with your current pages/analysis.js.

import React, { useMemo } from "react";

export function AnalysisForm({
  values,
  onChange,
  onSubmit,
  loading,
  // Optional (non-breaking): if you pass these later, the button can enforce “selfie required”
  selfieRequired = false,
  hasSelfie = true,
}) {
  const setField = (field) => (e) => {
    onChange({ ...values, [field]: e.target.value });
  };

  const canSubmit = useMemo(() => {
    if (loading) return false;

    const firstNameOk = String(values.firstName || "").trim().length > 0;
    const emailOk = String(values.email || "").trim().includes("@");
    const ageOk = String(values.ageRange || "").trim().length > 0;
    const concernOk = String(values.primaryConcern || "").trim().length > 0;

    if (!firstNameOk || !emailOk || !ageOk || !concernOk) return false;
    if (selfieRequired && !hasSelfie) return false;

    return true;
  }, [loading, values, selfieRequired, hasSelfie]);

  const submitLabel = loading ? "Generating..." : "Generate & Email My Report";
  const helper =
    selfieRequired && !hasSelfie
      ? "Please upload a selfie above to generate your report."
      : "This creates your personalized report and sends it to your email.";

  return (
    <form onSubmit={onSubmit} style={{ marginTop: "8px" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "6px", fontWeight: 800, color: "#111827" }}>
        Your Details (for your report)
      </h2>

      <p style={{ color: "#6B7280", marginTop: 0, marginBottom: "14px", fontSize: "13px" }}>
        {helper}
      </p>

      <LabelInput
        label="First Name"
        type="text"
        value={values.firstName}
        onChange={setField("firstName")}
        placeholder="e.g., Mark"
        required
        autoComplete="given-name"
      />

      <LabelInput
        label="Email"
        type="email"
        value={values.email}
        onChange={setField("email")}
        placeholder="you@example.com"
        required
        autoComplete="email"
      />

      <LabelSelect
        label="Age Range"
        value={values.ageRange}
        onChange={setField("ageRange")}
        required
        options={[
          { value: "", label: "Select your age range" },
          { value: "18–24", label: "18–24" },
          { value: "25–34", label: "25–34" },
          { value: "35–44", label: "35–44" },
          { value: "45–54", label: "45–54" },
          { value: "55–64", label: "55–64" },
          { value: "65+", label: "65+" },
        ]}
      />

      <LabelSelect
        label="Primary Cosmetic Concern"
        value={values.primaryConcern}
        onChange={setField("primaryConcern")}
        required
        options={[
          { value: "", label: "Select your primary concern" },
          { value: "Texture / roughness", label: "Texture / roughness" },
          { value: "Visible pores", label: "Visible pores" },
          { value: "Uneven tone / spots", label: "Uneven tone / spots" },
          { value: "Redness / sensitivity", label: "Redness / sensitivity" },
          { value: "Breakouts / congestion", label: "Breakouts / congestion" },
          { value: "Fine lines / aging support", label: "Fine lines / aging support" },
          { value: "Dryness / dehydration", label: "Dryness / dehydration" },
          { value: "Glow / dullness", label: "Glow / dullness" },
        ]}
      />

      <LabelTextarea
        label="Anything you want Dr. Lazuk to focus on? (optional)"
        value={values.visitorQuestion}
        onChange={setField("visitorQuestion")}
        placeholder="e.g., I get oily in the T-zone but feel dry on my cheeks. I want a calmer routine."
      />

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          marginTop: "14px",
          padding: "11px 18px",
          borderRadius: "999px",
          border: "1px solid #111827",
          cursor: canSubmit ? "pointer" : "not-allowed",
          background: canSubmit ? "#111827" : "#9CA3AF",
          color: "#fff",
          fontWeight: 800,
          minWidth: "240px",
        }}
      >
        {submitLabel}
      </button>

      {!canSubmit && !loading ? (
        <p style={{ marginTop: "10px", fontSize: "12px", color: "#6B7280" }}>
          Tip: complete all required fields{selfieRequired ? " and upload a selfie" : ""} to enable the button.
        </p>
      ) : null}
    </form>
  );
}

function LabelInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  autoComplete,
}) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 700, marginBottom: "4px", color: "#111827" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        required={required}
        autoComplete={autoComplete}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "12px",
          border: "1px solid #E5E7EB",
          fontFamily: "inherit",
          background: "#fff",
          outline: "none",
        }}
      />
    </div>
  );
}

function LabelSelect({ label, value, onChange, options, required }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 700, marginBottom: "4px", color: "#111827" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        required={required}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "12px",
          border: "1px solid #E5E7EB",
          fontFamily: "inherit",
          background: "#fff",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value || o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LabelTextarea({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 700, marginBottom: "4px", color: "#111827" }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={4}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          borderRadius: "12px",
          border: "1px solid #E5E7EB",
          fontFamily: "inherit",
          background: "#fff",
          outline: "none",
        }}
      />
    </div>
  );
}
