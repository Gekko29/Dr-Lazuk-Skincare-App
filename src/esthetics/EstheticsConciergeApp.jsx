import React, { useMemo, useState } from "react";
import EstheticsConciergeTypedFlow from "./EstheticsConciergeTypedFlow";

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

export default function EstheticsConciergeApp() {
  const [stage, setStage] = useState("intake"); // intake | gated | blocked | error
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [gateResult, setGateResult] = useState(null);

  // ✅ B2.1 wiring
  const [user, setUser] = useState(null);
  const [flags, setFlags] = useState(null);

  const canSubmit = useMemo(() => {
    return (
      String(firstName).trim().length >= 1 &&
      String(lastName).trim().length >= 1 &&
      normalizeEmail(email).includes("@")
    );
  }, [firstName, lastName, email]);

  const start = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setGateResult(null);

    try {
      const payload = {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalizeEmail(email),
        phone: String(phone || "").trim() || null,
      };

      const res = await fetch("/api/esthetics/start-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      setGateResult(data);

      // ✅ Store user + flags for B2.1 (typed flow → /api/esthetics/complete)
      // Supports both response shapes:
      // - Preferred: { ok:true, user:{...}, flags:{...} }
      // - Older: { ok:true, flags:{...} } (we fall back to intake payload for user)
      if (res.ok && data?.ok) {
        const resolvedUser = data?.user || {
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          phone: payload.phone,
        };

        setUser(resolvedUser);
        setFlags(data?.flags || null);

        setStage("gated");
      } else {
        setStage("blocked");
      }
    } catch (e) {
      setGateResult({ ok: false, error: "network_error" });
      setStage("error");
    } finally {
      setLoading(false);
    }
  };

  const blockedMessage = () => {
    const err = gateResult?.error;
    if (err === "outside_service_area") {
      return "This experience is currently limited to the Atlanta metro area.";
    }
    if (err === "rate_limited") {
      return "You’ve reached the limit of 2 runs within 24 hours for this email/IP.";
    }
    if (err === "geo_unavailable") {
      return "We couldn’t confirm your location right now. Please try again later.";
    }
    if (err === "invalid_input") {
      return "Please check your information and try again.";
    }
    return "Please try again.";
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="bg-white border border-gray-200 p-6">
          <div className="text-sm font-semibold text-gray-500">Lazuk Esthetics</div>
          <h1 className="mt-2 text-2xl font-extrabold">AI Concierge — Esthetic Protocols</h1>
          <p className="mt-2 text-sm text-gray-700">
            Based on what you share, we’ll curate a consultation-first protocol recommendation and send
            it to you and our team.
          </p>
          <p className="mt-3 text-xs text-gray-600">
            Note: This does not book procedures. Everything is reviewed with a provider during consultation.
          </p>
        </div>

        {stage === "intake" && (
          <div className="mt-6 bg-white border border-gray-200 p-6">
            <h2 className="text-lg font-bold">Let’s get started</h2>
            <p className="mt-1 text-sm text-gray-700">
              Please enter your contact info so we can send your curated protocol after the conversation.
            </p>

            <div className="mt-5 grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">First name</label>
                <input
                  className="mt-1 w-full border border-gray-300 p-3"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">Last name</label>
                <input
                  className="mt-1 w-full border border-gray-300 p-3"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Email</label>
                <input
                  className="mt-1 w-full border border-gray-300 p-3"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Phone (optional)</label>
                <input
                  className="mt-1 w-full border border-gray-300 p-3"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(optional)"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={start}
              disabled={!canSubmit || loading}
              className={`mt-5 w-full py-3 font-bold ${
                !canSubmit || loading
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              }`}
            >
              {loading ? "Checking eligibility..." : "Let’s Get Started"}
            </button>

            <p className="mt-3 text-xs text-gray-600">
              Availability is currently limited to the Atlanta metro area.
            </p>
          </div>
        )}

        {stage === "gated" && (
          <div className="mt-6">
            <div className="bg-white border border-gray-200 p-6">
              <h2 className="text-lg font-bold">You’re eligible to continue</h2>
              <p className="mt-1 text-sm text-gray-700">
                Phase B1 is complete (route + gates). Phase B2 will enable realtime voice.
              </p>

              <div className="mt-4 bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Locked settings</div>
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>Geo: within 20 miles of ZIP 30004</li>
                  <li>Rate limit: 2 uses per 24 hours (email + IP)</li>
                  <li>Emails: client + provider via Resend</li>
                  <li>Voice persona: female British (Phase B2)</li>
                  <li>Session cap: 12 minutes (Phase B2)</li>
                </ul>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => window.location.assign("/")}
                  className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 px-5 py-3 font-bold"
                >
                  Back to Skincare App
                </button>

                <button
                  type="button"
                  disabled
                  className="bg-gray-300 text-gray-600 px-5 py-3 font-bold cursor-not-allowed"
                  title="Phase B2 will enable this"
                >
                  Start Voice (Phase B2)
                </button>
              </div>
            </div>

            {/* ✅ B2.1 typed conversation flow (emails + transcript) */}
            <EstheticsConciergeTypedFlow user={user} flags={flags || gateResult?.flags || null} />
          </div>
        )}

        {(stage === "blocked" || stage === "error") && (
          <div className="mt-6 bg-white border border-gray-200 p-6">
            <h2 className="text-lg font-bold">We can’t start right now</h2>
            <p className="mt-1 text-sm text-gray-700">{blockedMessage()}</p>

            {gateResult?.details?.retryAfterSeconds ? (
              <p className="mt-2 text-xs text-gray-600">
                Retry after: ~{gateResult.details.retryAfterSeconds}s
              </p>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setStage("intake")}
                className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 px-5 py-3 font-bold"
              >
                Try Again
              </button>

              <a
                className="bg-gray-900 text-white px-5 py-3 font-bold hover:bg-gray-800"
                href="mailto:contact@drlazuk.com?subject=Esthetics%20Consultation%20Request"
              >
                Email Us
              </a>
            </div>
          </div>
        )}

        <div className="mt-8 text-xs text-gray-600">
          Disclosures: This concierge provides informational protocol suggestions and is not medical advice.
          Final treatment paths are confirmed in consultation. A medical questionnaire will be required before the appointment.
        </div>
      </div>
    </div>
  );
}

