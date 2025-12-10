// api/ask.js
// Dedicated page for the Ask-Dr-Lazuk Q&A feature.

import { useState } from "react";
import { QAForm } from "../components/QAForm";
import { OutputCard } from "../components/OutputCard";

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleAsk(e) {
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
          Ask Dr. Lazuk
        </h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Ask any skincare or esthetic question and receive a personalized
          response in Dr. Lazuk’s voice.
        </p>

        <QAForm
          question={question}
          onChange={setQuestion}
          onSubmit={handleAsk}
          loading={loading}
        />

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

        <OutputCard title="Dr. Lazuk's Answer" value={output} />
      </div>
    </div>
  );
}
