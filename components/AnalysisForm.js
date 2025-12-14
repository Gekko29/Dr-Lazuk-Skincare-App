// components/AnalysisForm.js
// Form for generate-report inputs:
// firstName, email, ageRange, primaryConcern, visitorQuestion

import React from "react";

export function AnalysisForm({ values, onChange, onSubmit, loading }) {
  const setField = (field) => (e) => {
    onChange({ ...values, [field]: e.target.value });
  };

  return (
    <form onSubmit={onSubmit} style={{ marginTop: "8px" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
        Your Details (for your report)
      </h2>
      <p style={{ color: "#777", marginBottom: "16px" }}>
        This creates your personalized report and sends it to your email.
      </p>

      <LabelInput
        label="First Name"
        type="text"
        value={values.firstName}
        onChange={setField("firstName")}
        placeholder="e.g., Mark"
        required
      />

      <LabelInput
        label="Email"
        type="email"
        value={values.email}
        onChange={setField("email")}
        placeholder="you@example.com"
        required
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
        disabled={loading}
        style={{
          marginTop: "16px",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
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

function LabelInput({ label, value, onChange, placeholder, type = "text", required }) {
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
        required={required}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function LabelSelect({ label, value, onChange, options, required }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label style={{ display: "block", fontWeight: 500, marginBottom: "4px" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        required={required}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
          background: "#fff",
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
          resize: "vertical",
          padding: "10px",
          borderRadius: "10px",
          border: "1px solid #ddd",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

    </div>
  );
}
