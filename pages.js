// pages/index.js
// Simple UI for:
// 1) Generating the personalized Dr. Lazuk analysis letter
// 2) Asking Dr. Lazuk questions via Q&A mode

import { useState } from "react";

export default function HomePage() {
  const [mode, setMode] = useState("analysis"); // "analysis" or "qa"

  // Analysis state
  const [complimentFeatures, setComplimentFeatures] = useState("");
  const [skinFindings, setSkinFindings] = useState("");
  const [texture, setTexture] = useState("");
  const [poreBehavior, setPoreBehavior] = useState("");
  const [pigment, setPigment] = useState("");
  const [fineLinesAreas, setFineLinesAreas] = useState("");
  const [elasticity, setElasticity] = useState("");
  const [eveningActive, setEveningActive] = useState("");
  const [estheticRecommendations, setEstheticRecommendations] = useState("");

  // Q&A state
  const [question, setQuestion] = useState("");

  // Shared state
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGenerateAnalysis(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setOutput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analysis",
          analysis: {
            complimentFeatures,
            skinFindings,
            texture,
            poreBehavior,
            pigment,
            fineLinesAreas,
            elasticity,
            eveningActive,
            estheticRecommendations,
          },
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
        err.message || "Something went wrong while generating the analysis."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAskQuestion(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setOutput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "qa",
          question,
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
        err.message || "Something went wrong while asking Dr. Lazuk."
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
          Dr. Lazuk Skincare App
        </h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Generate a personalized skin analysis letter or ask Dr. Lazuk a
          skincare question.
        </p>

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "24px",
            borderRadius: "999px",
            background: "#f2ecec",
            padding: "4px",
          }}
        >
          <button
            type="button"
            onClick={() => setMode("analysis")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              background: mode === "analysis" ? "#ffffff" : "transparent",
              boxShadow:
                mode === "analysis"
                  ? "0 4px 10px rgba(0,0,0,0.06)"
                  : "none",
            }}
          >
            Personalized Analysis Letter
          </button>
          <button
            type="button"
            onClick={() => setMode("qa")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              background: mode === "qa" ? "#ffffff" : "transparent",
              boxShadow:
                mode === "qa" ? "0 4px 10px rgba(0,0,0,0.06)" : "none",
            }}
          >
            Ask Dr. Lazuk a Question
          </button>
        </div>

        {/* Forms */}
        {mode === "analysis" ? (
          <form onSubmit={handleGenerateAnalysis}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
              Personalized Analysis Inputs
            </h2>
            <p style={{ color: "#777", marginBottom: "16px" }}>
              In production, these values will come from your image and skin
              analysis pipeline. For now, you can test by typing phrases below.
            </p>

            <LabelInput
              label="Compliment features"
              value={complimentFeatures}
              onChange={setComplimentFeatures}
              placeholder="e.g. the way your bright blue eyes catch the light feels so open and confident"
            />
            <LabelInput
              label="Skin findings (overall)"
              value={skinFindings}
              onChange={setSkinFindings}
              placeholder="e.g. gentle signs of dehydration, a bit of uneven tone, and early expression lines"
            />
            <LabelInput
              label="Texture description"
              value={texture}
              onChange={setTexture}
              placeholder="e.g. a few areas of mild roughness suggesting your barrier needs more hydration"
            />
            <LabelInput
              label="Pore behavior"
              value={poreBehavior}
              onChange={setPoreBehavior}
              placeholder="e.g. pores slightly more visible in the T-zone when stressed or tired"
            />
            <LabelInput
              label="Pigment description"
              value={pigment}
              onChange={setPigment}
              placeholder="e.g. soft sun-related pigment lingering on the cheeks and forehead"
            />
            <LabelInput
              label="Fine lines areas"
              value={fineLinesAreas}
              onChange={setFineLinesAreas}
              placeholder="e.g. around your eyes and gently across your forehead"
            />
            <LabelInput
              label="Elasticity findings"
              value={elasticity}
              onChange={setElasticity}
              placeholder="e.g. a slight softening of firmness around the lower face"
            />
            <LabelInput
              label="Evening active recommendation"
              value={eveningActive}
              onChange={setEveningActive}
              placeholder="e.g. a low-strength retinoid three nights a week, alternating with barrier-repair nights"
            />
            <LabelInput
              label="Esthetic treatment recommendations"
              value={estheticRecommendations}
              onChange={setEstheticRecommendations}
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
        ) : (
          <form onSubmit={handleAskQuestion}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>
              Ask Dr. Lazuk a Skincare Question
            </h2>
            <p style={{ color: "#777", marginBottom: "16px" }}>
              Type your question below. You’ll receive a warm, personalized
              response in her voice.
            </p>

            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  display: "block",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}
              >
                Your question
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                placeholder="e.g. My skin is oily but sensitive. How should I cleanse without stripping it?"
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !question.trim()}
              style={{
                marginTop: "8px",
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
              {loading ? "Asking..." : "Ask Dr. Lazuk"}
            </button>
          </form>
        )}

        {/* Error + Output */}
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

        <div style={{ marginTop: "24px" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>Output</h3>
          <textarea
            readOnly
            value={output}
            rows={12}
            placeholder="Your personalized Dr. Lazuk message will appear here..."
            style={{
              width: "100%",
              resize: "vertical",
              padding: "8px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              fontFamily: "inherit",
              whiteSpace: "pre-wrap",
            }}
          />
        </div>
      </div>
    </div>
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
        onChange={(e) => onChange(e.target.value)}
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
