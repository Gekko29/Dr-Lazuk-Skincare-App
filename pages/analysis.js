// pages/analysis.js
// Dedicated page for the personalized analysis letter flow.

import { useState } from "react";
import { AnalysisForm } from "../components/AnalysisForm";
import { OutputCard } from "../components/OutputCard";
import { ImageUploader } from "../components/ImageUploader";
import { FitzpatrickDetector } from "../components/FitzpatrickDetector";

export default function AnalysisPage() {
  const [analysisValues, setAnalysisValues] = useState({
    complimentFeatures: "",
    skinFindings: "",
    texture: "",
    poreBehavior: "",
    pigment: "",
    fineLinesAreas: "",
    elasticity: "",
    eveningActive: "",
    estheticRecommendations: "",
  });

  const [imageBase64, setImageBase64] = useState(null);
  const [fitzpatrickType, setFitzpatrickType] = useState(null);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGenerate(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setOutput("");

    try {
      let mergedAnalysis = { ...analysisValues };

      if (imageBase64) {
        const analyzeRes = await fetch("/api/analyzeImage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            notes: "", // optional: you can later send descriptive notes from frontend
          }),
        });
        const analyzeData = await analyzeRes.json();
        if (analyzeRes.ok && analyzeData.analysis) {
          mergedAnalysis = {
            ...mergedAnalysis,
            ...analyzeData.analysis,
          };
          setAnalysisValues((prev) => ({ ...prev, ...analyzeData.analysis }));

          if (analyzeData.fitzpatrickType) {
            setFitzpatrickType(analyzeData.fitzpatrickType);
          }
        } else if (!analyzeRes.ok) {
          throw new Error(analyzeData.error || "Image analysis failed.");
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analysis",
          analysis: mergedAnalysis,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unexpected error");
      }
      setOutput(data.output || "");
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.message ||
          "Something went wrong while generating the analysis letter."
      );
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
        <h1
          style={{
            fontSize: "1.75rem",
            marginBottom: "4px",
            fontWeight: 600,
          }}
        >
          Personalized Skin Analysis
        </h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Upload a photo (optional), let the system estimate your Fitzpatrick
          type, fine-tune the analysis fields, and generate a full Dr. Lazuk
          letter.
        </p>

        <ImageUploader onImageSelected={setImageBase64} />

        {/* Fitzpatrick autodetection UI */}
        <FitzpatrickDetector type={fitzpatrickType} />

        <div style={{ marginTop: "20px" }}>
          <AnalysisForm
            values={analysisValues}
            onChange={setAnalysisValues}
            onSubmit={handleGenerate}
            loading={loading}
          />
        </div>

        {errorMsg && (
          <p
            style={{
              marginTop: "16px",
              color: "#b00020",
              fontSize: "0.9rem",
            }}
          >
            {errorMsg}
          </p>
        )}

        <OutputCard title="Dr. Lazuk Letter" value={output} />
      </div>
    </div>
  );
}

