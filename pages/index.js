// pages/index.js (example snippet inside your component)
import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#faf7f7",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
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
        <h1 style={{ fontSize: "2rem", marginBottom: "8px", fontWeight: 600 }}>
          Dr. Lazuk Skincare App
        </h1>
        <p style={{ color: "#666", marginBottom: "24px" }}>
          Choose how you’d like Dr. Lazuk to support you today.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
          }}
        >
          <Link href="/analysis">
            <div
              style={{
                padding: "18px",
                borderRadius: "14px",
                border: "1px solid #eee",
                cursor: "pointer",
              }}
            >
              <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>
                Visual Skin Analysis
              </h2>
              <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>
                Receive a full narrative letter from Dr. Lazuk based on your
                skin’s current story and long-term glow plan.
              </p>
            </div>
          </Link>

          <Link href="/ask">
            <div
              style={{
                padding: "18px",
                borderRadius: "14px",
                border: "1px solid #eee",
                cursor: "pointer",
              }}
            >
              <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>
                Ask Dr. Lazuk Anything
              </h2>
              <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>
                Ask a skincare or esthetic question and get a warm, personalized
                response in her voice.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
