// src/utils/compositeAgingPreview.js

const DEFAULTS = {
  watermarkText: "skindoctor.ai",
  badgeTitle: "Identity Lock™ Enabled",
  badgeBody:
    "This aging preview is calculated using your unique facial architecture, bone structure, and proportional markers — ensuring consistency across time-based projections.",
};

export async function buildCompositeCanvas({
  imageUrl,
  mode = "original", // "original" | "vertical"
  watermarkText = DEFAULTS.watermarkText,
  badgeTitle = DEFAULTS.badgeTitle,
  badgeBody = DEFAULTS.badgeBody,
  // If Cloudinary ever taints canvas due to CORS, pass a proxied URL instead
}) {
  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas 2D context not available");

  if (mode === "original") {
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } else {
    // Vertical TikTok/Reels export
    canvas.width = 1080;
    canvas.height = 1920;

    // Background: blurred "cover"
    drawCover(ctx, img, 0, 0, canvas.width, canvas.height, { blur: 18, dim: 0.22 });

    // Foreground: centered "contain" with padding so face isn't cramped
    drawContain(ctx, img, 0, 0, canvas.width, canvas.height, { padding: 90 });
  }

  // Overlays
  drawIdentityLockBadge(ctx, canvas.width, canvas.height, badgeTitle, badgeBody);
  drawWatermark(ctx, canvas.width, canvas.height, watermarkText);

  return canvas;
}

export async function downloadComposite({
  imageUrl,
  mode,
  filename = "skindoctor-aging-preview.png",
}) {
  const canvas = await buildCompositeCanvas({ imageUrl, mode });
  await downloadCanvas(canvas, filename);
}

/* ---------------- helpers ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Must set BEFORE src
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer"; // helps in some edge cases
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to export image"));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve(true);
      },
      "image/png",
      1.0
    );
  });
}

/* ----------- drawing primitives ----------- */

function drawWatermark(ctx, w, h, text) {
  const inset = w >= 900 ? 24 : 16;
  const fontSize = w >= 900 ? 20 : 16;

  ctx.save();
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  // subtle shadow for legibility, still elegant
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = "rgba(255,255,255,0.10)"; // ~10%
  ctx.fillText(text, w - inset, h - inset);

  ctx.restore();
}

function drawIdentityLockBadge(ctx, w, h, title, body) {
  const edge = w >= 900 ? 24 : 16;
  const padX = w >= 900 ? 14 : 12;
  const padY = w >= 900 ? 12 : 10;

  const maxWidth = Math.floor(w * 0.55);

  const titleSize = w >= 900 ? 18 : 15;
  const bodySize = w >= 900 ? 14 : 12;

  const fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

  // Measure lines with wrapping
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.font = `700 ${titleSize}px ${fontFamily}`;
  const titleLineH = Math.ceil(titleSize * 1.25);

  ctx.font = `400 ${bodySize}px ${fontFamily}`;
  const bodyLines = wrapText(ctx, body, maxWidth - padX * 2, bodySize);

  const bodyLineH = Math.ceil(bodySize * 1.25);
  const bodyHeight = bodyLines.length * bodyLineH;

  const boxW = maxWidth;
  const boxH = padY + titleLineH + 8 + bodyHeight + padY;

  // Draw badge container
  roundRect(ctx, edge, edge, boxW, boxH, 14);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.stroke();

  // Title
  let x = edge + padX;
  let y = edge + padY;

  ctx.font = `700 ${titleSize}px ${fontFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(title, x, y);

  // Body
  y += titleLineH + 8;
  ctx.font = `400 ${bodySize}px ${fontFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (const line of bodyLines) {
    ctx.fillText(line, x, y);
    y += bodyLineH;
  }

  ctx.restore();
}

function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const { width } = ctx.measureText(test);
    if (width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  // soft cap for super-small images
  if (lines.length > 6) {
    const trimmed = lines.slice(0, 6);
    trimmed[5] = trimmed[5].replace(/\.*$/, "") + "…";
    return trimmed;
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h, { blur = 16, dim = 0.2 } = {}) {
  // Calculate cover scale
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = Math.ceil(w / scale);
  const sh = Math.ceil(h / scale);
  const sx = Math.floor((iw - sw) / 2);
  const sy = Math.floor((ih - sh) / 2);

  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.filter = "none";

  // Dim overlay for readability
  ctx.fillStyle = `rgba(0,0,0,${dim})`;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawContain(ctx, img, x, y, w, h, { padding = 80 } = {}) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const availW = w - padding * 2;
  const availH = h - padding * 2;

  const scale = Math.min(availW / iw, availH / ih);
  const dw = Math.floor(iw * scale);
  const dh = Math.floor(ih * scale);

  const dx = Math.floor(x + (w - dw) / 2);
  const dy = Math.floor(y + (h - dh) / 2);

  ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
}
