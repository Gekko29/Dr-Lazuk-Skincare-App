// pages/analysis.js
import { useState } from "react";
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

  const [imageBase64, setImageBase64] = useState(null);

  const [imageAnalysis, setImageAnalysis] = useState(null);
  const [fitzpatrickType, setFitzpatrickType] = useState(null);

  const [output, setOutput] = useState("");
  const [fitzpatrickSummary, setFitzpatrickSummary] = useState(null);
  const [agingPreviewImages, setAgingPreviewImages] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGenerate(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setOutput("");
    setFitzpatrickSummary(null);
    setAgingPreviewImages(null);

    try {
      const firstName = String(form.firstName || "").trim();
      const email = String(form.email || "").trim();
      const ageRange = String(form.ageRange || "").trim();
      const primaryConcern = String(form.primaryConcern || "").trim();
      const visitorQuestion = String(form.visitorQuestion || "").trim();

      if (!firstName) throw new Error("Please enter your first name.");
      if (!email || !email.includes("@")) throw new Error("Please enter a valid email address.");
      if (!ageRange || !primaryConcern) throw new Error("Please select an age range and primary concern.");

      // Selfie is REQUIRED (per your direction)
      if (!imageBase64) throw new Error("Please upload a selfie to generate your detailed analysis.");

      let localImageAnalysis = imageAnalysis;

      // Optional: pre-analyze selfie for early UI feedback (Fitz display)
      const analyzeRes = await fetch("/api/analyzeImage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          notes: visitorQuestion || "",
        }),
      });

      const analyzeData = await analyzeRes.json().catch(() => ({}));
      if (!analyzeRes.ok) {
        throw new Error(analyzeData?.error || "Something went wrong while analyzing the image.");
      }

      localImageAnalysis = analyzeData;
      setImageAnalysis(analyzeData);

      if (analyzeData?.fitzpatrickType) {
        setFitzpatrickType(analyzeData.fitzpatrickType);
      }

      // Generate report (canonical endpoint)
      const response = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          email,
          ageRange,
          primaryConcern,
          visitorQuestion: visitorQuestion || null,
          photoDataUrl: imageBase64,          // ✅ mandatory
          imageAnalysis: localImageAnalysis,  // optional pass-through
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
      setFitzpatrickType(data.fitzpatrickType || fitzpatrickType || null);
      setFitzpatrickSummary(data.fitzpatrickSummary || null);
      setAgingPreviewImages(data.agingPreviewImages || null);
    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Something went wrong while generating the analysis letter.");
    } finally {
      setLoading(false);
    }
  }

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
        <h1 style={{ fontSize: "1.75rem", marginBottom: "4px", fontWeight: 600 }}>
          Personalized Skin Analysis
        </h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Upload your selfie and receive a full narrative letter from Dr. Lazuk via email.
        </p>

        <ImageUploader onImageSelected={setImageBase64} required />

        <FitzpatrickDetector type={fitzpatrickType} />

        <AnalysisForm
          values={form}
          onChange={setForm}
          onSubmit={handleGenerate}
          loading={loading}
        />

        {errorMsg && (
          <p style={{ marginTop: "16px", color: "#b00020", fontSize: "0.9rem" }}>
            {errorMsg}
          </p>
        )}

        {fitzpatrickSummary ? (
          <div
            style={{
              marginTop: "16px",
              border: "1px solid #FCD34D",
              background: "#FFFBEB",
              borderRadius: "10px",
              padding: "12px 14px",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "4px", color: "#92400E" }}>
              Fitzpatrick Skin Type (Cosmetic Estimate)
            </div>
            <div style={{ color: "#92400E", fontSize: "0.95rem" }}>
              {fitzpatrickType ? `Type ${fitzpatrickType}. ` : ""}
              {fitzpatrickSummary}
            </div>
          </div>
        ) : null}

        {/* Optional: show the aging images returned to the PAGE too */}
        {agingPreviewImages ? (
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>
              Your Skin’s Future Story — A Preview
            </div>
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
                  style={{ width: "100%", borderRadius: "10px", border: "1px solid #eee" }}
                />
              ) : null}
              {agingPreviewImages.noChange20 ? (
                <img
                  src={agingPreviewImages.noChange20}
                  alt="~20 years minimal skincare changes"
                  style={{ width: "100%", borderRadius: "10px", border: "1px solid #eee" }}
                />
              ) : null}
              {agingPreviewImages.withCare10 ? (
                <img
                  src={agingPreviewImages.withCare10}
                  alt="~10 years with consistent care"
                  style={{ width: "100%", borderRadius: "10px", border: "1px solid #eee" }}
                />
              ) : null}
              {agingPreviewImages.withCare20 ? (
                <img
                  src={agingPreviewImages.withCare20}
                  alt="~20 years with consistent care"
                  style={{ width: "100%", borderRadius: "10px", border: "1px solid #eee" }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <OutputCard title="Dr. Lazuk Letter" value={output} />
      </div>
    </div>
  );
}


