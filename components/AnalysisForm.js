// components/AnalysisForm.js
// Reusable form for entering (or auto-filling) analysis fields.

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
        In production, these values will be filled automatically from your image
        and analysis pipeline. For now, you can test by entering phrases.
      </p>

      <LabelInput
        label="Compliment features"
        value={values.complimentFeatures}
        onChange={handleChange("complimentFeatures")}
        placeholder="e.g. the way your bright blue eyes catch the light feels so open and confident"
      />
      <LabelInput
        label="Skin findings (overall)"
        value={values.skinFindings}
        onChange={handleChange("skinFindings")}
        placeholder="e.g. gentle signs of dehydration, a bit of uneven tone, and early expression lines"
      />
      <LabelInput
        label="Texture description"
        value={values.texture}
        onChange={handleChange("texture")}
        placeholder="e.g. a few areas of mild roughness suggesting your barrier needs more hydration"
      />
      <LabelInput
        label="Pore behavior"
        value={values.poreBehavior}
        onChange={handleChange("poreBehavior")}
        placeholder="e.g. pores slightly more visible in the T-zone when stressed or tired"
      />
      <LabelInput
        label="Pigment description"
        value={values.pigment}
        onChange={handleChange("pigment")}
        placeholder="e.g. soft sun-related pigment lingering on the cheeks and forehead"
      />
      <LabelInput
        label="Fine lines areas"
        value={values.fineLinesAreas}
        onChange={handleChange("fineLinesAreas")}
        placeholder="e.g. around your eyes and gently across your forehead"
      />
      <LabelInput
        label="Elasticity findings"
        value={values.elasticity}
        onChange={handleChange("elasticity")}
        placeholder="e.g. a slight softening of firmness around the lower face"
      />
      <LabelInput
        label="Evening active recommendation"
        value={values.eveningActive}
        onChange={handleChange("eveningActive")}
        placeholder="e.g. a low-strength retinoid three nights a week, alternating with barrier-repair nights"
      />
      <LabelInput
        label="Esthetic treatment recommendations"
        value={values.estheticRecommendations}
        onChange={handleChange("estheticRecommendations")}
        placeholder="e.g. HydraFacials for clarity and microneedling or PRP for deeper collagen support"
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
          minWidth: "180px",
        }}
      >
        {loading ? "Generating..." : "Generate Analysis Letter"}
      </button>
    </form>
  );
}

function LabelInput({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <label
        style={{
          display: "block",
          fontWeight: 500,
          marginBottom: "4px",
        }}
      >
        {label}
      </label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
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
