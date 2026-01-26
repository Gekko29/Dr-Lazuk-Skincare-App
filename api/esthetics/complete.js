// api/esthetics/complete.js
// Phase B2.1: Send client + provider emails for Esthetics Concierge
//
// Locked behaviors:
// - Consultation-first (no booking, no pricing quotes)
// - All Q/A + protocol summary emailed to provider
// - Client subject: "Your Curated Esthetics Protocol"
// - Provider recipient: contact@drlazuk.com (or RESEND_CLINIC_EMAIL)
// - From: no-reply@drlazuk.com (via RESEND_FROM_EMAIL)
// - No server-side storage: assemble → send → discard

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\'/g, "&#039;");
}

function safeLine(label, value) {
  const v = value == null || value === "" ? "—" : String(value);
  return `<div><b>${escapeHtml(label)}:</b> ${escapeHtml(v)}</div>`;
}

function listToHtml(items) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return "<div>—</div>";
  return `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

function blocksToHtml(blocks) {
  const arr = Array.isArray(blocks) ? blocks : [];
  if (!arr.length) return "<div>—</div>";
  return arr
    .map((b) => `<div style="margin: 8px 0;">• ${escapeHtml(b)}</div>`)
    .join("");
}

async function sendEmailWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  // locked defaults
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Lazuk Esthetics <no-reply@drlazuk.com>";
  const replyTo =
    process.env.RESEND_REPLY_TO || process.env.RESEND_CLINIC_EMAIL || "contact@drlazuk.com";

  if (!apiKey) {
    console.error("RESEND_API_KEY is not set; cannot send email.");
    return { ok: false, error: "missing_resend_api_key" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html,
        reply_to: replyTo, // so replies go to clinic inbox
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend email error:", res.status, body);
      return { ok: false, status: res.status, body };
    }

    return { ok: true };
  } catch (err) {
    console.error("Resend email exception:", err);
    return { ok: false, error: "resend_exception" };
  }
}

function buildClientEmailHtml(payload) {
  const user = payload.user || {};
  const firstName = user.firstName || "there";

  const protocolTitle =
    payload.protocolSummary?.title || "Your Curated Esthetics Protocol";

  const narrative =
    payload.protocolSummary?.narrative ||
    "Based on what you shared, this protocol was designed specifically for you to support your goals while prioritizing long-term skin and body health.";

  const nextSteps =
    Array.isArray(payload.nextSteps) && payload.nextSteps.length
      ? payload.nextSteps
      : [
          "Schedule a consultation so a provider can confirm the best treatment path for you.",
          "Complete the medical questionnaire we’ll send prior to your appointment (required).",
          "Bring up any additional concerns during your consultation—your plan can be refined in real time.",
        ];

  const deferred = Array.isArray(payload.deferredQuestions) ? payload.deferredQuestions : [];

  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.45; color: #111;">
    <h2 style="margin:0 0 8px 0;">${escapeHtml(protocolTitle)}</h2>

    <p style="margin:0 0 12px 0;">
      Hi ${escapeHtml(firstName)},<br/>
      ${escapeHtml(narrative)}
    </p>

    <h3 style="margin:18px 0 6px 0;">Your Focus</h3>
    ${listToHtml(payload.goals)}

    <h3 style="margin:18px 0 6px 0;">Key Constraints (what we respected)</h3>
    ${blocksToHtml(payload.constraints)}

    <h3 style="margin:18px 0 6px 0;">Recommended Treatment Path (consultation-first)</h3>
    ${blocksToHtml(payload.protocolSummary?.recommendedPath)}

    <h3 style="margin:18px 0 6px 0;">Next steps</h3>
    ${listToHtml(nextSteps)}

    ${
      deferred.length
        ? `<h3 style="margin:18px 0 6px 0;">Questions we’ll address in consultation</h3>${listToHtml(
            deferred
          )}`
        : ""
    }

    <p style="margin:18px 0 0 0; font-size: 13px; color:#333;">
      Pricing note: We understand you may want price guidance. Final pricing depends on the finalized treatment path after consultation, and we often have unpublished promotions that can be applied once your plan is confirmed.
    </p>

    <p style="margin:18px 0 0 0; font-size: 12px; color:#666;">
      Disclaimer: This concierge provides informational protocol suggestions and is not medical advice. Final treatment decisions are made with a provider during consultation.
    </p>
  </div>
  `;
}

function buildProviderEmailHtml(payload) {
  const user = payload.user || {};
  const protocolTitle =
    payload.protocolSummary?.title || "New Esthetics Protocol";

  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.45; color: #111;">
    <h2 style="margin:0 0 8px 0;">${escapeHtml(protocolTitle)}</h2>

    <h3 style="margin:18px 0 6px 0;">Client</h3>
    ${safeLine("Name", `${user.firstName || ""} ${user.lastName || ""}`.trim())}
    ${safeLine("Email", user.email)}
    ${safeLine("Phone", user.phone || "—")}

    <h3 style="margin:18px 0 6px 0;">Goals</h3>
    ${listToHtml(payload.goals)}

    <h3 style="margin:18px 0 6px 0;">Constraints</h3>
    ${blocksToHtml(payload.constraints)}

    <h3 style="margin:18px 0 6px 0;">Protocol Summary</h3>
    ${safeLine("Confidence", payload.confidence?.level || "—")}
    ${safeLine("Confidence notes", payload.confidence?.notes || "—")}

    <div style="margin-top:8px;">
      <b>Recommended Path:</b>
      ${blocksToHtml(payload.protocolSummary?.recommendedPath)}
    </div>

    <h3 style="margin:18px 0 6px 0;">Deferred questions (address in consult)</h3>
    ${listToHtml(payload.deferredQuestions)}

    <h3 style="margin:18px 0 6px 0;">Transcript</h3>
    <pre style="white-space: pre-wrap; background:#f7f7f7; padding:12px; border:1px solid #ddd; font-size:12px;">${escapeHtml(
      payload.transcript || "—"
    )}</pre>

    <h3 style="margin:18px 0 6px 0;">System Flags</h3>
    <pre style="white-space: pre-wrap; background:#f7f7f7; padding:12px; border:1px solid #ddd; font-size:12px;">${escapeHtml(
      JSON.stringify(payload.flags || {}, null, 2)
    )}</pre>
  </div>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const body = req.body || {};
    const user = body.user || {};

    const firstName = String(user.firstName || "").trim();
    const lastName = String(user.lastName || "").trim();
    const email = normEmail(user.email);

    if (!firstName || !lastName || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "invalid_user" });
    }

    const providerTo = process.env.RESEND_CLINIC_EMAIL || "contact@drlazuk.com";

    const clientSubject = "Your Curated Esthetics Protocol";
    const providerSubject = `New Esthetics Protocol – ${firstName} ${lastName}`;

    const payload = {
      user: {
        firstName,
        lastName,
        email,
        phone: user.phone ? String(user.phone).trim() : null,
      },
      goals: Array.isArray(body.goals) ? body.goals.map(String) : [],
      constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : [],
      deferredQuestions: Array.isArray(body.deferredQuestions)
        ? body.deferredQuestions.map(String)
        : [],
      protocolSummary: body.protocolSummary || {},
      confidence: body.confidence || {},
      transcript: String(body.transcript || ""),
      flags: body.flags || {},
      nextSteps: Array.isArray(body.nextSteps) ? body.nextSteps.map(String) : null,
    };

    const clientHtml = buildClientEmailHtml(payload);
    const providerHtml = buildProviderEmailHtml(payload);

    // Send provider + client
    const providerSend = await sendEmailWithResend({
      to: providerTo,
      subject: providerSubject,
      html: providerHtml,
    });

    const clientSend = await sendEmailWithResend({
      to: email,
      subject: clientSubject,
      html: clientHtml,
    });

    // If either fails, return a non-200 so the UI can show a real error
    if (!providerSend.ok || !clientSend.ok) {
      return res.status(502).json({
        ok: false,
        error: "email_send_failed",
        sent: {
          provider: providerSend.ok === true,
          client: clientSend.ok === true,
        },
        details: {
          provider: providerSend,
          client: clientSend,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      sent: { provider: true, client: true },
    });
  } catch (err) {
    console.error("esthetics/complete error:", err);
    return res.status(500).json({
      ok: false,
      error: "complete_failed",
      message: String(err?.message || "Unknown error"),
    });
  }
};
