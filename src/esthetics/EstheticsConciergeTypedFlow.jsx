import React, { useMemo, useState } from "react";
import { CONCIERGE_COPY, t } from "../lib/conciergeCopy"; // adjust path if needed

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function nowStamp() {
  const d = new Date();
  return d.toISOString();
}

export default function EstheticsConciergeTypedFlow({ user, flags }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // “Conversation” inputs (B2.1)
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [secondaryGoal, setSecondaryGoal] = useState("");
  const [constraints, setConstraints] = useState({
    noNeedles: false,
    noLaser: false,
    downtimeSensitive: false,
    timeLimited: false,
  });
  const [timeNotes, setTimeNotes] = useState("");
  const [questions, setQuestions] = useState("");

  // Mid-flow reassurance show-once
  const [showReassurance, setShowReassurance] = useState(false);

  const firstName = String(user?.firstName || "").trim();

  // Locked protocol placeholder (until your service intelligence engine is wired)
  const protocolSummary = useMemo(() => {
    const goals = [primaryGoal, secondaryGoal].filter(Boolean);
    const constraintsText = [];

    if (constraints.noNeedles) constraintsText.push("Avoid needles (client preference).");
    if (constraints.noLaser) constraintsText.push("Avoid laser treatments (hard constraint).");
    if (constraints.downtimeSensitive)
      constraintsText.push("Downtime-sensitive scheduling (timing matters).");
    if (constraints.timeLimited)
      constraintsText.push(`Limited availability: ${timeNotes || "time constraints noted"}.`);

    // “Supportive additions” phrasing (locked)
    const recommendedPath = [
      "Consultation-first curated plan (final path confirmed with provider).",
      "Supportive additions may be included based on tolerance and timing.",
    ];

    return {
      title: "Your Curated Esthetics Protocol",
      narrative:
        "Based on what you shared, this protocol was designed specifically for you to address your goals while supporting long-term skin and body health.",
      recommendedPath,
      goals,
      constraintsText,
    };
  }, [primaryGoal, secondaryGoal, constraints, timeNotes]);

  const canSubmit = useMemo(() => {
    return (
      user?.firstName &&
      user?.lastName &&
      normEmail(user?.email).includes("@") &&
      String(primaryGoal).trim().length >= 3
    );
  }, [user, primaryGoal]);

  const buildPayload = () => {
    const goals = [primaryGoal, secondaryGoal].filter(Boolean).map((x) => String(x).trim());

    const constraintsText = [];
    if (constraints.noNeedles) constraintsText.push("Avoid needles (client preference).");
    if (constraints.noLaser) constraintsText.push("Avoid laser treatments (hard constraint).");
    if (constraints.downtimeSensitive)
      constraintsText.push("Downtime-sensitive scheduling (timing matters).");
    if (constraints.timeLimited)
      constraintsText.push(`Limited availability: ${String(timeNotes || "").trim() || "Noted"}.`);

    const deferredQuestions = String(questions || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    // Transcript (typed) — simple but complete for provider
    const transcript =
      `Lazuk Esthetics AI Concierge — Typed Conversation Transcript\n` +
      `Timestamp: ${nowStamp()}\n\n` +
      `Client Goals:\n- Primary: ${primaryGoal}\n- Secondary: ${secondaryGoal || "—"}\n\n` +
      `Constraints:\n${constraintsText.map((c) => `- ${c}`).join("\n") || "- —"}\n\n` +
      `Client Questions / Concerns (defer to consultation):\n${
        deferredQuestions.map((q) => `- ${q}`).join("\n") || "- —"
      }\n`;

    // Confidence (locked concept: based on self-reported info)
    const confidence = {
      level: "Medium",
      notes:
        "Protocol built from self-reported goals and constraints; final suitability confirmed in consultation.",
    };

    return {
      user: {
        firstName: String(user.firstName || "").trim(),
        lastName: String(user.lastName || "").trim(),
        email: normEmail(user.email),
        phone: user.phone ? String(user.phone).trim() : null,
      },
      goals,
      constraints: constraintsText,
      deferredQuestions,
      protocolSummary: {
        title: protocolSummary.title,
        narrative: protocolSummary.narrative,
        recommendedPath: protocolSummary.recommendedPath,
      },
      confidence,
      transcript,
      flags: flags || {},
    };
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const payload = buildPayload();

      const res = await fetch("/api/esthetics/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Unable to send emails. Please try again.");
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper: show mid-flow reassurance once the user begins meaningful input
  const onPrimaryChange = (val) => {
    setPrimaryGoal(val);
    if (!showReassurance && String(val || "").trim().length >= 3) setShowReassurance(true);
  };

  if (done) {
    return (
      <div className="mt-6 bg-white border border-gray-200 p-6">
        <h2 className="text-lg font-bold">Your protocol is ready</h2>

        <div className="mt-3 whitespace-pre-wrap text-sm text-gray-800">
          {t(CONCIERGE_COPY.closing.recapIntro, { firstName })}
        </div>

        <div className="mt-3 whitespace-pre-wrap text-sm text-gray-800">
          {CONCIERGE_COPY.closing.consultHandoff}
        </div>

        <div className="mt-3 whitespace-pre-wrap text-sm text-gray-800">
          {CONCIERGE_COPY.closing.nextStepQuestion}
        </div>

        <div className="mt-3 text-sm text-gray-800">
          {t(CONCIERGE_COPY.closing.finalThanks, { firstName })}
        </div>

        <p className="mt-4 text-sm text-gray-700">
          Your curated protocol (and the conversation details) have been emailed to you and our team.
        </p>

        <div className="mt-4 flex gap-3">
          <a
            className="bg-gray-900 text-white px-5 py-3 font-bold hover:bg-gray-800"
            href="mailto:contact@drlazuk.com?subject=Esthetics%20Consultation%20Request"
          >
            Email Us
          </a>
          <button
            type="button"
            className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 px-5 py-3 font-bold"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-600">
          Reminder: A medical questionnaire will be required before the consultation appointment.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-white border border-gray-200 p-6">
      <div className="text-sm font-semibold text-gray-500">{CONCIERGE_COPY.brand.suiteName}</div>
      <h2 className="mt-2 text-lg font-bold">Quick conversation (typed)</h2>

      {/* Locked opening narrative + first live question */}
      <div className="mt-3 bg-gray-50 border border-gray-200 p-4">
        <div className="whitespace-pre-wrap text-sm text-gray-800">
          {t(CONCIERGE_COPY.opening.systemIntro, { firstName })}
        </div>
        <div className="mt-3 text-sm font-semibold text-gray-900">
          {CONCIERGE_COPY.opening.firstLiveQuestion}
        </div>
      </div>

      {/* Mid-flow reassurance (show once after user starts) */}
      {showReassurance ? (
        <div className="mt-4 bg-white border border-gray-200 p-4">
          <div className="whitespace-pre-wrap text-sm text-gray-800">
            {CONCIERGE_COPY.midFlow.reassurance}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-gray-700">
        This is a typed fallback to validate the email pipeline. Voice will be added in Phase B2.2.
      </p>

      <div className="mt-5">
        <label className="text-xs font-semibold text-gray-600">Primary goal</label>
        <input
          className="mt-1 w-full border border-gray-300 p-3"
          value={primaryGoal}
          onChange={(e) => onPrimaryChange(e.target.value)}
          placeholder="e.g., look younger, improve texture, reduce redness, body contouring, recovery"
        />
      </div>

      <div className="mt-3">
        <label className="text-xs font-semibold text-gray-600">Secondary goal (optional)</label>
        <input
          className="mt-1 w-full border border-gray-300 p-3"
          value={secondaryGoal}
          onChange={(e) => setSecondaryGoal(e.target.value)}
          placeholder="e.g., stress relief, circulation support, immune support"
        />
      </div>

      <div className="mt-5 bg-gray-50 border border-gray-200 p-4">
        <div className="text-sm font-bold text-gray-900">Constraints</div>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={constraints.noNeedles}
            onChange={(e) => setConstraints((s) => ({ ...s, noNeedles: e.target.checked }))}
          />
          Avoid needles
        </label>

        <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={constraints.noLaser}
            onChange={(e) => setConstraints((s) => ({ ...s, noLaser: e.target.checked }))}
          />
          Avoid laser treatments
        </label>

        <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={constraints.downtimeSensitive}
            onChange={(e) => setConstraints((s) => ({ ...s, downtimeSensitive: e.target.checked }))}
          />
          Downtime-sensitive (timing matters)
        </label>

        <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={constraints.timeLimited}
            onChange={(e) => setConstraints((s) => ({ ...s, timeLimited: e.target.checked }))}
          />
          Limited availability
        </label>

        {constraints.timeLimited && (
          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-600">Timing notes</label>
            <input
              className="mt-1 w-full border border-gray-300 p-3"
              value={timeNotes}
              onChange={(e) => setTimeNotes(e.target.value)}
              placeholder="e.g., weekday mornings only, Saturdays only, 1 hour per week"
            />
          </div>
        )}
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold text-gray-600">
          Questions / concerns (one per line — will be addressed in consultation)
        </label>
        <textarea
          className="mt-1 w-full border border-gray-300 p-3"
          rows={5}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          placeholder={"Pricing?\nDowntime?\nNeedle alternatives?\nTimeline?"}
        />
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || submitting}
        className={`mt-5 w-full py-3 font-bold ${
          !canSubmit || submitting
            ? "bg-gray-300 text-gray-600 cursor-not-allowed"
            : "bg-gray-900 text-white hover:bg-gray-800"
        }`}
      >
        {submitting ? "Sending..." : "Send My Protocol (Email)"}
      </button>

      <p className="mt-3 text-xs text-gray-600">
        {CONCIERGE_COPY.disclaimers.short}
      </p>
    </div>
  );
}

