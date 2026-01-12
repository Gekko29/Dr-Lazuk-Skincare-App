// api/generate-aging.js
// WOW FINAL — Dr. Lazuk Aging Preview Generator (Vercel-safe CJS)
//
// Two-email flow:
// 1) /api/generate-report sends the main report email immediately.
// 2) The client calls this endpoint to generate the 4 aging previews and email them.
//
// This keeps /api/generate-report responsive while aging previews render separately.

const { Resend } = require('resend');
const OpenAI = require('openai');
const crypto = require('crypto');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getEnv(name, required = true) {
  const v = process.env[name];
  if (required && (!v || typeof v !== 'string' || !v.trim())) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function safeTrim(s, max = 200) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().slice(0, max);
}

function buildAgingOnlyEmailHtml({ firstName, selfieUrl, agingImages }) {
  const safeName = safeTrim(firstName, 40) || 'there';

  const card = (title, url) => `
    <div style="flex: 1; min-width: 240px; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; background: #FFFFFF;">
      <div style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #111827; border-bottom: 1px solid #E5E7EB; background: #F9FAFB;">
        ${title}
      </div>
      <div style="padding: 10px;">
        <img src="${url}" alt="${title}" style="width: 100%; height: auto; display: block; border-radius: 10px;" />
      </div>
    </div>
  `;

  const { noChange10, noChange20, withCare10, withCare20 } = agingImages || {};

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111827; line-height:1.45; max-width: 720px; margin: 0 auto;">
    <h1 style="font-size: 18px; margin: 0 0 8px;">Dear ${safeName},</h1>
    <p style="font-size: 13px; margin: 0 0 14px; color:#374151;">
      Here are your aging preview images. These are visual simulations—not a prediction—and are meant to support insight, not fear.
    </p>

    <div style="margin: 0 0 14px; padding: 12px; border: 1px solid #E5E7EB; border-radius: 12px; background: #F9FAFB;">
      <div style="font-size: 12px; font-weight: 700; margin-bottom: 8px;">Your original selfie</div>
      <img src="${selfieUrl}" alt="Selfie" style="width: 100%; height: auto; display:block; border-radius: 12px;" />
    </div>

    <h2 style="font-size: 15px; margin: 0 0 10px;">Your Skin’s Future Story — A Preview</h2>

    <div style="display:flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px;">
      ${card('10 Years — No Change', noChange10)}
      ${card('20 Years — No Change', noChange20)}
      ${card('10 Years — With Care', withCare10)}
      ${card('20 Years — With Care', withCare20)}
    </div>

    <p style="font-size: 12px; color:#6B7280; margin: 0;">
      If you’d like higher confidence previews, retake your selfie with even lighting, a front-facing angle, and your full face visible.
    </p>

    <p style="font-size: 13px; margin: 16px 0 0;">
      May your skin glow as bright as your smile.<br/>
      <span style="font-weight:700;">~ Dr. Lazuk</span>
    </p>
  </div>
  `;
}

async function fetchUrlAsBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch selfie URL (${resp.status})`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function generateEditsFromSelfieBytes(openai, selfieBytes, prompt) {
  // OpenAI Images Edits: requires an image file + prompt. We use a stable name and mime.
  const file = new File([selfieBytes], 'selfie.jpg', { type: 'image/jpeg' });
  const result = await openai.images.edits({
    model: 'gpt-image-1',
    image: file,
    prompt,
    size: '1024x1024'
  });

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned from OpenAI images.edits');
  return Buffer.from(b64, 'base64');
}

async function uploadBufferToCloudinary(buffer, folder, publicIdPrefix) {
  const cloudName = getEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = getEnv('CLOUDINARY_API_KEY');
  const apiSecret = getEnv('CLOUDINARY_API_SECRET');

  const boundary = `----formdata-${crypto.randomBytes(16).toString('hex')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${publicIdPrefix}_${crypto.randomBytes(6).toString('hex')}`;

  // Cloudinary signature
  const cryptoNode = require('crypto');
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = cryptoNode.createHash('sha1').update(toSign).digest('hex');

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
      `Content-Disposition: form-data; name="file"; filename="${publicId}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    )
  );
  formParts.push(buffer);
  formParts.push(Buffer.from(`\r\n`));

  pushField('api_key', apiKey);
  pushField('timestamp', timestamp);
  pushField('folder', folder);
  pushField('public_id', publicId);
  pushField('signature', signature);

  formParts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(formParts);
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body
  });

  const out = await resp.json();
  if (!resp.ok) {
    throw new Error(`Cloudinary upload failed: ${out?.error?.message || resp.statusText}`);
  }
  return out.secure_url;
}

async function generateAgingPreviewImagesFromUrl(openai, selfiePublicUrl) {
  const selfieBytes = await fetchUrlAsBytes(selfiePublicUrl);

  const prompts = {
    noChange10:
      'Generate a realistic age progression of this exact person 10 years in the future with minimal skincare care (no change). Keep facial identity identical. Natural lighting. Do not exaggerate.',
    noChange20:
      'Generate a realistic age progression of this exact person 20 years in the future with minimal skincare care (no change). Keep facial identity identical. Natural lighting. Do not exaggerate.',
    withCare10:
      'Generate a realistic age progression of this exact person 10 years in the future assuming consistent high-quality skincare and sun protection. Keep facial identity identical. Natural lighting. Subtle improvement.',
    withCare20:
      'Generate a realistic age progression of this exact person 20 years in the future assuming consistent high-quality skincare and sun protection. Keep facial identity identical. Natural lighting. Subtle improvement.'
  };

  // Generate 4 images (sequential to reduce rate spikes)
  const out = {};
  for (const [key, prompt] of Object.entries(prompts)) {
    const imgBytes = await generateEditsFromSelfieBytes(openai, selfieBytes, prompt);
    const url = await uploadBufferToCloudinary(imgBytes, 'drlazuk/aging-previews', key);
    out[key] = url;
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const { firstName, email, selfiePublicUrl } = req.body || {};
    const safeEmail = safeTrim(email, 320);
    const safeFirstName = safeTrim(firstName, 80);

    if (!safeEmail || !safeEmail.includes('@')) {
      return json(res, 400, { ok: false, error: 'bad_request', message: 'Valid email required.' });
    }
    if (!selfiePublicUrl || typeof selfiePublicUrl !== 'string') {
      return json(res, 400, { ok: false, error: 'bad_request', message: 'selfiePublicUrl required.' });
    }

    const openai = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') });
    const resend = new Resend(getEnv('RESEND_API_KEY'));

    const agingImages = await generateAgingPreviewImagesFromUrl(openai, selfiePublicUrl);

    const html = buildAgingOnlyEmailHtml({
      firstName: safeFirstName,
      selfieUrl: selfiePublicUrl,
      agingImages
    });

    await resend.emails.send({
      from: getEnv('EMAIL_FROM', false) || 'Dr. Lazuk <noreply@drlazuk.com>',
      to: safeEmail,
      subject: 'Your Aging Preview Images — Dr. Lazuk',
      html
    });

    return json(res, 200, { ok: true, agingPreviewImages: agingImages });
  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: 'aging_generation_failed',
      message: err?.message || 'Aging generation failed.'
    });
  }
};

