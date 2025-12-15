// pages/analysis.js
import { useMemo, useState } from "react";
import { AnalysisForm } from "../components/AnalysisForm";
import { OutputCard } from "../components/OutputCard";
import { ImageUploader } from "../components/ImageUploader";
import { FitzpatrickDetector } from "../components/FitzpatrickDetector";

export default function AnalysisPage() {
  const [form, setForm] = useState({
    firstName: "",
    email: "",
    ageRange: "",
    primaryConcern: "",
    visitorQuestion: "",
  });

  // Selfie (MANDATORY)
  const [imageBase64, setImageBase64] = useState(null);

  // Optional pre-analysis (for early Fitz UI feedback)
  const [imageAnalysis, setImageAnalysis] = useState(null);
  const [fitzpatrickType, setFitzpatrickType] = useState(null);

  // Output from generate-report
  const [output, setOutput] = useState("");
  const [fitzpatrickSummary, setFitzpatrickSummary] = useState(null);
  const [agingPreviewImages, setAgingPreviewImages] = useState(null);

  // Dermatology Engine (structured, clinician-style output)
  const [dermEngine, setDermEngine] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const hasSelfie = useMemo(() => !!imageBase64, [imageBase64]);

  async function handleGenerate(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setOutput("");
    setFitzpatrickSummary(null);
    setAgingPreviewImages(null);
    setDermEngine(null);

    try {
      const firstName = String(form.firstName || "").trim();
      const email = String(form.email || "").trim();
      const ageRange = String(form.ageRange || "").trim();
      const primaryConcern = String(form.primaryConcern || "").trim();
      const visitorQuestion = String(form.visitorQuestion || "").trim();

      if (!firstName) throw new Error("Please enter your first name.");
      if (!email || !email.includes("@")) throw new Error("Please enter a valid email address.");
      if (!ageRange || !primaryConcern)
        throw new Error("Please select an age range and primary concern.");

      // Selfie is REQUIRED (per your direction)
      if (!imageBase64) throw new Error("Please upload a selfie to generate your detailed analysis.");

      let localImageAnalysis = imageAnalysis;

      // 1) Pre-analyze selfie for early UI feedback (Fitz display)
      // IMPORTANT: Do not let this block the main report flow.
      try {
        const analyzeRes = await fetch("/api/analyzeImage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            notes: visitorQuestion || "",
          }),
        });

        const analyzeData = await analyzeRes.json().catch(() => ({}));

        if (analyzeRes.ok) {
          localImageAnalysis = analyzeData;
          setImageAnalysis(analyzeData);

          if (analyzeData?.fitzpatrickType) {
            setFitzpatrickType(analyzeData.fitzpatrickType);
          }
        } else {
          // Soft fail: proceed to generate-report (it can enrich with vision)
          console.warn("analyzeImage failed; proceeding to generate-report:", analyzeData);
        }
      } catch (analyzeErr) {
        console.warn("analyzeImage exception; proceeding to generate-report:", analyzeErr);
      }

      // 2) Generate report (canonical endpoint)
      const response = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          email,
          ageRange,
          primaryConcern,
          visitorQuestion: visitorQuestion || null,
          photoDataUrl: imageBase64, // ✅ mandatory
          imageAnalysis: localImageAnalysis || null, // optional pass-through
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Unexpected error while generating report (HTTP ${response.status}).`
        );
      }

      setOutput(data.report || "");
      // generate-report may return Roman (I–VI); analyzeImage returns numeric (1–6). Detector supports both.
      setFitzpatrickType(data.fitzpatrickType || fitzpatrickType || null);
      setFitzpatrickSummary(data.fitzpatrickSummary || null);
      setAgingPreviewImages(data.agingPreviewImages || null);

      // Derm Engine output (structured JSON)
      setDermEngine(data.dermEngine || null);
    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Something went wrong while generating the analysis letter.");
    } finally {
      setLoading(false);
    }
  }

  // Helper: robustly extract aging trajectory snapshot (keys may vary)
  function getAgingTrajectorySnapshot(engine) {
    const f = engine?.framework_15_point || engine?.framework15 || engine?.framework || null;
    if (!f || typeof f !== "object") return null;

    const traj =
      f["15_aging_trajectory"] ||
      f["15. Aging trajectory"] ||
      f["15. Aging Trajectory"] ||
      f["Aging trajectory"] ||
      f["Aging Trajectory"] ||
      f["aging_trajectory"] ||
      f["agingTrajectory"] ||
      null;

    if (!traj) return null;

    const dominantDriver =
      traj?.dominant_driver ||
      traj?.dominantDriver ||
      traj?.driver ||
      (typeof traj === "string" ? traj : null) ||
      null;

    return {
      dominantDriver: dominantDriver || "—",
    };
  }

  const agingTraj = getAgingTrajectorySnapshot(dermEngine);

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#faf7f7",
        display: "flex",
        justifyContent: "center",
        padding: "40px 16px",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          width: "100%",
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          padding: "24px 24px 32px",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", marginBottom: "4px", fontWeight: 700 }}>
          Personalized Skin Analysis
        </h1>
        <p style={{ color: "#6B7280", marginBottom: "14px", fontSize: "13px" }}>
          Upload your selfie and receive a full narrative letter from Dr. Lazuk via email.
        </p>

        {/* Selfie uploader (mandatory) — show notices here (avoid duplicate block on page) */}
        <ImageUploader
          onImageSelected={setImageBase64}
          required
          showNotices={true}
          title="Upload your selfie"
        />

        {/* Fitzpatrick display (only when detected/returned) */}
        <FitzpatrickDetector type={fitzpatrickType} detectedBy="auto" />

        <AnalysisForm
          values={form}
          onChange={setForm}
          onSubmit={handleGenerate}
          loading={loading}
          selfieRequired={true}
          hasSelfie={hasSelfie}
        />

        {errorMsg ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid rgba(176,0,32,0.25)",
              background: "rgba(176,0,32,0.06)",
              borderRadius: "12px",
              padding: "10px 12px",
              color: "#b00020",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        {/* Fitz summary if returned */}
        {fitzpatrickSummary ? (
          <div
            style={{
              marginTop: "16px",
              border: "1px solid #FCD34D",
              background: "#FFFBEB",
              borderRadius: "12px",
              padding: "12px 14px",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: "4px", color: "#92400E" }}>
              Fitzpatrick Skin Type (Cosmetic Estimate)
            </div>
            <div style={{ color: "#92400E", fontSize: "13px", lineHeight: 1.45 }}>
              {fitzpatrickType ? `Type ${fitzpatrickType}. ` : ""}
              {fitzpatrickSummary}
            </div>
          </div>
        ) : null}

        {/* Optional: show aging preview images on the page too */}
        {agingPreviewImages ? (
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontWeight: 900, marginBottom: "8px", color: "#111827" }}>
              Your Skin’s Future Story — A Preview
            </div>

            <p style={{ marginTop: 0, color: "#6B7280", fontSize: "12px" }}>
              These are AI-generated visualizations for cosmetic education and entertainment only — not medical predictions.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "10px",
              }}
            >
              {agingPreviewImages.noChange10 ? (
                <img
                  src={agingPreviewImages.noChange10}
                  alt="~10 years minimal skincare changes"
                  style={{ width: "100%", borderRadius: "12px", border: "1px solid #E5E7EB" }}
                />
              ) : null}
              {agingPreviewImages.noChange20 ? (
                <img
                  src={agingPreviewImages.noChange20}
                  alt="~20 years minimal skincare changes"
                  style={{ width: "100%", borderRadius: "12px", border: "1px solid #E5E7EB" }}
                />
              ) : null}
              {agingPreviewImages.withCare10 ? (
                <img
                  src={agingPreviewImages.withCare10}
                  alt="~10 years with consistent care"
                  style={{ width: "100%", borderRadius: "12px", border: "1px solid #E5E7EB" }}
                />
              ) : null}
              {agingPreviewImages.withCare20 ? (
                <img
                  src={agingPreviewImages.withCare20}
                  alt="~20 years with consistent care"
                  style={{ width: "100%", borderRadius: "12px", border: "1px solid #E5E7EB" }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Dermatologist Confidence & Clinical Context (show even if meta is missing / parse errors) */}
        {dermEngine ? (
          <div
            style={{
              marginTop: "20px",
              border: "1px solid #E5E7EB",
              background: "#F9FAFB",
              borderRadius: "12px",
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: "6px", color: "#111827" }}>
              Dermatologist Review Notes
            </div>

            {dermEngine?.ok === false ? (
              <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#b00020", fontWeight: 800 }}>
                Dermatology Engine note: structured output was unavailable for this run.
              </p>
            ) : null}

            {typeof dermEngine?.meta?.confidence_score_0_100 === "number" ? (
              <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#374151" }}>
                <strong>Assessment confidence:</strong>{" "}
                {dermEngine.meta.confidence_score_0_100}%{" "}
                {dermEngine.meta.confidence_label ? `(${dermEngine.meta.confidence_label})` : ""}
              </p>
            ) : null}

            {Array.isArray(dermEngine?.meta?.limitations) && dermEngine.meta.limitations.length > 0 ? (
              <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#374151" }}>
                <strong>Limitations noted:</strong> {dermEngine.meta.limitations.join(", ")}
              </p>
            ) : null}

            {Array.isArray(dermEngine?.negative_findings) && dermEngine.negative_findings.length > 0 ? (
              <div style={{ marginTop: "8px" }}>
                <div style={{ fontWeight: 800, fontSize: "13px", marginBottom: "4px", color: "#111827" }}>
                  What I did not see
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#374151" }}>
                  {dermEngine.negative_findings.slice(0, 4).map((nf, i) => (
                    <li key={i}>{nf?.not_observed || String(nf)}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {agingTraj ? (
              <div style={{ marginTop: "8px", fontSize: "13px", color: "#374151" }}>
                <strong>Dominant aging driver:</strong> {agingTraj.dominantDriver}
              </div>
            ) : null}

            <p style={{ marginTop: "8px", fontSize: "11px", color: "#6B7280" }}>
              This assessment is based on visual pattern recognition only and is not a medical diagnosis.
            </p>
          </div>
        ) : null}

        <OutputCard title="Dr. Lazuk Letter" value={output} />
      </div>
    </div>
  );
}


