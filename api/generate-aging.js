/**
 * api/generate-aging.js
 * Separate endpoint to generate 4 selfie-based aging preview images and email them to the user.
 * Purpose: avoid Vercel 300s timeout when aging image edits are bundled inside /api/generate-report.
 *
 * CommonJS / Vercel-safe.
 */
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = await readJson(req);
    const firstName = (body.firstName || "").trim();
    const email = (body.email || "").trim();
    const selfiePublicUrl = (body.selfiePublicUrl || "").trim();
    const photoDataUrl = (body.photoDataUrl || "").trim(); // optional fallback

    if (!firstName || !email) {
      res.status(400).json({ error: "firstName and email are required" });
      return;
    }
    if (!selfiePublicUrl && !photoDataUrl) {
      res.status(400).json({ error: "selfiePublicUrl or photoDataUrl is required" });
      return;
    }

    // Base image for edits: prefer already-public URL to avoid re-upload + payload bloat.
    const baseSelfie = selfiePublicUrl || photoDataUrl;

    // Generate 4 previews (10y/20y x no-change/with-care).
    const agingPreviewImages = await generateAgingPreviewImages(baseSelfie);

    // Build a minimal email focused only on the images + disclosures.
    const agingPreviewHtml = buildAgingPreviewHtml(agingPreviewImages);

    const subject = "Your Skin’s Future Story — Aging Preview Images";
    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111827;">
        <p style="font-size:13px; margin:0 0 10px;">Dear ${escapeHtml(firstName)},</p>
        <p style="font-size:12px; color:#374151; margin:0 0 14px;">
          Here are your AI-generated aging preview images. This is cosmetic education and entertainment only — not a medical diagnosis or prediction.
        </p>
        ${agingPreviewHtml || ""}
        <p style="font-size:11px; color:#6B7280; margin:16px 0 0;">
          If you have any questions, please reply to this email.
        </p>
        <p style="font-size:12px; margin:10px 0 0;">~ Dr. Lazuk</p>
      </div>
    `;

    await sendEmailWithResend({ to: email, subject, html });

    res.status(200).json({ ok: true, delivered: true });
  } catch (err) {
    console.error("generate-aging error:", err);
    res.status(500).json({ error: "Error generating aging images" });
  }
};

// -------------------------
// Small helpers
// -------------------------
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

function isDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:image/");
}

function looksEphemeralImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  // Heuristic: OpenAI image urls commonly expire; treat them as ephemeral.
  return (
    url.includes("oaidalleapiprod") ||
    url.includes("openai.com") ||
    url.includes("oaiusercontent") ||
    url.includes("gpt-image") ||
    url.includes("blob.core.windows.net")
  );
}

async function uploadToCloudinaryFile(fileStr) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  const form = new URLSearchParams();
  form.set("file", fileStr);

  const timestamp = Math.floor(Date.now() / 1000);
  form.set("timestamp", String(timestamp));
  form.set("folder", "drlazuk/visitor-selfies");

  const toSign = `folder=${form.get("folder")}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  form.set("api_key", apiKey);
  form.set("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const res = await fetch(endpoint, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    console.error("Cloudinary upload failed:", res.status, body);
    return null;
  }

  const json = await res.json().catch(() => null);
  return json?.secure_url || json?.url || null;
}

async function uploadToVercelBlobAny(input) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const { put } = await import("@vercel/blob");

    // If input is data URL, decode it
    if (isDataUrl(input)) {
      const parsed = parseDataUrl(input);
      if (!parsed) return null;

      const buf = Buffer.from(parsed.b64, "base64");
      const ext = parsed.mime.includes("png")
        ? "png"
        : parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")
        ? "jpg"
        : "img";

      const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const out = await put(filename, buf, {
        access: "public",
        contentType: parsed.mime,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return out?.url || null;
    }

    // If input is remote URL, fetch it then upload
    if (typeof input === "string" && /^https?:\/\//i.test(input)) {
      const res = await fetch(input);
      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") || "image/png";
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);

      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "img";

      const filename = `drlazuk/visitor-selfies/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const out = await put(filename, buf, {
        access: "public",
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return out?.url || null;
    }

    return null;
  } catch (err) {
    console.error("Vercel Blob upload failed:", err);
    return null;
  }
}

async function ensureStablePublicImageUrl(anyImage) {
  if (!anyImage) return null;

  // Already a non-data URL; stabilize if it looks ephemeral.
  if (typeof anyImage === "string" && !isDataUrl(anyImage)) {
    if (!looksEphemeralImageUrl(anyImage)) return anyImage;

    const viaCloudinary = await uploadToCloudinaryFile(anyImage);
    if (viaCloudinary) return viaCloudinary;

    const viaBlob = await uploadToVercelBlobAny(anyImage);
    if (viaBlob) return viaBlob;

    return anyImage;
  }

  // If data URL, upload
  if (isDataUrl(anyImage)) {
    const viaCloudinary = await uploadToCloudinaryFile(anyImage);
    if (viaCloudinary) return viaCloudinary;

    const viaBlob = await uploadToVercelBlobAny(anyImage);
    if (viaBlob) return viaBlob;

    return anyImage;
  }

  return null;
}

function buildAgingPreviewHtml(agingPreviewImages) {
  if (!agingPreviewImages) return "";

  const { noChange10, noChange20, withCare10, withCare20 } = agingPreviewImages || {};
  if (!noChange10 && !noChange20 && !withCare10 && !withCare20) return "";

  return `
    <div style="margin: 18px 0 18px 0; padding: 14px 14px 16px; border-radius: 10px; border: 1px solid #E5E7EB; background-color: #F9FAFB;">
      <h2 style="font-size: 15px; font-weight: 700; margin: 0 0 6px;">
        Your Skin’s Future Story — A Preview
      </h2>
      <p style="font-size: 12px; color: #4B5563; margin: 0 0 10px;">
        These images are AI-generated visualizations created for cosmetic education and entertainment only.
        They are not medical predictions and may not reflect your actual future appearance.
        Their purpose is simply to show how lifestyle and skincare choices might influence the overall impression of aging over time.
      </p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 8px;">
        ${
          noChange10
            ? `<div>
                <img src="${noChange10}" alt="Approximate 10-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~10 years – minimal skincare changes</p>
              </div>`
            : ""
        }

        ${
          noChange20
            ? `<div>
                <img src="${noChange20}" alt="Approximate 20-year future if routine does not change" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~20 years – minimal skincare changes</p>
              </div>`
            : ""
        }

        ${
          withCare10
            ? `<div>
                <img src="${withCare10}" alt="Approximate 10-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~10 years – with consistent care</p>
              </div>`
            : ""
        }

        ${
          withCare20
            ? `<div>
                <img src="${withCare20}" alt="Approximate 20-year future with consistent skincare" style="width: 100%; border-radius: 10px; border: 1px solid #E5E7EB;" />
                <p style="font-size: 11px; color: #4B5563; margin: 6px 0 0;">~20 years – with consistent care</p>
              </div>`
            : ""
        }
      </div>
    </div>
  `;
}

async function sendEmailWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Dr. Lazuk Esthetics <no-reply@drlazuk.com>";

  if (!apiKey) {
    console.error("RESEND_API_KEY is not set; skipping email send.");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend email error:", res.status, body);
    }
  } catch (err) {
    console.error("Resend email exception:", err);
  }
}

async function generateAgingPreviewImages({ ageRange, primaryConcern, fitzpatrickType, photoDataUrl }) {
  if (!process.env.OPENAI_API_KEY) {
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
  if (!photoDataUrl) {
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }

  const fitzText = fitzpatrickType
    ? `with Fitzpatrick type ${fitzpatrickType}`
    : "with a realistic skin tone and texture";

  const baseStyleNoChange =
    "ultra-realistic portrait, neutral expression, studio lighting, no makeup, no filters, no retouching, no beautification, no flattering bias, no skin smoothing, subtle signs of aging rendered honestly but respectfully, realistic pores and texture";
  const baseStyleWithCare =
    'ultra-realistic portrait, neutral expression, studio lighting, minimal/no makeup, no heavy filters, tasteful and slight "well-cared-for" bias allowed (subtle, not fake), realistic pores and texture, realistic aging but clearly supported by consistent skincare and sun protection (no plastic-smooth skin)';

  const prompts = {
    noChange10: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 10 years in the future if they do not meaningfully improve skincare — more pronounced fine lines, duller tone, more visible sun and lifestyle effects, still dignified and human. ${fitzText}. ${baseStyleNoChange}.`,
    noChange20: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 20 years in the future with minimal skincare support — deeper wrinkles, more sagging, more uneven pigment and sun markings, still dignified, no caricature. ${fitzText}. ${baseStyleNoChange}.`,
    withCare10: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 10 years in the future if they follow a gentle, consistent dermatologist-guided routine with sun protection — healthier glow, more even tone, refined texture, realistic aging but clearly well cared-for. ${fitzText}. ${baseStyleWithCare}.`,
    withCare20: `Using the SAME PERSON from the provided selfie (preserve identity, facial structure, ethnicity, and features), show them about 20 years in the future with consistent skincare, sun protection, and healthy lifestyle — naturally aged but radiant, balanced skin, softened lines, graceful aging, no unrealistic perfection. ${fitzText}. ${baseStyleWithCare}.`,
  };

  try {
    return await generateEditsFromSelfie({ photoDataUrl, prompts, size: "1024x1024" });
  } catch (err) {
    console.error("Error generating selfie-based aging preview images:", err);
    return { noChange10: null, noChange20: null, withCare10: null, withCare20: null };
  }
}
