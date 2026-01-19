// api/generate-aging.js
// SINGLE-TILE — Dr. Lazuk Aging Preview Generator (Vercel-safe CJS)
//
// Purpose:
// - Generate ONE aging preview image (single tile) to be rendered in the visual report UI.
// - Avoid timeouts by doing ONE OpenAI images.edits call (not 4).
// - Upload resulting tile to Cloudinary and return the URL.
// - Optional: send a Resend email with the single tile (sendEmail: true).
//
// Accepts POST body:
// {
//   firstName: "Mark",
//   email: "askatec@gmail.com",
//   selfiePublicUrl: "https://...jpg",   // preferred
//   photoDataUrl: "data:image/jpeg;base64,...", // optional fallback if public url is not provided
//   sendEmail: false                      // optional
// }

const OpenAI = require("openai");
const crypto = require("crypto");
const { File } = require("node:buffer");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getEnv(name, required = true) {
  const v = process.env[name];
  if (required && (!v || typeof v !== "string" || !v.trim())) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function safeTrim(s, max = 200) {
  if (!s || typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseDataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1] || "image/jpeg";
  const b64 = m[2];
  return { mime, buffer: Buffer.from(b64, "base64") };
}

async function fetchUrlAsBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch selfie URL (${resp.status})`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function uploadBufferToCloudinary(buffer, folder, publicIdPrefix, mimeType = "image/jpeg") {
  const cloudName = getEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = getEnv("CLOUDINARY_API_KEY");
  const apiSecret = getEnv("CLOUDINARY_API_SECRET");

  const boundary = `----formdata-${crypto.randomBytes(16).toString("hex")}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${publicIdPrefix}_${crypto.randomBytes(6).toString("hex")}`;

  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const formParts = [];
  const pushField = (name, value) => {
    formParts.push(Buffer.from(`--${boundary}\r\n`));
    formParts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    formParts.push(Buffer.from(String(value)));
    formParts.push(Buffer.from(`\r\n`));
  };

  // file
  formParts.push(Buffer.from(`--${boundary}\r\n`));
  formParts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${publicId}.jpg"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  );
  formParts.push(buffer);
  formParts.push(Buffer.from(`\r\n`));

  pushField("api_key", apiKey);
  pushField("timestamp", timestamp);
  pushField("folder", folder);
  pushField("public_id", publicId);
  pushField("signature", signature);

  formParts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(formParts);
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });

  const out = await resp.json();
  if (!resp.ok) {
    throw new Error(`Cloudinary upload failed: ${out?.error?.message || resp.statusText}`);
  }
  return out.secure_url;
}

async function generateSingleTileFromSelfieBytes(openai, selfieBytes) {
  // Single call. Prompt requests ONE 1024x1024 collage (2x2 grid) with subtle labels.
  const prompt = [
    "Create ONE single 1024x1024 image as a clean 2x2 collage (four quadrants) using the exact uploaded person.",
    "Keep facial identity identical and photorealistic. Natural lighting. Do not exaggerate.",
    "",
    "Quadrants (include small, subtle labels in each corner):",
    "Top-left: '10Y — No Change' realistic age progression 10 years with minimal skincare.",
    "Top-right: '20Y — No Change' realistic age progression 20 years with minimal skincare.",
    "Bottom-left: '10Y — With Care' realistic age progression 10 years assuming consistent high-quality skincare and sun protection.",
    "Bottom-right: '20Y — With Care' realistic age progression 20 years assuming consistent high-quality skincare and sun protection.",
    "",
    "Important: This must be ONE image file (a collage), not four separate images.",
    "No horror, no shock value, no extreme wrinkles. Subtle, believable changes only.",
  ].join("\n");

  const file = new File([selfieBytes], "selfie.jpg", { type: "image/jpeg" });

  const result = await openai.images.edits({
    model: "gpt-image-1",
    image: file,
    prompt,
    size: "1024x1024",
  });

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from OpenAI images.edits");
  return Buffer.from(b64, "base64");
}

function buildSingleTileEmailHtml({ firstName, selfieUrl, tileUrl }) {
  const safeName = safeTrim(firstName, 40) || "there";
  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; line-height:1.45; max-width: 720px; margin: 0 auto;">
    <h1 style="font-size: 18px; margin: 0 0 8px;">Dear ${safeName},</h1>
    <p style="font-size: 13px; margin: 0 0 14px; color:#374151;">
      Here is your aging preview tile. This is a visual simulation—not a prediction—and is meant to support insight, not fear.
    </p>

    <div style="margin: 0 0 14px; padding: 12px; border: 1px solid #E5E7EB; border-radius: 12px; background: #F9FAFB;">
      <div style="font-size: 12px; font-weight: 700; margin-bottom: 8px;">Your original selfie</div>
      <img src="${selfieUrl}" alt="Selfie" style="width: 100%; height: auto; display:block; border-radius: 12px;" />
    </div>

    <div style="margin: 0 0 14px; padding: 12px; border: 1px solid #E5E7EB; border-radius: 12px; background: #FFFFFF;">
      <div style="font-size: 12px; font-weight: 700; margin-bottom: 8px;">Your Aging Preview — Single Tile</div>
      <img src="${tileUrl}" alt="Aging preview tile" style="width: 100%; height: auto; display:block; border-radius: 12px;" />
    </div>

    <p style="font-size: 12px; color:#6B7280; margin: 0;">
      For higher confidence previews, retake your selfie with even lighting, a front-facing angle, and your full face visible.
    </p>

    <p style="font-size: 13px; margin: 16px 0 0;">
      May your skin glow as bright as your smile.<br/>
      <span style="font-weight:700;">~ Dr. Lazuk</span>
    </p>
  </div>
  `;
}

async function sendResendEmail({ to, from, subject, html }) {
  const apiKey = getEnv("RESEND_API_KEY");
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const out = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Resend send failed: ${out?.message || out?.error || resp.statusText}`);
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const body = await readJsonBody(req);

    const firstName = safeTrim(body?.firstName, 80);
    const email = safeTrim(body?.email, 320);
    const selfiePublicUrl = body?.selfiePublicUrl && typeof body.selfiePublicUrl === "string" ? body.selfiePublicUrl : null;
    const photoDataUrl = body?.photoDataUrl && typeof body.photoDataUrl === "string" ? body.photoDataUrl : null;
    const sendEmail = Boolean(body?.sendEmail);

    if (sendEmail) {
      if (!email || !email.includes("@")) {
        return json(res, 400, { ok: false, error: "bad_request", message: "Valid email required when sendEmail=true." });
      }
    }

    if (!selfiePublicUrl && !photoDataUrl) {
      return json(res, 400, {
        ok: false,
        error: "bad_request",
        message: "Provide selfiePublicUrl (preferred) or photoDataUrl.",
      });
    }

    // Get selfie bytes
    let selfieBytes = null;
    let selfieUrlForEmail = selfiePublicUrl;

    if (selfiePublicUrl) {
      selfieBytes = await fetchUrlAsBytes(selfiePublicUrl);
    } else {
      const parsed = parseDataUrlToBuffer(photoDataUrl);
      if (!parsed?.buffer) {
        return json(res, 400, { ok: false, error: "bad_request", message: "Invalid photoDataUrl." });
      }
      selfieBytes = parsed.buffer;

      // Upload selfie to Cloudinary to get a stable URL for email/rendering if needed
      // (keeps UI consistent and avoids passing large dataURLs around)
      selfieUrlForEmail = await uploadBufferToCloudinary(
        selfieBytes,
        "drlazuk/visitor-selfies",
        "visitor-selfie",
        parsed.mime || "image/jpeg"
      );
    }

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });

    // Generate ONE tile and upload once
    const tileBytes = await generateSingleTileFromSelfieBytes(openai, selfieBytes);
    const tileUrl = await uploadBufferToCloudinary(tileBytes, "drlazuk/aging-previews", "aging-tile", "image/jpeg");

    // Optional email send (single tile)
    if (sendEmail) {
      const from =
        getEnv("RESEND_FROM_EMAIL", false) ||
        getEnv("EMAIL_FROM", false) ||
        "Dr. Lazuk <noreply@drlazuk.com>";

      const html = buildSingleTileEmailHtml({
        firstName,
        selfieUrl: selfieUrlForEmail,
        tileUrl,
      });

      await sendResendEmail({
        from,
        to: email,
        subject: "Your Aging Preview — Dr. Lazuk",
        html,
      });
    }

    return json(res, 200, {
      ok: true,
      selfiePublicUrl: selfieUrlForEmail,
      agingPreviewImageUrl: tileUrl,
    });
  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: "aging_generation_failed",
      message: err?.message || "Aging generation failed.",
    });
  }
};
