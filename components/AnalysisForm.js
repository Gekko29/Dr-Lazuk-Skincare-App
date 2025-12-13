// components/AnalysisForm.js
// Reusable form for collecting the REQUIRED inputs for /api/generate-report

import React from "react";

export function AnalysisForm({ values, onChange, onSubmit, loading }) {
  const handleChange = (field) => (e) => {
    onChange({ ...values, [field]: e.target.value });
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
        Personalized Analysis Inputs
      </h2>
      <p style={{ color: "#777", marginBottom: "16px" }}>
        These details are required to generate your personalized letter and email
        you the full report.
      </p>

      <LabelInput
        label="Email (required)"
        value={values.email || ""}
        onChange={handleChange("email")}
        placeholder="you@example.com"
        type="email"
      />

      <LabelSelect
        label="Age range (required)"
        value={values.ageRange || ""}
        onChange={handleChange("ageRange")}
        options={[
          "",
          "Under 18",
          "18–24",
          "25–34",
          "35–44",
          "45–54",
          "55–64",
          "65+",
        ]}
      />

      <LabelSelect
        label="Primary cosmetic concern (required)"
        value={values.primaryConcern || ""}
        onChange={handleChange("primaryConcern")}
        options={[
          "",
          "Acne / Breakouts",
          "Uneven tone / Dark spots",
          "Fine lines / Wrinkles",
          "Texture / Roughness",
          "Redness / Sensitivity",
          "Dryness / Dehydration",
          "Oiliness / Shine",
          "Pores / Congestion",
          "Under-eye concerns",
          "Firmness / Sagging",
          "Glow / Dullness",
        ]}
      />

      <LabelTextArea
        label="Your question / notes (optional)"
        value={values.visitorQuestion || ""}
        onChange={handleChange("visitorQuestion")}
        placeholder="Anything you want me to focus on? (Example: 'My skin feels dry but my T-zone gets shiny by noon…')"
      />

      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: "16px",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: "#222",
          color: "#fff",
          fontWeight: 500,
          minWidth: "220px",
        }}
      >
        {loading ? "Generating..." : "Generate & Email My Report"}
      </button>
    </form>
  );
}

function LabelInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
        {label}
      </label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function LabelSelect({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
          background: "#fff",
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "" ? "Select..." : opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function LabelTextArea({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={4}
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
    </div>
  );
}
