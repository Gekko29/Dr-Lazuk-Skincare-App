// src/App.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Camera,
  MessageCircle,
  BookOpen,
  Upload,
  Send,
  Info,
  Mail,
  Sparkles,
  Loader
} from 'lucide-react';

// ✅ Google Analytics helpers
import { gaEvent, gaPageView, getGaClientId } from "./lib/ga";
import EstheticsConciergeApp from "./esthetics/EstheticsConciergeApp";
import ConversationalConcierge from "./ConversationalConcierge";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/* ---------------------------------------
   Locked Scoring + RAG (Client-side scaffold)
--------------------------------------- */
const RAG_THRESHOLDS = { green: 75, amber: 55 };

function ragFromScore(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "unknown";
  if (score >= RAG_THRESHOLDS.green) return "green";
  if (score >= RAG_THRESHOLDS.amber) return "amber";
  return "red";
}
function clampScore(n) {
  if (n === null || n === undefined || n === "") return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x)));
}
const LOCKED_CLUSTERS = [
  { cluster_id:"core_skin", display_name:"Core Skin Health", weight:0.35, order:1, metrics:[
    { metric_id:"barrier_stability", display_name:"Barrier Stability", keywords:["barrier","skin barrier"] },
    { metric_id:"hydration_level", display_name:"Hydration Level", keywords:["hydration","dehydr"] },
    { metric_id:"oil_sebum_balance", display_name:"Oil / Sebum Balance", keywords:["oil","sebum"] },
    { metric_id:"skin_texture", display_name:"Skin Texture", keywords:["texture"] },
    { metric_id:"pore_visibility", display_name:"Pore Visibility", keywords:["pore"] }
  ]},
  { cluster_id:"aging_structure", display_name:"Aging & Structure", weight:0.25, order:2, metrics:[
    { metric_id:"fine_lines", display_name:"Fine Lines", keywords:["fine lines"] },
    { metric_id:"wrinkles", display_name:"Wrinkles", keywords:["wrinkles"] },
    { metric_id:"skin_firmness", display_name:"Skin Firmness", keywords:["firmness","firm"] },
    { metric_id:"skin_sagging", display_name:"Skin Sagging", keywords:["sagging","sag"] },
    { metric_id:"elasticity", display_name:"Elasticity / Bounce-Back", keywords:["elastic","bounce"] }
  ]},
  { cluster_id:"eye_area", display_name:"Eye Area", weight:0.15, order:3, metrics:[
    { metric_id:"ue_fine_lines", display_name:"Under-Eye Fine Lines", keywords:["under-eye fine lines","under eye fine lines"] },
    { metric_id:"ue_sagging", display_name:"Under-Eye Sagging / Hollows", keywords:["under-eye","hollows","sagging"] },
    { metric_id:"dark_circles", display_name:"Under-Eye Dark Circles", keywords:["dark circles"] },
    { metric_id:"puffiness", display_name:"Under-Eye Puffiness", keywords:["puffiness","puffy"] }
  ]},
  { cluster_id:"pigmentation_tone", display_name:"Pigmentation & Tone", weight:0.15, order:4, metrics:[
    { metric_id:"overall_pigmentation", display_name:"Overall Pigmentation", keywords:["pigment"] },
    { metric_id:"dark_spots", display_name:"Dark Spots / Sun Spots", keywords:["dark spots","sun spots"] },
    { metric_id:"uneven_tone", display_name:"Uneven Skin Tone", keywords:["uneven tone","uneven skin tone"] },
    { metric_id:"redness", display_name:"Redness / Blotchiness", keywords:["redness","blotch"] }
  ]},
  { cluster_id:"stress_damage", display_name:"Stress & Damage", weight:0.10, order:5, metrics:[
    { metric_id:"sensitivity", display_name:"Sensitivity / Reactivity", keywords:["sensitive","reactive"] },
    { metric_id:"inflammation", display_name:"Inflammation Signals", keywords:["inflamm","irritat"] },
    { metric_id:"environmental_damage", display_name:"Environmental Damage (UV / Pollution)", keywords:["uv","pollution","environmental"] }
  ]}
];
function buildVisualPayload({ serverPayload }) {
  // Server is authoritative, but API payloads may expose cluster info under different keys.
  // We accept:
  // - { clusters: [...] }
  // - { visual_payload: { clusters: [...] } }
  // - { visualAnalysisV2: { clusters: [...] } }
  // - { areasOfFocus: [...] }   (cluster-level scores + rag; no per-metric scores)
  if (!serverPayload) return null;

  const resolved =
    (serverPayload && Array.isArray(serverPayload.clusters) && serverPayload) ||
    (serverPayload.visual_payload && Array.isArray(serverPayload.visual_payload.clusters) && serverPayload.visual_payload) ||
    (serverPayload.canonical_payload && Array.isArray(serverPayload.canonical_payload.clusters) && serverPayload.canonical_payload) ||
    (serverPayload.visualAnalysisV2 && Array.isArray(serverPayload.visualAnalysisV2.clusters) && serverPayload.visualAnalysisV2) ||
    null;

  // Preferred: full cluster payload
  if (resolved && Array.isArray(resolved.clusters)) {
    const clusters = resolved.clusters
      .filter(Boolean)
      .map((c) => {
        const metrics = Array.isArray(c.metrics) ? c.metrics : [];
        const clusterScore = clampScore(c.score);
        const clusterRag = String(c.rag || (clusterScore != null ? ragFromScore(clusterScore) : "unknown"));

        return {
          cluster_id: String(c.cluster_id || c.id || c.key || c.title || "").trim(),
          display_name: String(c.display_name || c.title || "").trim(),
          rag: clusterRag,
          score: clusterScore,
          confidence: typeof c.confidence === "number" ? c.confidence : null,
          basis: c.basis ? String(c.basis) : null,
          keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
          metrics: metrics
            .filter(Boolean)
            .map((m) => {
              const metricScore = clampScore(m.score);
              return {
                metric_id: String(m.metric_id || m.id || m.key || m.name || "").trim(),
                display_name: String(m.display_name || m.name || "").trim(),
                score: metricScore,
                rag: String(m.rag || (metricScore != null ? ragFromScore(metricScore) : "unknown"))
              };
            })
        };
      });

    const overallScore = clampScore(
      resolved?.overall_score?.score ??
        resolved?.overall_score ??
        resolved?.score ??
        serverPayload?.overall_score?.score ??
        serverPayload?.overall_score ??
        serverPayload?.score
    );

    return {
      overall_score: {
        score: overallScore,
        rag: String(
          resolved?.overall_score?.rag ||
            serverPayload?.overall_score?.rag ||
            (overallScore != null ? ragFromScore(overallScore) : "unknown")
        )
      },
      clusters
    };
  }

  // Fallback: areasOfFocus (cluster-only)
  const aof =
    (Array.isArray(serverPayload.areasOfFocus) && serverPayload.areasOfFocus) ||
    (Array.isArray(serverPayload.visual_payload?.areasOfFocus) && serverPayload.visual_payload.areasOfFocus) ||
    null;

  if (aof) {
    const lockedById = new Map(LOCKED_CLUSTERS.map((c) => [c.cluster_id, c]));
    const clusters = aof
      .filter(Boolean)
      .map((c) => {
        const id = String(c.cluster_id || c.id || c.key || "").trim();
        const locked = lockedById.get(id);
        const clusterScore = clampScore(c.score);
        const clusterRag = String(c.rag || (clusterScore != null ? ragFromScore(clusterScore) : "unknown"));

        // No per-metric scores in this payload; we still show the metric list (names) for transparency.
        const metrics = (locked?.metrics || []).map((m) => ({
          metric_id: m.metric_id,
          display_name: m.display_name,
          score: null,
          rag: "unknown"
        }));

        return {
          cluster_id: id,
          display_name: String(c.title || locked?.display_name || id || "").trim(),
          rag: clusterRag,
          score: clusterScore,
          confidence: typeof c.confidence === "number" ? c.confidence : null,
          basis: c.basis ? String(c.basis) : "cluster_only",
          keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
          metrics
        };
      })
      .filter((c) => c.cluster_id);

    const overallScore = clampScore(
      serverPayload?.overall_score?.score ??
        serverPayload?.overall_score ??
        serverPayload?.score ??
        serverPayload?.visual_payload?.overall_score?.score ??
        serverPayload?.visual_payload?.overall_score
    );

    return {
      overall_score: {
        score: overallScore,
        rag: String(
          serverPayload?.overall_score?.rag ||
            serverPayload?.visual_payload?.overall_score?.rag ||
            (overallScore != null ? ragFromScore(overallScore) : "unknown")
        )
      },
      clusters
    };
  }

  return null;
}
function ragColor(rag){
  if(rag==="green") return "#16a34a";
  if(rag==="red") return "#dc2626";
  if(rag==="amber") return "#f59e0b";
  return "#9ca3af"; // unknown
}

/* ---------------------------------------
   Reflection Layer (Locked Copy)
--------------------------------------- */
const REFLECTION_SECTIONS = [
  {
    title: "Section 1 — Holding the Moment",
    body:
`If you’re feeling a little unsettled right now, that’s normal.

What you just saw can bring up many emotions—surprise, curiosity, concern, even resistance. Some people feel a quiet moment of reflection. Others feel a jolt they weren’t expecting. There is no right or wrong reaction here.

I want you to know something important:

What you are seeing is not a verdict.
It is not a prediction carved in stone.
And it is certainly not a judgment.

What you’re seeing is a visual story—one possible path based on today’s data, today’s habits, today’s environment. Nothing more, and nothing less.

As a physician, I’ve spent decades studying faces, skin, and the quiet signals the body gives long before change becomes obvious. I can tell you this with confidence: the future of your skin is not decided by time alone. It is shaped—slowly, consistently—by care, protection, and intention.

If there is one thing I want you to take from this moment, it’s this:

Your face is not aging “toward” something.
It is responding to how it is supported.

And support can always be adjusted.

You don’t need to act today.
You don’t need to decide anything right now.
You only need to understand that what you just saw represents possibility—not destiny.

When you’re ready, the way forward is not about chasing youth.
It’s about strengthening resilience.
Protecting what’s already beautiful.
And allowing your outer appearance to reflect the care you give yourself internally.

Until then, take a breath.
Let this information settle.`
  },
  {
    title: "Section 2 — If You’re Wondering Whether This Future Is Changeable",
    body:
`It’s a fair question—and an important one.

What you just saw represents one possible trajectory, not a fixed destination. Skin does not age in isolation, and it does not age uniformly. It responds—quietly and continuously—to how it is supported over time.

In clinical practice, the most meaningful differences we see are not created by extremes. They come from consistency: protecting the skin barrier, minimizing chronic inflammation, supporting hydration, and reducing cumulative environmental stress.

This is why two people of the same age can look remarkably different over time—not because one did “more,” but because their skin was supported differently.

There is no single correct path forward.
Some people focus on daily care.
Some choose professional treatments.
Some simply become more intentional and observant.

All of these approaches can influence direction.

What matters most is understanding this:

The future of your skin is responsive—not predetermined.

And responsiveness means you retain influence, at every stage.`
  },
  {
    title: "Section 3 — If You’re Wondering How This Was Created",
    body:
`That question matters—and you deserve a clear answer.

This experience was not created using a generic aging filter or a randomized model. Every image and insight was anchored to your own face, starting with the photo you provided.

Rather than replacing your features, the system analyzed them—your facial structure, proportions, texture patterns, tone distribution, and visible environmental stress signals. From there, it calculated how those same features tend to evolve over time under similar conditions.

The intention was never to create something dramatic.
It was to create something recognizable.

Technology alone does not decide how this information is presented.

As a physician, my role is to ensure that what you see is framed responsibly, explained clearly, and never used to provoke fear or urgency. This is why the results are delivered as interpretation—not diagnosis, not judgment, and not instruction.

This analysis exists to inform, not to persuade.`
  },
  {
    title: "Section 4 — Why Revisiting This Over Time Can Be Meaningful",
    body:
`Skin does not change overnight—and neither does its direction.

In medicine, we learn the most not from a single snapshot, but from patterns over time. What stabilizes. What shifts. What responds to care. Your skin follows the same principle.

Revisiting this analysis periodically is not about watching for flaws or chasing perfection. It’s about understanding how your skin responds to the way you live, protect, and care for it.

Over time, subtle changes become clearer:
- whether hydration and texture are stabilizing
- whether environmental stress is quieting or accumulating
- whether your current level of support is sufficient

These shifts are often difficult to notice day to day, but meaningful over months.

By returning to this analysis when you feel ready, you’re not checking on your appearance—you’re observing your skin’s conversation with time.

There is no required schedule.
There is no expectation to act.

But for those who choose to revisit, this becomes a way to stay informed, grounded, and thoughtful—making decisions based on evidence rather than emotion.

A Final Thought

Skin health is not a single moment.
It’s a relationship—one that evolves with time, environment, and care.

This tool exists to support that relationship.
Nothing more.
Nothing less.

When you’re ready to listen again, it will be here.

With care,
Dr. Iryna Lazuk`
  }
];

/* ---------------------------------------
   Clinical-Style Intake (Locked Copy)
--------------------------------------- */
const CAPTURE_PREP_COPY = {
  title: "Preparing for Your Analysis",
  subtitle:
    "To ensure the most accurate and meaningful results, a few simple steps matter.",
  intro:
    "To create an analysis that truly reflects your skin — not surface distractions — we need a clear, honest view of your face. This process does not judge appearance. It evaluates structure, tone, texture, and skin signals that can be obscured by makeup, lighting, or accessories.",
  bullets: [
    {
      head: "Clean, makeup-free skin",
      body:
        "Please remove foundation, concealer, bronzer, blush, and tinted skincare. These products alter tone and texture and can interfere with accurate analysis."
    },
    {
      head: "Natural, even lighting",
      body:
        "Face a window during daylight if possible. Avoid harsh overhead lighting or shadows, which can exaggerate or hide skin features."
    },
    {
      head: "No filters, no enhancements",
      body:
        "Please do not use camera filters, beauty modes, or retouching. These distort natural proportions and surface detail."
    },
    {
      head: "Hair pulled back, glasses removed",
      body:
        "Your full facial structure needs to be visible. Hair, frames, or accessories can obscure key landmarks used for analysis."
    },
    {
      head: "Neutral expression",
      body:
        "Relax your face and look directly into the camera. Smiling or squinting changes how lines and contours appear."
    },
    {
      head: "Comfortable distance",
      body:
        "Hold your phone about 12 inches (30 cm) away. Your face should fill the frame without being too close."
    }
  ],
  outro:
    "If the image doesn’t meet the quality needed for accurate analysis, the system may ask you to retake it. This isn’t an error — it’s how we protect the integrity of your results."
};

/* ---------------------------------------
   Supportive Retake Messages (Locked)
--------------------------------------- */
const RETAKE_MESSAGES = {
  low_light:
    "It looks like you may be in shadow. To accurately assess skin tone and texture, we need a bit more natural light. Please try facing a window or moving to a brighter space and take the photo again.",
  blurry:
    "That image came through a little soft. For precise facial mapping, we need a sharp, focused view. Please hold your phone steady and try once more.",
  framing:
    "We need to see your features a bit more clearly. Please hold your phone about 12 inches (30 cm) away so your face fills the frame comfortably.",
  obstructed:
    "Part of your facial structure may be covered. Please pull hair back and remove glasses so we can accurately map your features.",
  non_face:
    "We could not detect a face in this photo. Please upload a clear, front-facing photo of your face with good lighting and minimal obstructions."
};

const SUPPORTIVE_FOOTER_LINE =
  "This step helps ensure your results are thoughtful, accurate, and meaningful.";

/* ---------------------------------------
   Helper: lockout after repeated non-face attempts
--------------------------------------- */
const getFaceLockStatus = () => {
  const lockUntilStr =
    typeof window !== 'undefined' ? localStorage.getItem('dl_faceLockUntil') : null;
  if (!lockUntilStr) return { locked: false };

  const lockUntil = Number(lockUntilStr);
  if (Number.isNaN(lockUntil)) return { locked: false };

  if (Date.now() < lockUntil) {
    const msRemaining = lockUntil - Date.now();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    return {
      locked: true,
      message: `We still can't detect a face in your photos. To keep results accurate, you can try again in about ${daysRemaining} day(s).`
    };
  }

  return { locked: false };
};

const registerFaceFailure = () => {
  const failStr =
    typeof window !== 'undefined' ? localStorage.getItem('dl_faceFailCount') : null;
  const currentFails = failStr ? Number(failStr) || 0 : 0;
  const newFails = currentFails + 1;

  if (typeof window !== 'undefined') {
    localStorage.setItem('dl_faceFailCount', String(newFails));
  }

  if (newFails >= 2) {
    const lockUntil = Date.now() + THIRTY_DAYS_MS;
    if (typeof window !== 'undefined') {
      localStorage.setItem('dl_faceLockUntil', String(lockUntil));
    }
    return {
      lockedNow: true,
      message:
        "We couldn't detect a face in your photo after two attempts. For accuracy and fairness, you'll be able to try again in 30 days."
    };
  }

  return {
    lockedNow: false,
    message: RETAKE_MESSAGES.non_face
  };
};

const clearFaceFailures = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('dl_faceFailCount');
};

/* ---------------------------------------
   Face Detection (browser API when available)
--------------------------------------- */
const detectFaceInImageElement = async (canvasEl) => {
  if (!canvasEl) return { ok: false };

  if ('FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      const faces = await detector.detect(canvasEl);
      if (!faces || faces.length === 0) return { ok: false };
      return { ok: true, faces };
    } catch (err) {
      console.error('FaceDetector error:', err);
      // Soft pass if the browser FaceDetector errors (do not block conversion)
      return { ok: true, faces: null, softPass: true };
    }
  } else {
    return { ok: true, faces: null, softPass: true };
  }
};

const detectFaceFromDataUrl = (dataUrl) => {
  return new Promise((resolve) => {
    if (!('FaceDetector' in window)) {
      resolve({ ok: true, faces: null, softPass: true });
      return;
    }

    const img = new Image();
    img.onload = async () => {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await detector.detect(img);
        resolve({ ok: faces.length > 0, faces });
      } catch (err) {
        console.error('FaceDetector error (upload):', err);
        resolve({ ok: true, faces: null, softPass: true });
      }
    };
    img.onerror = () => resolve({ ok: false, faces: null });
    img.src = dataUrl;
  });
};

/* ---------------------------------------
   Quality Checks (brightness + blur)
--------------------------------------- */
const computeBrightnessAndBlur = (canvas) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const getL = (idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
  };

  // Sample stride for speed
  const step = 2;

  let sumL = 0;
  let count = 0;

  let gradSum = 0;
  let gradSumSq = 0;
  let gradCount = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = (y * width + x) * 4;

      const l = getL(i);
      sumL += l;
      count++;

      const iL = (y * width + (x - 1)) * 4;
      const iR = (y * width + (x + 1)) * 4;
      const iU = ((y - 1) * width + x) * 4;
      const iD = ((y + 1) * width + x) * 4;

      const gx = getL(iR) - getL(iL);
      const gy = getL(iD) - getL(iU);
      const gmag = Math.sqrt(gx * gx + gy * gy);

      gradSum += gmag;
      gradSumSq += gmag * gmag;
      gradCount++;
    }
  }

  const meanBrightness = sumL / Math.max(1, count);

  const gradMean = gradSum / Math.max(1, gradCount);
  const gradVar = gradSumSq / Math.max(1, gradCount) - gradMean * gradMean;

  return { meanBrightness, gradVar };
};

const validateCapturedImage = async ({ dataUrl, faces }) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const maxW = 640;
  const scale = Math.min(1, maxW / img.width);
  canvas.width = Math.floor(img.width * scale);
  canvas.height = Math.floor(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const { meanBrightness, gradVar } = computeBrightnessAndBlur(canvas);

  // ✅ Debug bundle (used only when DEBUG_RETAKE is enabled)
  const debug = {
    meanBrightness: Number(meanBrightness?.toFixed?.(1) ?? meanBrightness),
    gradVar: Number(gradVar?.toFixed?.(1) ?? gradVar)
  };

  // Hard reject only if truly unusable
  if (meanBrightness < 40) {
    return { ok: false, code: 'low_light', message: RETAKE_MESSAGES.low_light, debug };
  }

  // Blur: keep conversion-friendly (less strict). Still blocks truly soft photos.
  if (gradVar < 40) {
    return { ok: false, code: 'blurry', message: RETAKE_MESSAGES.blurry, debug };
  }

  // ✅ Stricter face checks (partial / off-angle / clipped faces)
  if (faces && Array.isArray(faces)) {
    // If multiple faces are detected, reject (prevents group photos / background faces)
    if (faces.length > 1) {
      return { ok: true, warning: true, code: 'obstructed', message: RETAKE_MESSAGES.obstructed, debug };
    }

    const bb = faces?.[0]?.boundingBox;
    if (bb) {
      const imgW = img.width;
      const imgH = img.height;

      const faceArea = bb.width * bb.height;
      const imgArea = imgW * imgH;
      const ratio = faceArea / imgArea; // face coverage

      const cx = (bb.x + bb.width / 2) / imgW;  // 0..1
      const cy = (bb.y + bb.height / 2) / imgH; // 0..1

      // ✅ add framing debug
      debug.faceRatio = Number(ratio?.toFixed?.(3) ?? ratio);
      debug.faceCenter = { cx: Number(cx?.toFixed?.(3) ?? cx), cy: Number(cy?.toFixed?.(3) ?? cy) };

      // Require a reasonably large, not-too-close face in frame
      // (Partial faces often show small boxes; extreme close-ups show huge boxes.)
      if (ratio < 0.18 || ratio > 0.60) {
        return { ok: true, warning: true, code: 'framing', message: RETAKE_MESSAGES.framing, debug };
      }

      // Require face center to be near image center (partial faces are often off-center)
      if (cx < 0.35 || cx > 0.65 || cy < 0.28 || cy > 0.72) {
        return { ok: true, warning: true, code: 'framing', message: RETAKE_MESSAGES.framing, debug };
      }

      // Reject if face box is too close to edges (common when only part of face is visible)
      const padX = 0.06 * imgW;
      const padY = 0.06 * imgH;

      const left = bb.x;
      const top = bb.y;
      const right = bb.x + bb.width;
      const bottom = bb.y + bb.height;

      if (left < padX || top < padY || right > (imgW - padX) || bottom > (imgH - padY)) {
        return { ok: true, warning: true, code: 'framing', message: RETAKE_MESSAGES.framing, debug };
      }
    }
  }

  return { ok: true, debug };
};

/* ---------------------------------------
   Helper: downscale data URL to reduce payload (keeps quality)
--------------------------------------- */
const downscaleDataUrl = async (dataUrl, maxW = 960, quality = 0.92) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(1, Math.floor(img.width * scale));
  const h = Math.max(1, Math.floor(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
};

/* ---------------------------------------
   Option 1 helper: /api/analyzeImage first
--------------------------------------- */
const callAnalyzeImage = async ({ imageBase64, notes }) => {
  const res = await fetch('/api/analyzeImage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, notes })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok) {
    const msg = data?.message || data?.error || 'Error analyzing image';
    const err = new Error(String(msg));
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
};

/* ---------------------------------------
   Identity Lock Overlay (Calm)
--------------------------------------- */
const IdentityLockOverlay = ({ onComplete }) => {
  const steps = useMemo(
    () => [
      "Mapping facial structure…",
      "Identifying proportional landmarks…",
      "Calibrating analysis to your unique features…",
      "Anchoring projections to your facial architecture…"
    ],
    []
  );

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t1 = setInterval(() => setIdx((v) => (v + 1) % steps.length), 900);
    const t2 = setTimeout(() => onComplete?.(), 4200);
    return () => {
      clearInterval(t1);
      clearTimeout(t2);
    };
  }, [steps.length, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="max-w-lg w-full border border-gray-200 bg-white shadow-sm p-8">
        <div className="flex items-center gap-3 mb-4">
          <Loader className="animate-spin" size={22} />
          <h3 className="text-xl font-bold text-gray-900">Activating Identity Lock™</h3>
        </div>
        <p className="text-sm text-gray-700 mb-4">{steps[idx]}</p>
        <p className="text-xs text-gray-600">
          This ensures your analysis and future projections remain specific to you — not a generic model.
        </p>
      </div>
    </div>
  );
};

/* ---------------------------------------
   Modal
--------------------------------------- */
const Modal = ({ title, body, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white border border-gray-200 shadow-lg p-6">
        <div className="flex justify-between items-start gap-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <div className="text-sm text-gray-500">provided by skindoctor.ai</div>
      <button onClick={onClose} className="text-gray-700 hover:text-gray-900 font-bold" type="button">
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{body}</p>
        <button onClick={onClose} className="mt-5 w-full bg-gray-900 text-white py-3 font-bold hover:bg-gray-800" type="button">
          Understood
        </button>
      </div>
    </div>
  );
};

/* ---------------------------------------
   Identity Lock Badge
--------------------------------------- */
const IdentityLockBadge = ({ onClick, placement = "top-left" }) => {
  const pos =
    placement === "top-left"
      ? "top-3 left-3"
      : placement === "top-right"
      ? "top-3 right-3"
      : placement === "bottom-right"
      ? "bottom-3 right-3"
      : "bottom-3 left-3";

  return (
    <button
      onClick={onClick}
      className={`absolute ${pos} z-10 bg-white/85 backdrop-blur border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm hover:bg-white`}
      title="Identity Lock™ Enabled"
      type="button"
    >
      Identity Lock™ Enabled
    </button>
  );
};

/* ---------------------------------------
   Watermark Overlay (UI failsafe)
--------------------------------------- */
const WatermarkOverlay = ({ text = "SkinDoctor.ai • Dr. Lazuk Esthetics® | Cosmetics®" }) => {
  return (
    <div className="absolute bottom-3 right-3 z-10 bg-black/55 backdrop-blur-sm px-3 py-2 text-[11px] text-white font-semibold select-none">
      {text}
    </div>
  );
};

/* ---------------------------------------
   Areas of Focus Card (ON-SCREEN)
--------------------------------------- */
const normalizeAreasOfFocus = (areas) => {
  if (!areas) return [];

  const toItem = (x, fallbackTitle = "") => {
    if (!x) return null;

    // Support multiple possible shapes
    const title = String(x?.title || x?.category || x?.name || fallbackTitle || "").trim();
    const risk = String(x?.compoundingRisk || x?.risk || x?.implications || "").trim();
    const now = String(x?.doThisNow || x?.action || x?.protocol || "").trim();

    // Optional relevance fields (server can send these later)
    const relevant =
      x?.relevant === undefined ? true : !!x.relevant; // default true if missing
    const scoreRaw = x?.score ?? x?.severity ?? x?.priority ?? null;
    const score = scoreRaw === null ? null : Number(scoreRaw);

    if (!title || (!risk && !now)) return null;
    if (!relevant) return null;

    return { title, risk, now, score };
  };

  let items = [];

  if (Array.isArray(areas)) {
    items = areas.map((x) => toItem(x)).filter(Boolean);
  } else if (typeof areas === "object") {
    items = Object.entries(areas)
      .map(([key, val]) => toItem(val, key))
      .filter(Boolean);
  }

  // Sort by score if provided (desc). Otherwise keep natural order.
  const hasAnyScore = items.some((it) => typeof it.score === "number" && !Number.isNaN(it.score));
  if (hasAnyScore) {
    items.sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)));
  }

  // ✅ UI failsafe: show only the top 3 by default
  return items.slice(0, 3);
};

const AreasOfFocusCard = ({ areas }) => {
  const items = useMemo(() => normalizeAreasOfFocus(areas), [areas]);

  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white border-2 border-gray-900 p-6">
      <h4 className="text-xl font-bold text-gray-900 mb-2">Areas of Focus</h4>
      <p className="text-sm text-gray-700 mb-5">
        These are the specific signals your analysis flagged as most relevant right now.
      </p>

      <div className="space-y-5">
        {items.map((it, idx) => (
          <div key={`${it.title}-${idx}`} className="border border-gray-200 bg-gray-50 p-5">
            <p className="text-base font-bold text-gray-900">{it.title}</p>

            {it.risk && (
              <p className="text-sm text-gray-800 mt-3 leading-relaxed">
                <span className="font-bold text-gray-900">The Compounding Risk:</span>{" "}
                {it.risk}
              </p>
            )}

            {it.now && (
              <p className="text-sm text-gray-800 mt-3 leading-relaxed">
                <span className="font-bold text-gray-900">Do This Now:</span>{" "}
                {it.now}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
/* ---------------------------------------
   Default Summary View (ON-SCREEN)
--------------------------------------- */
const normalizeScore01 = (score) => {
  if (typeof score !== "number" || Number.isNaN(score)) return null;

  // Accept either 0..1 or 0..100 inputs
  if (score > 1.5) {
    const c = clampScore(score);
    if (c === null) return null;
    return c / 100;
  }

  return Math.max(0, Math.min(1, score));
};

const scoreToRag = (score) => {
  const s = normalizeScore01(score);
  if (s === null) return { label: "A", text: "Attention", level: "amber" };
  if (s >= 0.66) return { label: "R", text: "High Priority", level: "red" };
  if (s >= 0.33) return { label: "A", text: "Moderate Priority", level: "amber" };
  return { label: "G", text: "Stable", level: "green" };
};

const RagPill = ({ score }) => {
  const rag = scoreToRag(score);
  const s01 = normalizeScore01(score);

  const cls =
    rag.level === "red"
      ? "bg-red-600 text-white"
      : rag.level === "green"
      ? "bg-green-600 text-white"
      : "bg-yellow-500 text-white";

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-bold ${cls}`}>
      <span className="inline-block w-5 text-center">{rag.label}</span>
      <span>{rag.text}</span>
      {s01 !== null && (
        <span className="ml-1 font-mono text-[11px] opacity-90">{Math.round(s01 * 100)}%</span>
      )}
    </span>
  );
};

const StaticMapPreview = ({ clusters = [] }) => {
  const safeClusters = Array.isArray(clusters) ? clusters.slice(0, 5) : [];
  const rBase = 18;
  const rStep = 6;
  return (
    <div className="staticMapPreview" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="static map preview">
        <g transform="translate(46 46)">
          {safeClusters.map((c, i) => {
            const avgRaw = (typeof c?.score === "number" ? c.score : (typeof c?.avg === "number" ? c.avg : 70));
            const avg = clampScore(avgRaw) ?? 70;
            const rag = ragFromScore(avg);
            const r = rBase + (i * rStep);
            return (
              <g key={c.cluster_id || i}>
                <circle cx="0" cy="0" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2" />
                <circle cx={r} cy="0" r="3.2" fill={ragColor(rag)} />
              </g>
            );
          })}
          <circle cx="0" cy="0" r="8" fill="none" stroke="#cbd5e1" strokeWidth="2" />
        </g>
      </svg>
      <div style={{ fontSize:10, color:"#64748b" }}>static map preview</div>
    </div>
  );
};

const deriveTopSignals = (areas) => {
  const items = normalizeAreasOfFocus(areas);
  return items.map((it) => ({
    title: it.title,
    score: typeof it.score === "number" ? it.score : null
  }));
};

const SummaryCard = ({ ageRange, primaryConcern, analysisReport }) => {

  // SVG ring sizing constants (prevents runtime ReferenceError in production)
  const ringStroke = 6;
  const ringGap = 10;
  const ringRadius = 34;

  const visualPayload = useMemo(() => {
    const serverPayload =
      (analysisReport && typeof analysisReport === "object"
        ? (analysisReport.canonical_payload || analysisReport.visual_payload || null)
        : null);

    return buildVisualPayload({ serverPayload });
  }, [analysisReport]);
  const top = useMemo(() => deriveTopSignals(analysisReport?.areasOfFocus), [analysisReport]);
  const excerpt = useMemo(() => {
    const t = String(analysisReport?.report || "").trim();
    if (!t) return "";
    // A short excerpt that still reads well.
    const cut = t.slice(0, 650);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 420 ? cut.slice(0, lastSpace) : cut).trim() + (t.length > cut.length ? "…" : "");
  }, [analysisReport]);

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden">
      {/* Main header section - removed DEFAULT SUMMARY VIEW and Your AI Facial labels */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 px-8 py-6 border-b border-gray-200">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h4 className="text-3xl font-bold text-gray-900 leading-tight">
              What This Analysis Flagged — At a Glance
            </h4>
            <p className="text-sm text-gray-600 mt-3">
              Everything below is optional. Expand only what you want to read.
            </p>
          </div>
        </div>
      </div>

      {/* Score display section with premium card design */}
      <div className="px-8 py-8">
        <div className="flex items-center justify-between gap-8 mb-8">
          {/* Overall Score - Make it dramatic */}
          <div className="flex-1">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-full shadow-md mb-4">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
              </svg>
              <span className="text-sm font-semibold tracking-wide">OVERALL SKIN HEALTH SCORE</span>
            </div>
            
            <div className="relative inline-block">
              {/* Circular progress ring background */}
              <svg className="transform -rotate-90" width="160" height="160">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="#e5e7eb"
                  strokeWidth="12"
                  fill="none"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke={`url(#scoreGradient-${visualPayload?.overall_score?.rag || 'unknown'})`}
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - ((visualPayload?.overall_score?.score ?? 0) / 100))}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="scoreGradient-green" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="scoreGradient-amber" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                  <linearGradient id="scoreGradient-red" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                  <linearGradient id="scoreGradient-unknown" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6b7280" />
                    <stop offset="100%" stopColor="#4b5563" />
                  </linearGradient>
                </defs>
              </svg>
              
              {/* Score number in center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl font-extrabold text-gray-900">{visualPayload?.overall_score?.score ?? "—"}</div>
                  <div className="text-lg text-gray-500 font-medium">/100</div>
                </div>
              </div>
            </div>

            {/* RAG Legend */}
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-500 to-green-600 shadow-sm"></div>
                <span className="text-gray-700 font-medium">Green = Strong</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm"></div>
                <span className="text-gray-700 font-medium">Amber = Moderate opportunity</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-sm"></div>
                <span className="text-gray-700 font-medium">Red = Priority focus</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cluster breakdown section */}
        <div className="space-y-4 mt-8">
                {(visualPayload?.clusters || []).map((c) => (
                  <div key={c.cluster_id} className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow duration-200">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h5 className="text-lg font-bold text-gray-900">{c.display_name}</h5>
                      <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          c.rag === 'green' ? 'bg-green-500' : 
                          c.rag === 'amber' ? 'bg-amber-500' : 
                          c.rag === 'red' ? 'bg-red-500' : 'bg-gray-400'
                        }`} />
                        <span className="text-sm font-bold text-gray-900">{Math.round(c.score)}/100</span>
                      </div>
                    </div>
                    <div className="flex gap-6 items-start">
                      <div className="flex-shrink-0">
                    {/* radial cluster with enhanced styling */}
                    <div className="bg-white rounded-lg p-2 shadow-sm">
                    <svg width="140" height="140" viewBox="0 0 140 140" style={{ display:"block" }}>
                      {c.metrics.map((m, i) => {
                        const r = ringRadius - i * ringGap;
                        const circ = 2 * Math.PI * r;
                        const pct = Math.max(0, Math.min(1, (Number.isFinite(m.score) ? m.score : 0) / 100));
                        const offset = circ * (1 - pct);
                        const stroke = ragColor(m.rag);
                        return (
                          <g key={m.id}>
                            <circle cx="70" cy="70" r={r} fill="none" stroke="#E5E7EB" strokeWidth={ringStroke} />
                            <circle
                              cx="70"
                              cy="70"
                              r={r}
                              fill="none"
                              stroke={stroke}
                              strokeWidth={ringStroke}
                              strokeDasharray={circ}
                              strokeDashoffset={offset}
                              strokeLinecap="round"
                              transform="rotate(-90 70 70)"
                            />
                          </g>
                        );
                      })}
                      <text x="70" y="74" textAnchor="middle" fontSize="24" fontWeight="800" fill="#111827">{Math.round(c.score)}</text>
                      <text x="70" y="94" textAnchor="middle" fontSize="13" fontWeight="600" fill="#6B7280">/100</text>
                    </svg>
                    </div>
                      </div>

                      <div className="flex-1 space-y-2.5">
                        {(c.metrics || []).map((m) => (
                          <div key={m.metric_id} className="flex justify-between items-center gap-4 py-1.5 px-2 hover:bg-white/60 rounded-md transition-colors">
                            <div className="text-sm font-medium text-gray-700">{m.display_name}</div>
                            <div className="flex gap-3 items-center">
                              <span className="text-base font-bold text-gray-900 min-w-[36px] text-right">{m.score}</span>
                              <div className={`w-2.5 h-2.5 rounded-full ${
                                m.rag === 'green' ? 'bg-green-500' : 
                                m.rag === 'amber' ? 'bg-amber-500' : 
                                m.rag === 'red' ? 'bg-red-500' : 'bg-gray-400'
                              }`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
</div>

      {/* Bottom info cards */}
      <div className="grid md:grid-cols-2 gap-5 mt-8 px-8 pb-8">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
            <p className="text-xs tracking-wider text-blue-900 font-bold uppercase">Context</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-800">
              <span className="font-bold text-blue-900">Age Range:</span> <span className="text-gray-900">{ageRange || "—"}</span>
            </p>
            <p className="text-sm text-gray-800">
              <span className="font-bold text-blue-900">Primary Concern:</span> <span className="text-gray-900">{primaryConcern || "—"}</span>
            </p>
            {analysisReport?.fitzpatrickType && (
              <p className="text-sm text-gray-800">
                <span className="font-bold text-blue-900">Fitzpatrick:</span> <span className="text-gray-900">{analysisReport.fitzpatrickType}</span>
              </p>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
            <p className="text-xs tracking-wider text-amber-900 font-bold uppercase">Top Signals</p>
          </div>
          {top.length ? (
            <ul className="space-y-2.5">
              {top.slice(0, 3).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 bg-white/60 px-3 py-2 rounded-lg">
                  <span className="font-semibold text-sm text-gray-900">{s.title}</span>
                  <RagPill score={typeof s.score === "number" ? s.score : NaN} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-700">Signals will appear here when available.</p>
          )}
        </div>
      </div>

      {/* Excerpt section */}
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 border-t border-gray-200 px-8 py-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
          </svg>
          <p className="text-xs tracking-wider text-gray-600 font-bold uppercase">Short Excerpt</p>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {excerpt || "Your short excerpt will appear here when the report loads."}
        </p>
      </div>
    </div>
  );
};

/* ---------------------------------------
   Accordion (multi-open) - ENHANCED
--------------------------------------- */
const AccordionSection = ({ id, title, subtitle, open, onToggle, children }) => {
  // Icon mapping for each section
  const getIcon = () => {
    switch(id) {
      case 'focus':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
          </svg>
        );
      case 'protocol':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
          </svg>
        );
      case 'paths':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C.817 14.769 2.156 18 4.828 18h10.343c2.673 0 4.012-3.231 2.122-5.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7zm2 6.172V4h2v4.172a3 3 0 00.879 2.12l1.027 1.028a4 4 0 00-2.171.102l-.47.156a4 4 0 01-2.53 0l-.563-.187a1.993 1.993 0 00-.114-.035l1.063-1.063A3 3 0 009 8.172z" clipRule="evenodd"/>
          </svg>
        );
      case 'structured_report':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
          </svg>
        );
      case 'report':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 002 2H4a2 2 0 01-2-2V5zm3 1h6v4H5V6zm6 6H5v2h6v-2z" clipRule="evenodd"/>
            <path d="M15 7h1a2 2 0 012 2v5.5a1.5 1.5 0 01-3 0V7z"/>
          </svg>
        );
      case 'future':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
          </svg>
        );
      case 'message':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
          </svg>
        );
      case 'guidance':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
          </svg>
        );
    }
  };

  return (
    <div className={`border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${open ? 'ring-2 ring-blue-100' : ''}`}>
      <button
        onClick={() => onToggle?.(id)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 transition-all duration-200 group"
        type="button"
        aria-expanded={open ? "true" : "false"}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className={`${open ? 'text-blue-600' : 'text-gray-500'} group-hover:text-blue-600 transition-colors`}>
            {getIcon()}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 group-hover:text-blue-900 transition-colors">{title}</p>
            {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          </div>
        </div>
        <div className={`${open ? 'text-blue-600 rotate-180' : 'text-gray-400'} group-hover:text-blue-600 font-bold text-2xl transition-all duration-200`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 transition-all duration-300 ease-in-out">
          {children}
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------
   Post-Image Reflection (BOTTOM ONLY)
--------------------------------------- */
const PostImageReflection = ({ onSeen }) => {
  const endRef = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const el = endRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0];
        if (entry?.isIntersecting) {
          setSeen(true);
          onSeen?.();
        }
      },
      { threshold: 0.6 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [seen, onSeen]);

  return (
    <div className="border border-gray-200 bg-gray-50 p-6">
      <h3 className="text-2xl font-bold text-gray-900 mb-2">A Message from Dr. Lazuk</h3>
      <p className="text-sm text-gray-700 mb-6">
        Take your time. This section is here so you can pause at your own readiness.
      </p>

      <div className="bg-white border border-gray-200 p-6">
        <div className="space-y-10">
          {REFLECTION_SECTIONS.map((s, idx) => (
            <div key={idx}>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        <div ref={endRef} className="h-1 w-full" />
      </div>

      <p className="mt-4 text-xs text-gray-600">
        When you’re ready, you can simply close this page — or return to it later.
      </p>
    </div>
  );
};

/* ---------------------------------------
   Agency Layer
--------------------------------------- */
const AgencyLayer = ({ onChoose }) => {
  return (
    <div className="border border-gray-200 bg-white p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-2">Possible Paths Forward</h3>
      <p className="text-sm text-gray-700 mb-6">
        Nothing here is required. Choose what feels supportive.
      </p>

      <div className="grid md:grid-cols-3 gap-3">
        <button
          onClick={() => onChoose?.("understand")}
          className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 p-5 text-left"
          type="button"
        >
          <p className="font-bold text-gray-900">Understand</p>
          <p className="text-sm text-gray-700 mt-1">
            View your Future Story projection (images).
          </p>
        </button>

        <button
          onClick={() => onChoose?.("guidance")}
          className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 p-5 text-left"
          type="button"
        >
          <p className="font-bold text-gray-900">Guidance</p>
          <p className="text-sm text-gray-700 mt-1">
            Explore products and treatments tailored to your concern.
          </p>
        </button>
        <button
          onClick={() => onChoose?.("esthetics")}
          className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 p-5 text-left"
          type="button"
        >
          <p className="font-bold text-gray-900">Esthetics</p>
          <p className="text-sm text-gray-700 mt-1">
            Explore esthetic treatments curated to your goals.
          </p>
        </button>
      </div>
    </div>
  );
};

/* ---------------------------------------
   Share + Save helpers (ethical gating)
--------------------------------------- */
const safeCopyToClipboard = async (text) => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
};

const dataUrlToFile = async (dataUrl, filename) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
};

const fetchUrlToFile = async (url, filename) => {
  const res = await fetch(url, { mode: "cors" });
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
};

const downloadImage = async (urlOrDataUrl, filename) => {
  try {
    let blob;
    if (String(urlOrDataUrl || "").startsWith("data:")) {
      const res = await fetch(urlOrDataUrl);
      blob = await res.blob();
    } else {
      const res = await fetch(urlOrDataUrl, { mode: "cors" });
      blob = await res.blob();
    }

    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    try {
      window.open(urlOrDataUrl, "_blank", "noopener,noreferrer");
      return false;
    } catch {
      return false;
    }
  }
};

const buildShareText = ({ label }) => {
  return `I tried Dr. Lazuk’s Identity Lock™ cosmetic skin analysis. Here is my “Future Story” preview (${label}).

This is cosmetic education only—not medical advice.

SkinDoctor.ai`;
};

const DermatologyApp = () => {
  // SPA mode switch: Esthetics Concierge
  if (typeof window !== "undefined" && window.location.pathname === "/esthetics-concierge") {
    return <EstheticsConciergeApp />;
  }

  const [activeTab, setActiveTab] = useState('home');
  const [step, setStep] = useState('photo');

  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);

  const [firstName, setFirstName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [primaryConcern, setPrimaryConcern] = useState('');
  const [visitorQuestion, setVisitorQuestion] = useState('');
  const [analysisReport, setAnalysisReport] = useState(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailingReport, setEmailingReport] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [captureGuidanceSeen, setCaptureGuidanceSeen] = useState(false);
  const [captureSupportMessage, setCaptureSupportMessage] = useState(null);

  // ✅ Debug-only: stores why we asked for a retake (NOT shown unless DEBUG_RETAKE)
  const [captureSupportReason, setCaptureSupportReason] = useState('');

  // ✅ Debug-only: store measured values used by the retake logic (NOT shown unless DEBUG_RETAKE)
  const [captureSupportDebug, setCaptureSupportDebug] = useState(null);
  // shape: { meanBrightness?: number, gradVar?: number, faceRatio?: number, faceCenter?: {cx:number, cy:number} }

  // ✅ Debug flag (localStorage-based) — safe to ship; only QA sees it
  const DEBUG_RETAKE =
    typeof window !== 'undefined' &&
    (window.localStorage.getItem('dl_debugRetake') === '1' ||
      window.localStorage.getItem('dl_debugRetake') === 'true');

  const [identityLockActivating, setIdentityLockActivating] = useState(false);
  const [identityLockEnabled, setIdentityLockEnabled] = useState(false);
  const [identityLockModalOpen, setIdentityLockModalOpen] = useState(false);

  const [reflectionSeen, setReflectionSeen] = useState(false);
  const [agencyChoice, setAgencyChoice] = useState(null);

// ✅ Accordion (multi-open)
const [openSections, setOpenSections] = useState({
  focus: false,
  paths: false,
  report: false,
  future: false,
  guidance: false,
  message: false,
  protocol: false
});

const toggleSection = (id) => {
  setOpenSections((prev) => ({ ...prev, [id]: !prev?.[id] }));
};

const openKeySections = () => {
  setOpenSections((prev) => ({
    ...prev,
    focus: true,
    protocol: true,
    paths: true,
    report: true
  }));
};

const collapseAll = () => {
  setOpenSections({
    focus: false,
    protocol: false,
    paths: false,
    report: false,
    future: false,
    guidance: false,
    message: false
  });
};


  const [shareToast, setShareToast] = useState(null);

  // ✅ NEW: email-step messaging (cooldown + patience notice)
  const [analysisUiError, setAnalysisUiError] = useState('');
  const [analysisUiNotice, setAnalysisUiNotice] = useState('');

  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hello! I am your Dr. Lazuk virtual assistant. I can help you think through your skincare in a cosmetic, educational way—but this chat is not medical advice.'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setShareToast(msg);
    window.setTimeout(() => setShareToast(null), 2400);
  };

  // Track page views
  useEffect(() => {
    const path = `/app/${activeTab}/${step}`;
    gaPageView(path, `DermatologyApp - ${activeTab} - ${step}`);
  }, [activeTab, step]);

  const drLazukProducts = [
    {
      name: 'Beneficial Face Cleanser with Centella Asiatica (Dermo Complex)',
      price: 139.99,
      category: 'Cleanser',
      benefits: ['Soothes irritation', 'Reduces redness', 'Strengthens barrier'],
      url: 'https://www.skindoctor.ai/product-page/beneficial-face-cleanser-with-centella-asiatica'
    },
    {
      name: 'Enriched Face Wash with Hyaluronic and Amino Acid',
      price: 169.99,
      category: 'Cleanser',
      benefits: ['Deep hydration', 'Plump skin', 'Strengthens barrier'],
      url: 'https://www.skindoctor.ai/product-page/enriched-face-wash-with-hyaluronic-and-amino-acid'
    },
    {
      name: 'Rehydrating Face Emulsion with Centella Asiatica and Peptides',
      price: 179.99,
      category: 'Moisturizer',
      benefits: ['Deep hydration', 'Anti-aging', 'Natural glow'],
      url: 'https://www.skindoctor.ai/product-page/rehydrating-face-emulsion-with-centella-asiatica-and-peptides'
    },
    {
      name: 'Concentrated Toner Pads with Hyaluronic Acid',
      price: 99.99,
      category: 'Toner',
      benefits: ['Pore-tightening', 'Tone-evening', 'Barrier-boosting'],
      url: 'https://www.skindoctor.ai/product-page/concentrated-toner-pads-with-hyaluronic-acid'
    },
    {
      name: 'Balancing Toner Pads with Niacinamide',
      price: 99.99,
      category: 'Toner',
      benefits: ['Brightening', 'Oil control', 'Radiant glow'],
      url: 'https://www.skindoctor.ai/product-page/balancing-toner-pads-with-niacinamide'
    },
    {
      name: 'Natural Mineral Sunscreen Protection',
      price: 79.99,
      category: 'Sunscreen',
      benefits: ['Zinc oxide protection', 'Botanical nourishment', 'No white cast'],
      url: 'https://www.skindoctor.ai/product-page/natural-mineral-sunscreen-protection'
    },
    {
      name: 'Hydrating Face Cloud Mask',
      price: 149.99,
      category: 'Mask',
      benefits: ['Tightens pores', 'Reduces fine lines', 'Deep hydration'],
      url: 'https://www.skindoctor.ai/product-page/revitalizing-hydrating-beauty-cleansing-face-cloud-mask'
    }
  ];

  const estheticServices = [
    {
      name: 'Luxury Beauty Facial (1.5-Hour Comprehensive)',
      description:
        'A deeply restorative facial that includes advanced cleansing, gentle exfoliation, extractions as needed, facial massage, hydration, and LED therapy as part of the treatment—not as a separate service.',
      benefits: [
        'Deep pore cleansing',
        'Improved tone and texture',
        'Intense hydration and glow',
        'Relaxation and stress relief'
      ],
      recommendFor: ['acne', 'texture', 'dryness', 'aging', 'redness'],
      whyRecommended:
        'Ideal when you want a full reset for your skin with multiple steps in a single visit, especially if you feel dull, congested, or dehydrated.'
    },
    {
      name: 'Roller Massage (Body Sculpt & Lymphatic Support)',
      description:
        'Micro-vibration roller therapy that boosts circulation, supports lymphatic drainage, reduces puffiness and the appearance of cellulite, and helps contour the body.',
      benefits: [
        'Lymphatic drainage and detox support',
        'Smoother-looking skin and cellulite reduction',
        'Improved circulation and lightness in legs',
        'Post-travel and post-workout recovery'
      ],
      recommendFor: ['texture', 'dryness', 'aging'],
      whyRecommended:
        'Best when you feel heavy, puffy, or sluggish in the body, or want a non-invasive sculpting and smoothing option with no downtime.'
    },
    {
      name: 'Candela eMatrix® RF Skin Rejuvenation',
      description:
        'Fractional radiofrequency treatment that targets fine lines, acne scars, large pores, and overall skin texture while being safe for many skin tones.',
      benefits: [
        'Softening of fine lines and wrinkles',
        'Improved acne scars and texture',
        'Smaller-looking pores',
        'Gradual collagen remodeling'
      ],
      recommendFor: ['aging', 'texture', 'acne', 'pigmentation'],
      whyRecommended:
        'Recommended when you want more than a facial can offer—especially for long-standing texture, scars, or fine lines—without committing to aggressive lasers.'
    },
    {
      name: 'PRP Skin Rejuvenation',
      description:
        'Platelet-rich plasma (PRP) from your own blood is used to stimulate collagen, improve texture, and rejuvenate delicate areas such as under the eyes.',
      benefits: [
        'Boosts collagen and elasticity',
        'Improves under-eye crepiness and dullness',
        'Softens acne scars and fine lines',
        'Longer-term regenerative benefits'
      ],
      recommendFor: ['aging', 'texture', 'pigmentation'],
      whyRecommended:
        'Ideal when you prefer a regenerative, “from your own body” approach to aging and texture, especially around the eyes and areas that look thin or tired.'
    },
    {
      name: 'PRP Hair Restoration',
      description:
        'PRP injections into the scalp to support hair follicles, improve hair density, and slow shedding in early to moderate thinning.',
      benefits: [
        'Supports hair follicle health',
        'Improves hair density over time',
        'Can reduce shedding in early thinning',
        'Natural option using your own plasma'
      ],
      recommendFor: ['aging'],
      whyRecommended:
        'Suggested if you are noticing early hair thinning or widening part lines and want to intervene before the hair loss becomes advanced.'
    },
    {
      name: 'HIEMT (High-Intensity Electromagnetic Therapy)',
      description:
        'Non-invasive treatment that contracts muscles thousands of times per session to improve core strength, tone, and body contour in areas like the abdomen and buttocks.',
      benefits: [
        'Improved muscle tone and strength',
        'More defined core or glute area',
        'Helps with posture and support',
        'Pairs well with lifestyle changes'
      ],
      recommendFor: ['aging', 'texture', 'dryness'],
      whyRecommended:
        'Recommended when you want a stronger, more sculpted look in combination with healthy movement, without surgery or downtime.'
    },
    {
      name: 'Beauty Injectables (Botox®, JUVÉDERM® Fillers, PRP)',
      description:
        'Customized injectable treatments to soften expression lines, restore volume, and enhance facial balance using Botox®, JUVÉDERM® fillers, and/or PRP.',
      benefits: [
        'Softens frown lines and crow’s feet',
        'Restores or enhances cheek and lip volume',
        'Improves facial harmony and balance',
        'Can look very natural when done conservatively'
      ],
      recommendFor: ['aging', 'texture', 'pigmentation'],
      whyRecommended:
        'Best when lines and volume loss are becoming visible and you want targeted, long-lasting improvements with a medical, artistic approach.'
    }
  ];

  const getRecommendedProducts = (concern) => {
    const recs = {
      acne: [0, 4, 5],
      aging: [2, 5, 1],
      pigmentation: [4, 5, 2],
      redness: [0, 2, 3],
      texture: [1, 4, 6],
      dryness: [1, 3, 2]
    };
    const indices = recs[concern] || [0, 2, 5];
    return indices.map((i) => drLazukProducts[i]).filter(Boolean);
  };

  const getRecommendedServices = (concern) => {
    return estheticServices.filter((s) => s.recommendFor.includes(concern)).slice(0, 2);
  };

  // ✅ Updated: supports reasonCode + debug metrics (stored but only shown when DEBUG_RETAKE)
  const showSupportiveRetake = (message, reasonCode = "", debug = null) => {
    setCaptureSupportReason(String(reasonCode || ""));
    setCaptureSupportDebug(debug || null);

    setCaptureSupportMessage(`${message}

${SUPPORTIVE_FOOTER_LINE}`);
  };

  const startCamera = async () => {
    gaEvent('camera_start_clicked', { step });

    // Clear support UI (and debug) on a new attempt
    setCaptureSupportMessage(null);
    setCaptureSupportReason("");
    setCaptureSupportDebug(null);

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      showSupportiveRetake(lock.message, "locked_30_days", null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        gaEvent('camera_started', { step });
      }
    } catch (err) {
      gaEvent('camera_error', { step });
      showSupportiveRetake('Unable to access camera. Please ensure camera permissions are granted.', "camera_error", null);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    gaEvent('camera_stopped', { step });
  };

  const capturePhoto = async () => {
    gaEvent('camera_capture_clicked', { step });

    // Clear support UI (and debug) on each capture attempt
    setCaptureSupportMessage(null);
    setCaptureSupportReason("");
    setCaptureSupportDebug(null);

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      showSupportiveRetake(lock.message, "locked_30_days", null);
      return;
    }

    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const faceCheck = await detectFaceInImageElement(canvas);
      if (!faceCheck.ok) {
        const result = registerFaceFailure();
        gaEvent('face_not_detected', { source: 'camera', lockedNow: !!result.lockedNow });
        showSupportiveRetake(
          result.message,
          result.lockedNow ? "locked_30_days" : "non_face",
          null
        );
        stopCamera();
        return;
      }

      clearFaceFailures();
      let imageData = canvas.toDataURL('image/jpeg');

      try {
        imageData = await downscaleDataUrl(imageData, 960, 0.92);
      } catch {}

      try {
        const q = await validateCapturedImage({
          dataUrl: imageData,
          faces: faceCheck.faces
        });

        if (!q.ok) {
          gaEvent('retake_requested', { source: 'camera', reason: q.code });
          showSupportiveRetake(q.message, q.code, q.debug || null);
          return;
        }
        if (q.warning) {
          gaEvent('quality_warning', { source: 'camera', reason: q.code });
          setCaptureSupportReason(q.code);
          setCaptureSupportMessage(q.message);
        } else {
          setCaptureSupportReason('');
          setCaptureSupportMessage('');
        }

      } catch {
        gaEvent('quality_check_soft_pass', { source: 'camera' });
      }

      setCapturedImage(imageData);
      stopCamera();

      setIdentityLockEnabled(false);
      setIdentityLockActivating(true);
      gaEvent('identity_lock_activation_started', { source: 'capture' });

      gaEvent('selfie_captured', { source: 'camera' });
    }
  };

  const handleFileUpload = async (e) => {
    gaEvent('upload_clicked', { step });

    // Clear support UI (and debug) on a new upload attempt
    setCaptureSupportMessage(null);
    setCaptureSupportReason("");
    setCaptureSupportDebug(null);

    const file = e.target.files[0];
    if (!file) return;

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      showSupportiveRetake(lock.message, "locked_30_days", null);
      try { e.target.value = ""; } catch {}
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let dataUrl = event.target.result;

      const faceCheck = await detectFaceFromDataUrl(dataUrl);
      if (!faceCheck.ok) {
        const result = registerFaceFailure();
        gaEvent('face_not_detected', { source: 'upload', lockedNow: !!result.lockedNow });
        showSupportiveRetake(
          result.message,
          result.lockedNow ? "locked_30_days" : "non_face",
          null
        );
        try { e.target.value = ""; } catch {}
        return;
      }

      clearFaceFailures();

      try {
        dataUrl = await downscaleDataUrl(dataUrl, 960, 0.92);
      } catch {}

      try {
        const q = await validateCapturedImage({
          dataUrl,
          faces: faceCheck.faces
        });

        if (!q.ok) {
          gaEvent('retake_requested', { source: 'upload', reason: q.code });
          showSupportiveRetake(q.message, q.code, q.debug || null);
          try { e.target.value = ""; } catch {}
          return;
        }
        if (q.warning) {
          gaEvent('quality_warning', { source: 'upload', reason: q.code });
          setCaptureSupportReason(q.code);
          setCaptureSupportMessage(q.message);
        } else {
          setCaptureSupportReason('');
          setCaptureSupportMessage('');
        }

      } catch {
        gaEvent('quality_check_soft_pass', { source: 'upload' });
      }

      setCapturedImage(dataUrl);

      setIdentityLockEnabled(false);
      setIdentityLockActivating(true);
      gaEvent('identity_lock_activation_started', { source: 'upload' });

      gaEvent('selfie_uploaded', { source: 'upload' });

      try { e.target.value = ""; } catch {}
    };
    reader.readAsDataURL(file);
  };

  const handleQuestionsSubmit = () => {
    if (!ageRange || !primaryConcern) {
      gaEvent('questions_incomplete', { ageRangeFilled: !!ageRange, concernFilled: !!primaryConcern });
      showSupportiveRetake('Please answer all required questions so Dr. Lazuk can tailor your analysis.', "questions_incomplete", null);
      return;
    }
    gaEvent('questions_submitted', { ageRange, primaryConcern });
    setStep('email');
  };

  const performAnalysis = async () => {
    setAnalysisUiError('');
    setAnalysisUiNotice('Analysis can take up to 60 seconds to complete. Thank you for your patience.');
    setEmailSubmitting(true);

    const gaClientId = await getGaClientId();

    gaEvent('analysis_submit', {
      primaryConcern,
      ageRange,
      hasVisitorQuestion: !!(visitorQuestion || '').trim(),
      hasFirstName: !!(firstName || '').trim(),
      hasEmail: !!(userEmail || '').trim(),
      hasSelfie: !!capturedImage
    });

    try {
      // STEP 1: Vision analysis (concrete “image proof” + checklist15 + fitz/skinType)
      gaEvent('vision_analyze_start', { primaryConcern, ageRange });

      const vision = await callAnalyzeImage({
        imageBase64: capturedImage,
        notes: [
          `Age range: ${ageRange || 'unknown'}`,
          `Primary concern: ${primaryConcern || 'unknown'}`,
          visitorQuestion ? `Question: ${visitorQuestion}` : null
        ].filter(Boolean).join('\n')
      });

      gaEvent('vision_analyze_success', {
        hasFitz: !!vision?.fitzpatrickType,
        hasSkinType: !!vision?.skinType,
        hasChecklist15: !!vision?.analysis?.checklist15
      });

      // STEP 2: Compose + email + aging images
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName,
          email: userEmail,
          ageRange,
          primaryConcern,
          visitorQuestion,
          photoDataUrl: capturedImage,
          gaClientId,

          // ✅ NEW: pass the vision payload through (additive)
          incomingImageAnalysis: vision
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const msg = data?.message || data?.error || 'Error generating report';

        if (response.status === 429 || data?.error === 'cooldown_active') {
          setAnalysisUiError(String(msg));
          gaEvent('analysis_cooldown', {
            primaryConcern,
            ageRange,
            message: String(msg).slice(0, 160)
          });
          return;
        }

        gaEvent('analysis_error', {
          primaryConcern,
          ageRange,
          message: String(msg).slice(0, 120)
        });
        throw new Error(msg);
      }

      setReflectionSeen(false);
      setAgencyChoice(null);

      setAnalysisReport({
        report: data.report,
        recommendedProducts: getRecommendedProducts(primaryConcern),
        recommendedServices: getRecommendedServices(primaryConcern),
        fitzpatrickType: data.fitzpatrickType || null,
        fitzpatrickSummary: data.fitzpatrickSummary || null,
        agingPreviewImages: data.agingPreviewImages || null,
        areasOfFocus: data.areasOfFocus || data.focusAreas || null,

        // ✅ ONE protocol recommendation (server-authoritative)
        protocolRecommendation: data.protocolRecommendation || data.protocol_recommendation || data.protocol || null,
        protocolPrimary: (data.protocolRecommendation || data.protocol_recommendation)?.primary || null,
        protocolSecondary: (data.protocolRecommendation || data.protocol_recommendation)?.secondary || null,
        protocolNonExclusivityClause: (data.protocolRecommendation || data.protocol_recommendation)?.clause || null,
        conditionWeighting: data.condition_weighting || data.conditionWeighting || data.canonical_payload?.condition_weighting || null,
        structuredReportSections: data.structured_report_sections || data.structuredReportSections || null,

        // ✅ Server-authoritative visualization payload (clusters + scores)
        canonical_payload:
          data.canonical_payload ||
          data.visual_payload ||
          data.visualPayload ||
          data.dermatologyEngine?.visual_payload ||
          null,

        // ✅ Optional meta for debugging / future UI (additive)
        engine_meta: data.engine_meta || data.dermatologyEngine?.meta || null
      });

      gaEvent('analysis_success', {
        primaryConcern,
        ageRange,
        hasFitz: !!(data.fitzpatrickType || data.fitzpatrickSummary),
        hasAgingPreviews: !!(
          (Array.isArray(data?.agingPreviewImages) && data.agingPreviewImages.length) ||
          data?.agingPreviewImages?.noChange10 ||
          data?.agingPreviewImages?.noChange20 ||
          data?.agingPreviewImages?.withCare10 ||
          data?.agingPreviewImages?.withCare20
        ),
        hasAreasOfFocus: !!(data?.areasOfFocus || data?.focusAreas)
      });

      setStep('results');
    } catch (error) {
      console.error('Analysis error:', error);

      const msg = error?.message || 'There was an error. Please try again.';
      setAnalysisUiError(msg);

      gaEvent('analysis_error', {
        message: String(msg).slice(0, 160),
        status: error?.status || 'unknown'
      });

      showSupportiveRetake(msg, "analysis_error", null);
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleEmailSubmit = async () => {
    const fn = String(firstName || '').trim();
    if (!fn) {
      gaEvent('email_step_error', { reason: 'missing_first_name' });
      showSupportiveRetake('Please enter your first name.', "missing_first_name", null);
      setAnalysisUiError('Please enter your first name.');
      return;
    }

    if (!userEmail || !userEmail.includes('@')) {
      gaEvent('email_step_error', { reason: 'invalid_email' });
      showSupportiveRetake('Please enter a valid email address.', "invalid_email", null);
      setAnalysisUiError('Please enter a valid email address.');
      return;
    }

    gaEvent('email_step_submitted', { hasFirstName: true, hasEmail: true });
    await performAnalysis();
  };

  // Helper to format long text into readable paragraphs
  const formatLongText = (text) => {
    if (!text) return [];
    
    // Split on double newlines first (if they exist)
    let paragraphs = text.split('\n\n');
    
    // If no double newlines, split long text intelligently
    if (paragraphs.length === 1 && text.length > 500) {
      // Split on sentence endings followed by space and capital letter
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      paragraphs = [];
      let currentParagraph = '';
      
      sentences.forEach((sentence, idx) => {
        currentParagraph += sentence;
        
        // Create new paragraph every 3-4 sentences or ~300 chars
        if ((idx + 1) % 3 === 0 || currentParagraph.length > 300) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
      });
      
      if (currentParagraph) {
        paragraphs.push(currentParagraph.trim());
      }
    }
    
    return paragraphs.filter(p => p.trim());
  };

  // Handle email report request
  const handleEmailReport = async () => {
    if (!analysisReport || !userEmail) {
      showToast('Please provide your email address first.');
      return;
    }
    
    setEmailingReport(true);
    
    try {
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          email: userEmail,
          analysisReport,
          futureStoryImages
        })
      });
      
      if (response.ok) {
        setEmailSent(true);
        showToast('Report sent! Check your email.');
        gaEvent('email_report_sent', { firstName });
      } else {
        showToast('Failed to send email. Please try again.');
      }
    } catch (error) {
      console.error('Email error:', error);
      showToast('Failed to send email. Please try again.');
    }
    
    setEmailingReport(false);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage.trim();
    const newHistory = [...chatMessages, { role: 'user', content: userMsg }];

    setChatMessages(newHistory);
    setInputMessage('');
    setChatLoading(true);

    gaEvent('chat_send', { chars: userMsg.length });

    try {
      const res = await fetch('/api/ask-dr-lazuk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          isFirstReply: chatMessages.length <= 1
        })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        gaEvent('chat_error', { message: String(data?.message || 'backend_error').slice(0, 120) });
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              data.message ||
              'I’m having trouble connecting right now. Please try again in a moment.'
          }
        ]);
        setChatLoading(false);
        return;
      }

      gaEvent('chat_success', { replyChars: String(data.reply || '').length });
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      console.error('Chat error:', error);
      gaEvent('chat_error', { message: 'network_or_exception' });
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I apologize but I am having trouble connecting. Please try again.'
        }
      ]);
    }

    setChatLoading(false);
  };

    const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      // no-op
    }
  };

const resetAnalysis = () => {
    gaEvent('analysis_reset', { fromStep: step });

    setCapturedImage(null);
    setAnalysisReport(null);
    setStep('photo');
    setAgeRange('');
    setPrimaryConcern('');
    setVisitorQuestion('');
    setUserEmail('');
    setFirstName('');
    setCameraActive(false);
    setCaptureGuidanceSeen(false);
    setCaptureSupportMessage(null);

    // ✅ reset debug-only states too
    setCaptureSupportReason("");
    setCaptureSupportDebug(null);

    setIdentityLockEnabled(false);
    setIdentityLockActivating(false);
    setReflectionSeen(false);
    setAgencyChoice(null);

    setAnalysisUiError('');
    setAnalysisUiNotice('');
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const agingPreviewImages = analysisReport?.agingPreviewImages || null;

  // Supports either:
  //  - legacy 4-image payload: { noChange10, noChange20, withCare10, withCare20 }
  //  - new single composite tile payload: { tile: "https://..." }
  const agingTile =
    agingPreviewImages && typeof agingPreviewImages === "object"
      ? (agingPreviewImages.tile || agingPreviewImages.agingTile || null)
      : null;

  const agingImages = useMemo(() => {
    const p = (agingPreviewImages && typeof agingPreviewImages === "object") ? agingPreviewImages : {};

    // Preferred: single composite image
    if (agingTile) {
      return [{ key: "tile", label: "Aging Preview (Composite)", url: agingTile }];
    }

    // Fallback: legacy 4 images
    return [
      { key: "noChange10", label: "10 Years (No Change)", url: p.noChange10 || null },
      { key: "noChange20", label: "20 Years (No Change)", url: p.noChange20 || null },
      { key: "withCare10", label: "10 Years (With Care)", url: p.withCare10 || null },
      { key: "withCare20", label: "20 Years (With Care)", url: p.withCare20 || null },
    ].filter((x) => Boolean(x.url));
  }, [agingPreviewImages, agingTile]);

  const hasAgingTile = agingImages.length === 1 && agingImages[0]?.key === "tile";


  const handleShare = async ({ url, label }) => {
    if (!reflectionSeen) {
      gaEvent("share_blocked_before_reflection", { label });
      showToast("Take your time — sharing becomes available after you’ve read Dr. Lazuk’s note.");
      return;
    }

    const shareText = buildShareText({ label });
    gaEvent("share_clicked", { label });

    try {
      if (navigator?.canShare) {
        let file = null;
        const filename = `skindoctor_future_story_${label.replace(/\s+/g, "_").toLowerCase()}.jpg`;

        try {
          if (String(url).startsWith("data:")) file = await dataUrlToFile(url, filename);
          else file = await fetchUrlToFile(url, filename);
        } catch {
          file = null;
        }

        if (file && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "SkinDoctor.ai — Future Story",
            text: shareText
          });
          gaEvent("share_success", { label, mode: "file" });
          return;
        }
      }

      if (navigator?.share) {
        await navigator.share({
          title: "SkinDoctor.ai — Future Story",
          text: shareText
        });
        gaEvent("share_success", { label, mode: "text" });
        return;
      }
    } catch {}

    const ok = await safeCopyToClipboard(shareText);
    gaEvent("share_fallback", { label, copied: ok ? 1 : 0 });
    showToast(ok ? "Share text copied to clipboard." : "Copy failed—please select and copy manually.");
  };

  const handleCopyImageLink = async ({ url, label }) => {
    if (!reflectionSeen) {
      gaEvent("copy_link_blocked_before_reflection", { label });
      showToast("Take your time — copying becomes available after you’ve read Dr. Lazuk’s note.");
      return;
    }
    const ok = await safeCopyToClipboard(String(url));
    gaEvent("copy_image_link", { label, copied: ok ? 1 : 0 });
    showToast(ok ? "Image link copied." : "Copy failed—please select and copy manually.");
  };

  const handleSave = async ({ url, label }) => {
    if (!reflectionSeen) {
      gaEvent("save_blocked_before_reflection", { label });
      showToast("Take your time — saving becomes available after you’ve read Dr. Lazuk’s note.");
      return;
    }
    gaEvent("save_clicked", { label });
    const filename = `skindoctor_future_story_${label.replace(/\s+/g, "_").toLowerCase()}.jpg`;
    const ok = await downloadImage(url, filename);
    gaEvent("save_complete", { label, openedNewTab: ok ? 0 : 1 });
    showToast(ok ? "Saved." : "Opened in a new tab (download may depend on your device).");
  };

  return (
    <div className="min-h-screen bg-white">
      {identityLockActivating && (
        <IdentityLockOverlay
          onComplete={() => {
            setIdentityLockActivating(false);
            setIdentityLockEnabled(true);
            gaEvent('identity_lock_activated', { source: 'overlay' });
            setStep('questions');
          }}
        />
      )}

      {identityLockModalOpen && (
        <Modal
          title="Identity Lock™ Technology Active"
          body={
            "This projection is not a generic filter or a randomized aging overlay.\n\nTo ensure consistency, our AI locks onto key proportional landmarks so your ‘Future Story’ remains anchored to your unique facial architecture and bone structure.\n\nThis represents a personalized cosmetic projection based on your current skin data."
          }
          onClose={() => setIdentityLockModalOpen(false)}
        />
      )}

      {shareToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 text-sm shadow-lg">
          {shareToast}
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white shadow-2xl relative overflow-hidden">
        {/* Subtle decorative pattern overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }}></div>
        
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 relative z-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-center sm:justify-between gap-4 sm:gap-0 text-center sm:text-left">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent" style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                DR. LAZUK
              </h1>
              <p className="text-xs sm:text-sm mt-1 text-blue-200 tracking-widest font-light">
                ESTHETICS | COSMETICS | BIOTICS | NUTRITION
              </p>
            </div>
            <div className="text-center sm:text-right">
              <div className="inline-block bg-white/10 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-white/20">
                <p className="text-xs text-blue-100 uppercase tracking-wider font-semibold">
                  Virtual Skincare Analysis
                </p>
              </div>
              <p className="text-xs sm:text-sm text-blue-100 mt-2 sm:mt-3 italic">Enhancing the Beautiful You, Naturally</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b-2 border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-1">
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => {
                setActiveTab('home');
                gaEvent('tab_changed', { tab: 'home' });
              }}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-200 relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'home'
                  ? 'text-blue-900 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              type="button"
            >
              {activeTab === 'home' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400"></div>
              )}
              <Camera size={18} strokeWidth={2.5} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Skin Analysis</span>
              <span className="sm:hidden">Analysis</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('chat');
                gaEvent('tab_changed', { tab: 'chat' });
              }}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-200 relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'chat'
                  ? 'text-blue-900 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              type="button"
            >
              {activeTab === 'chat' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400"></div>
              )}
              <MessageCircle size={18} strokeWidth={2.5} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Ask Dr. Lazuk</span>
              <span className="sm:hidden">Ask Dr. L</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('education');
                gaEvent('tab_changed', { tab: 'education' });
              }}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-200 relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'education'
                  ? 'text-blue-900 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              type="button"
            >
              {activeTab === 'education' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400"></div>
              )}
              <BookOpen size={18} strokeWidth={2.5} className="sm:w-5 sm:h-5" />
              <span>Services</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('concierge');
                gaEvent('tab_changed', { tab: 'concierge' });
              }}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-semibold transition-all duration-200 relative whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'concierge'
                  ? 'text-blue-900 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              type="button"
            >
              {activeTab === 'concierge' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400"></div>
              )}
              <Sparkles size={18} strokeWidth={2.5} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Esthetics Concierge</span>
              <span className="sm:hidden">Concierge</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'home' && (
          <div className="bg-white border border-gray-200 shadow-sm p-8">
            {step === 'photo' && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="text-gray-900" size={28} />
                  <h2 className="text-2xl font-bold text-gray-900">Virtual Skin Analysis</h2>
                </div>

                <div className="bg-gray-100 border border-gray-300 p-4 mb-4 flex items-start gap-3">
                  <Info className="text-gray-700 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-gray-800">
                    <strong>Disclaimer:</strong> This interactive skin analysis is intended{' '}
                    <strong>for entertainment and cosmetic education only</strong> and is{' '}
                    <strong>not medical advice</strong>. No medical conditions will be evaluated,
                    diagnosed, or treated during this analysis.
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-300 p-6 mb-6">
                  <div className="flex items-start gap-3">
                    <Info className="text-gray-700 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {CAPTURE_PREP_COPY.title}
                      </h3>
                      <p className="text-sm text-gray-700 mt-1">
                        {CAPTURE_PREP_COPY.subtitle}
                      </p>
                      <p className="text-sm text-gray-700 mt-4">
                        {CAPTURE_PREP_COPY.intro}
                      </p>

                      <div className="mt-4 space-y-3">
                        {CAPTURE_PREP_COPY.bullets.map((b, i) => (
                          <div key={i}>
                            <p className="text-sm font-bold text-gray-900">{b.head}</p>
                            <p className="text-sm text-gray-700">{b.body}</p>
                          </div>
                        ))}
                      </div>

                      <p className="text-sm text-gray-700 mt-4">
                        {CAPTURE_PREP_COPY.outro}
                      </p>

                      {!captureGuidanceSeen && (
                        <button
                          onClick={() => {
                            setCaptureGuidanceSeen(true);
                            setCaptureSupportMessage(null);
                            setCaptureSupportReason("");
                            setCaptureSupportDebug(null);
                            gaEvent('capture_guidance_seen', { step: 'photo' });
                          }}
                          className="mt-5 bg-gray-900 text-white px-6 py-3 font-bold hover:bg-gray-800"
                          type="button"
                        >
                          I Understand — Continue
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {captureSupportMessage && (
                  <div className="bg-white border border-gray-300 p-5 mb-6">
                    {/* ✅ Debug-only "why" line */}
                    {DEBUG_RETAKE && captureSupportReason && (
                      <div className="text-[12px] text-gray-600 mb-2">
                        Reason: <span className="font-mono">{captureSupportReason}</span>
                      </div>
                    )}

                    {/* ✅ Debug-only measured metrics */}
                    {DEBUG_RETAKE && captureSupportDebug && (
                      <div className="text-[12px] text-gray-600 mb-3 space-y-1">
                        {"meanBrightness" in captureSupportDebug && (
                          <div>
                            brightness:{" "}
                            <span className="font-mono">{captureSupportDebug.meanBrightness}</span>
                          </div>
                        )}
                        {"gradVar" in captureSupportDebug && (
                          <div>
                            blurVar:{" "}
                            <span className="font-mono">{captureSupportDebug.gradVar}</span>
                          </div>
                        )}
                        {"faceRatio" in captureSupportDebug && (
                          <div>
                            faceRatio:{" "}
                            <span className="font-mono">{captureSupportDebug.faceRatio}</span>
                          </div>
                        )}
                        {captureSupportDebug?.faceCenter && (
                          <div>
                            faceCenter:{" "}
                            <span className="font-mono">
                              cx={captureSupportDebug.faceCenter.cx}, cy={captureSupportDebug.faceCenter.cy}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {captureSupportMessage}
                    </p>
                  </div>
                )}

                {!captureGuidanceSeen && (
                  <div className="text-sm text-gray-600">
                    Please read the preparation guidance above to ensure the most accurate results.
                  </div>
                )}

                {!capturedImage && !cameraActive && (
                  <div className={`grid md:grid-cols-1 gap-6 ${!captureGuidanceSeen ? 'opacity-40 pointer-events-none' : ''}`}>
                    <button
                      onClick={() => {
                        gaEvent('upload_open_picker', { step });
                        fileInputRef.current?.click();
                      }}
                      className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-400 hover:border-gray-900 hover:bg-gray-50 transition-all"
                      type="button"
                    >
                      <Upload size={56} className="text-gray-900 mb-4" />
                      <span className="font-bold text-gray-900 text-lg">Upload Photo</span>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                )}

                {cameraActive && (
                  <div className="space-y-4">
                    <div className="relative bg-black overflow-hidden">
                      <video ref={videoRef} autoPlay playsInline className="w-full" />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={capturePhoto}
                        className="px-8 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800"
                        type="button"
                      >
                        Capture
                      </button>
                      <button
                        onClick={stopCamera}
                        className="px-8 py-3 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400"
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 'questions' && capturedImage && (
              <div className="space-y-6">
                <div className="relative max-w-md mx-auto">
                  <img src={capturedImage} alt="Your photo" className="w-full border border-gray-300" />
                </div>

                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-gray-50 border border-gray-300 p-6">
                    <h3 className="font-bold text-gray-900 mb-4 text-lg">Tell Us About Your Skin</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Age Range *
                        </label>
                        <select
                          value={ageRange}
                          onChange={(e) => setAgeRange(e.target.value)}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
                        >
                          <option value="">Select</option>
                          <option value="teens">Teens</option>
                          <option value="20s">20s</option>
                          <option value="30s">30s</option>
                          <option value="40s">40s</option>
                          <option value="50s">50s</option>
                          <option value="60+">60+</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Primary Concern *
                        </label>
                        <select
                          value={primaryConcern}
                          onChange={(e) => setPrimaryConcern(e.target.value)}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
                        >
                          <option value="">Select</option>
                          <option value="acne">Acne</option>
                          <option value="aging">Aging</option>
                          <option value="pigmentation">Pigmentation</option>
                          <option value="redness">Redness</option>
                          <option value="texture">Texture</option>
                          <option value="dryness">Dryness</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Question (Optional)
                        </label>
                        <textarea
                          value={visitorQuestion}
                          onChange={(e) => setVisitorQuestion(e.target.value)}
                          rows="3"
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handlePrint}
                      className="px-6 py-3 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400"
                      type="button"
                    >
                      Start Over
                    </button>
                    <button
                      onClick={handleQuestionsSubmit}
                      className="flex-1 px-6 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800"
                      type="button"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 'email' && (
              <div className="max-w-xl mx-auto">
                <div className="bg-gray-900 text-white p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <Mail size={32} />
                    <h3 className="text-2xl font-bold">Get Your Analysis</h3>
                  </div>
                  <p className="text-gray-300 mb-6">
                    Enter your first name and email to receive your complete cosmetic report.
                    A copy will also be sent to our clinic team.
                  </p>

                  <div className="space-y-4">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      placeholder="First name"
                      className="w-full px-4 py-3 bg-white text-gray-900 border-2"
                    />
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      placeholder="your.email@example.com"
                      className="w-full px-4 py-3 bg-white text-gray-900 border-2"
                    />

                    <button
                      onClick={handleEmailSubmit}
                      disabled={emailSubmitting}
                      className="w-full px-6 py-3 bg-white text-gray-900 font-bold hover:bg-gray-200 disabled:bg-gray-400 flex items-center justify-center gap-2"
                      type="button"
                    >
                      {emailSubmitting ? (
                        <>
                          <Loader className="animate-spin" size={20} />
                          <span>Analyzing...</span>
                        </>
                      ) : (
                        'View Results'
                      )}
                    </button>

                    {emailSubmitting && (
                      <p className="text-xs text-gray-300 mt-2">
                        {analysisUiNotice || "Analysis can take up to 60 seconds to complete. Thank you for your patience."}
                      </p>
                    )}

                    {analysisUiError && (
                      <div className="mt-3 bg-white/10 border border-white/20 p-4">
                        <p className="text-sm text-white whitespace-pre-wrap">
                          {analysisUiError}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            
{step === 'results' && analysisReport && (
  <div className="space-y-6">
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-600 px-8 py-6 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-3xl font-extrabold text-gray-900">
            <span className="text-blue-600">{firstName || "Your"}</span>, Your Personal Roadmap To Skin Health
          </h3>
          <p className="text-sm text-gray-600 mt-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Provided by SkinDoctor.ai®
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all duration-200 rounded-lg"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Print / Save</span>
        </button>
      </div>
    </div>

    {/* ✅ Default summary view (always visible) */}
    <SummaryCard
      ageRange={ageRange}
      primaryConcern={primaryConcern}
      analysisReport={analysisReport}
    />

    {/* 📧 Email Report Button - TOP */}
    {!emailSent && (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-4 sm:p-6 shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
          <div className="flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Mail className="text-blue-600 flex-shrink-0" size={20} />
              <span className="leading-tight">Get Your Complete Report via Email</span>
            </h3>
            <p className="text-sm sm:text-base text-gray-600">
              Includes your full analysis, aging projections, and personalized recommendations
            </p>
          </div>
          <button
            onClick={handleEmailReport}
            disabled={emailingReport}
            className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap text-sm sm:text-base"
            type="button"
          >
            {emailingReport ? (
              <>
                <Loader className="animate-spin" size={18} />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Mail size={18} />
                <span>Email My Report</span>
              </>
            )}
          </button>
        </div>
      </div>
    )}

    {emailSent && (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 sm:p-6 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-green-900">Report Sent!</h3>
            <p className="text-sm sm:text-base text-green-700">Check your email for your complete analysis</p>
          </div>
        </div>
      </div>
    )}

    <div className="flex flex-wrap gap-3 items-center mb-4">
      <button
        onClick={openKeySections}
        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg text-sm"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
        </svg>
        Expand Key Sections
      </button>
      <button
        onClick={collapseAll}
        className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 font-semibold hover:bg-gray-50 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg text-sm border-2 border-gray-200"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
        Collapse All
      </button>
      <div className="flex items-center gap-2 ml-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-xs text-gray-600 font-medium">Multi-open enabled</p>
      </div>
    </div>

    <div className="space-y-3">
      <AccordionSection
        id="focus"
        title="Areas of Focus"
        subtitle="The top signals most relevant right now (condensed)."
        open={!!openSections.focus}
        onToggle={toggleSection}
      >
        <AreasOfFocusCard areas={analysisReport?.areasOfFocus} />
      </AccordionSection>

      <AccordionSection
        id="protocol"
        title={`${(analysisReport?.clientName || "Your")}, Your Curated Protocol`}
      >
        <div className="mt-4 border rounded-2xl p-5 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-500">Your Recommended Protocol</div>
              <div className="mt-1 text-lg font-extrabold text-gray-900">
                {analysisReport?.protocolRecommendation?.name || "Your Curated Protocol"}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {analysisReport?.protocolRecommendation?.summary ||
                  "Your protocol details will populate here after a successful analysis."}
              </div>
            </div>

            {analysisReport?.protocolRecommendation?.url ? (
              <a
                href={analysisReport.protocolRecommendation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center justify-center rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-black"
                onClick={() =>
                  gaEvent('protocol_view_click', {
                    protocolName: analysisReport.protocolRecommendation?.name || 'curated_protocol',
                  })
                }
              >
                View Protocol
              </a>
            ) : null}
          </div>

          {Array.isArray(analysisReport?.protocolRecommendation?.products) &&
          analysisReport.protocolRecommendation.products.length > 0 ? (
            <div className="mt-4">
              <div className="text-sm font-semibold text-gray-900">What's included</div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {analysisReport.protocolRecommendation.products.map((p, idx) => (
                  <div key={p?.name || idx} className="text-sm text-gray-700">
                    • {p?.name || p}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </AccordionSection>


      <AccordionSection
        id="paths"
        title="Possible Paths Forward"
        subtitle="Optional. Choose a lens (Understand / Guidance)."
        open={!!openSections.paths}
        onToggle={toggleSection}
      >
        <AgencyLayer
          onChoose={(choice) => {
            setAgencyChoice(choice);
            gaEvent('agency_choice', { choice });

            if (choice === "esthetics") {
              window.location.assign("/esthetics-concierge");
            }
          }}
        />

        {agencyChoice === 'understand' && (
          <div className="mt-6">
            {agingImages.length > 0 ? (
              <div className="bg-white border border-gray-200 p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-2">
                  Your Future Story (Cosmetic Projection)
                </h4>
                <p className="text-sm text-gray-700 mb-6">
                  These are visual projections anchored to your selfie.
                </p>

                <div className={`grid gap-4 ${hasAgingTile ? "" : "md:grid-cols-2"}`}>
                  {agingImages.map((img) => (
                    <div key={img.key} className="relative border border-gray-200 bg-gray-50 p-3">
                      <IdentityLockBadge
                        placement="top-left"
                        onClick={() => {
                          gaEvent('identity_lock_badge_clicked', { key: img.key });
                          setIdentityLockModalOpen(true);
                        }}
                      />

                      <WatermarkOverlay />

                      <img
                        src={img.url}
                        alt={img.label}
                        className="w-full border border-gray-200"
                        onLoad={() => gaEvent('aging_image_loaded', { key: img.key })}
                      />

                      <p className="text-sm font-bold text-gray-900 mt-3">{img.label}</p>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleShare({ url: img.url, label: img.label })}
                          className="py-2 text-sm font-bold border bg-gray-900 text-white hover:bg-gray-800 border-gray-900"
                          type="button"
                        >
                          Share
                        </button>

                        <button
                          onClick={() => handleSave({ url: img.url, label: img.label })}
                          className="py-2 text-sm font-bold border bg-white text-gray-900 hover:bg-gray-50 border-gray-300"
                          type="button"
                        >
                          Save
                        </button>

                        <button
                          onClick={() => handleCopyImageLink({ url: img.url, label: img.label })}
                          className="py-2 text-sm font-bold border bg-white text-gray-900 hover:bg-gray-50 border-gray-300"
                          type="button"
                        >
                          Copy
                        </button>
                      </div>

                      {!reflectionSeen && (
                        <p className="text-xs text-gray-600 mt-3">
                          Sharing/saving activates after you read Dr. Lazuk’s note below.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 p-6">
                <p className="text-sm text-gray-700">
                  Your Future Story images are not available for this result.
                </p>
              </div>
            )}
          </div>
        )}

        {agencyChoice === 'guidance' && (
          <div className="mt-6 bg-white border-2 border-gray-900 p-8">
            <h4 className="font-bold text-gray-900 mb-4 text-2xl">Recommended Products (Dr. Lazuk Cosmetics®)</h4>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              {analysisReport.recommendedProducts.map((p, i) => (
                <div key={i} className="bg-gray-50 border p-4">
                  <h5 className="font-bold text-gray-900 mb-1">{p.name}</h5>
                  <p className="text-gray-900 font-bold mb-2">${p.price}</p>
                  <ul className="text-sm text-gray-700 mb-3">
                    {p.benefits.map((b, j) => (
                      <li key={j}>✓ {b}</li>
                    ))}
                  </ul>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      gaEvent('product_click', {
                        productName: p.name,
                        category: p.category,
                        price: p.price,
                        primaryConcern
                      })
                    }
                    className="block text-center bg-gray-900 text-white py-2 font-bold hover:bg-gray-800"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>

            <h4 className="font-bold text-gray-900 mb-4 text-2xl">
              Recommended Treatments
            </h4>
            <div className={`grid gap-4 ${hasAgingTile ? "" : "md:grid-cols-2"}`}>
              {analysisReport.recommendedServices.map((s, i) => (
                <div key={i} className="bg-blue-50 border-2 border-blue-200 p-5">
                  <h5 className="font-bold text-blue-900 mb-2 text-lg">{s.name}</h5>
                  <p className="text-sm text-blue-800 mb-3">{s.description}</p>
                  <p className="text-sm text-blue-900 font-semibold mb-2">
                    Why We Recommend This:
                  </p>
                  <p className="text-sm text-blue-800 mb-3">{s.whyRecommended}</p>
                  <div className="mb-4">
                    <p className="text-xs font-bold text-blue-900 mb-1">Benefits:</p>
                    <ul className="text-sm text-blue-800">
                      {s.benefits.map((b, j) => (
                        <li key={j}>✓ {b}</li>
                      ))}
                    </ul>
                  </div>
                  <a
                    href="mailto:contact@skindoctor.ai"
                    onClick={() =>
                      gaEvent('book_appointment_click', {
                        serviceName: s.name,
                        primaryConcern
                      })
                    }
                    className="block text-center bg-blue-600 text-white py-3 font-bold hover:bg-blue-700"
                  >
                    Book Appointment
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {!agencyChoice && (
          <div className="mt-4 bg-gray-50 border border-gray-200 p-5">
            <p className="text-sm text-gray-700">
              Choose a path above — nothing is required.
            </p>
          </div>
        )}
      </AccordionSection>


      <AccordionSection
        id="structured_report"
        title="Structured Report (1–9)"
        subtitle="Server-authored sections required by spec."
        open={!!openSections.structured_report}
        onToggle={toggleSection}
      >
        {analysisReport?.structuredReportSections?.length ? (
          <div className="space-y-4">
            {analysisReport.structuredReportSections.map((s, index) => (
              <div key={s.n} className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
                      {s.n}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-gray-900 mb-3">{s.title}</h4>
                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                      {(s.text || s.body || s.plain || "").toString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 bg-gray-50 p-6 rounded-lg border border-gray-200">
            Structured sections not available.
          </div>
        )}
      </AccordionSection>


      <AccordionSection
        id="report"
        title="Full Cosmetic Report"
        subtitle="The complete narrative report (expanded detail)."
        open={!!openSections.report}
        onToggle={toggleSection}
      >
        <div className="bg-gradient-to-br from-white via-blue-50/30 to-white border-2 border-blue-100 rounded-xl p-8 shadow-md">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-blue-100">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
              </svg>
            </div>
            <div>
              <h4 className="text-2xl font-extrabold text-gray-900">
                What I'm Seeing
              </h4>
              <p className="text-sm text-gray-600 font-medium mt-1">Cosmetic Education & Analysis</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none">
            <div className="space-y-4">
              {formatLongText(analysisReport?.report || "Your comprehensive report is loading...").map((paragraph, idx) => (
                <p key={idx} className="text-base text-gray-800 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-blue-100">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
              </svg>
              <span className="italic">This analysis is for cosmetic education purposes only and does not constitute medical advice.</span>
            </div>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        id="future"
        title="Your Future Story"
        subtitle="Cosmetic projection images anchored to your selfie (optional)."
        open={!!openSections.future}
        onToggle={toggleSection}
      >
        {agingImages.length > 0 ? (
          <div className="bg-white border border-gray-200 p-6">
            <h4 className="text-xl font-bold text-gray-900 mb-2">
              Your Future Story (Cosmetic Projection)
            </h4>
            <p className="text-sm text-gray-700 mb-6">
              These are visual projections anchored to your selfie.
            </p>

            <div className={`grid gap-4 ${hasAgingTile ? "" : "md:grid-cols-2"}`}>
              {agingImages.map((img) => (
                <div key={img.key} className="relative border border-gray-200 bg-gray-50 p-3">
                  <IdentityLockBadge
                    placement="top-left"
                    onClick={() => {
                      gaEvent('identity_lock_badge_clicked', { key: img.key });
                      setIdentityLockModalOpen(true);
                    }}
                  />

                  <WatermarkOverlay />

                  <img
                    src={img.url}
                    alt={img.label}
                    className="w-full border border-gray-200"
                    onLoad={() => gaEvent('aging_image_loaded', { key: img.key })}
                  />

                  <p className="text-sm font-bold text-gray-900 mt-3">{img.label}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleShare({ url: img.url, label: img.label })}
                      className="py-2 text-sm font-bold border bg-gray-900 text-white hover:bg-gray-800 border-gray-900"
                      type="button"
                    >
                      Share
                    </button>

                    <button
                      onClick={() => handleSave({ url: img.url, label: img.label })}
                      className="py-2 text-sm font-bold border bg-white text-gray-900 hover:bg-gray-50 border-gray-300"
                      type="button"
                    >
                      Save
                    </button>

                    <button
                      onClick={() => handleCopyImageLink({ url: img.url, label: img.label })}
                      className="py-2 text-sm font-bold border bg-white text-gray-900 hover:bg-gray-50 border-gray-300"
                      type="button"
                    >
                      Copy
                    </button>
                  </div>

                  {!reflectionSeen && (
                    <p className="text-xs text-gray-600 mt-3">
                      Sharing/saving activates after you read Dr. Lazuk’s note below.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 p-6">
            <p className="text-sm text-gray-700">
              Your Future Story images are not available for this result.
            </p>
          </div>
        )}
      </AccordionSection>
      <AccordionSection
        id="message"
        title="A Message from Dr. Lazuk"
        subtitle="Reading this activates sharing/saving on Future Story images."
        open={!!openSections.message}
        onToggle={toggleSection}
      >
        <PostImageReflection
          onSeen={() => {
            if (!reflectionSeen) {
              setReflectionSeen(true);
              gaEvent('reflection_seen', { step: 'results' });
              showToast("Thank you. Sharing and saving are now available.");
            }
          }}
        />
      </AccordionSection>


      <AccordionSection
        id="guidance"
        title="Recommended Products and Treatments"
        subtitle="Personalized guidance mapped to your primary concern."
        open={!!openSections.guidance}
        onToggle={toggleSection}
      >
        <div className="bg-white border-2 border-gray-900 p-8">
          <h4 className="font-bold text-gray-900 mb-4 text-2xl">Recommended Products (Dr. Lazuk Cosmetics®)</h4>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {analysisReport.recommendedProducts.map((p, i) => (
              <div key={i} className="bg-gray-50 border p-4">
                <h5 className="font-bold text-gray-900 mb-1">{p.name}</h5>
                <p className="text-gray-900 font-bold mb-2">${p.price}</p>
                <ul className="text-sm text-gray-700 mb-3">
                  {p.benefits.map((b, j) => (
                    <li key={j}>✓ {b}</li>
                  ))}
                </ul>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    gaEvent('product_click', {
                      productName: p.name,
                      category: p.category,
                      price: p.price,
                      primaryConcern
                    })
                  }
                  className="block text-center bg-gray-900 text-white py-2 font-bold hover:bg-gray-800"
                >
                  View
                </a>
              </div>
            ))}
          </div>

          <h4 className="font-bold text-gray-900 mb-4 text-2xl">
            Recommended Treatments
          </h4>
          <div className={`grid gap-4 ${hasAgingTile ? "" : "md:grid-cols-2"}`}>
            {analysisReport.recommendedServices.map((s, i) => (
              <div key={i} className="bg-blue-50 border-2 border-blue-200 p-5">
                <h5 className="font-bold text-blue-900 mb-2 text-lg">{s.name}</h5>
                <p className="text-sm text-blue-800 mb-3">{s.description}</p>
                <p className="text-sm text-blue-900 font-semibold mb-2">
                  Why We Recommend This:
                </p>
                <p className="text-sm text-blue-800 mb-3">{s.whyRecommended}</p>
                <div className="mb-4">
                  <p className="text-xs font-bold text-blue-900 mb-1">Benefits:</p>
                  <ul className="text-sm text-blue-800">
                    {s.benefits.map((b, j) => (
                      <li key={j}>✓ {b}</li>
                    ))}
                  </ul>
                </div>
                <a
                  href="mailto:contact@skindoctor.ai"
                  onClick={() =>
                    gaEvent('book_appointment_click', {
                      serviceName: s.name,
                      primaryConcern
                    })
                  }
                  className="block text-center bg-blue-600 text-white py-3 font-bold hover:bg-blue-700"
                >
                  Book Appointment
                </a>
              </div>
            ))}
          </div>
        </div>
      </AccordionSection>
    </div>

    {/* 📧 Email Report Button - BOTTOM (after reading everything) */}
    {!emailSent && (
      <div className="mt-6 sm:mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-4 sm:p-8 shadow-md">
        <div className="text-center mb-4 sm:mb-6">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Mail className="text-blue-600" size={24} />
            <span>Want This Complete Report in Your Inbox?</span>
          </h3>
          <p className="text-gray-700 text-sm sm:text-lg max-w-2xl mx-auto px-2">
            Get your full analysis, aging projections, and all recommendations delivered to your email. Perfect for sharing with your provider or keeping for future reference.
          </p>
        </div>
        <div className="flex justify-center">
          <button
            onClick={handleEmailReport}
            disabled={emailingReport}
            className="w-full sm:w-auto px-6 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base sm:text-lg font-bold rounded-xl shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 sm:gap-3"
            type="button"
          >
            {emailingReport ? (
              <>
                <Loader className="animate-spin" size={20} />
                <span>Sending Your Report...</span>
              </>
            ) : (
              <>
                <Mail size={20} />
                <span className="hidden sm:inline">Email Me My Complete Report</span>
                <span className="sm:hidden">Email My Report</span>
              </>
            )}
          </button>
        </div>
      </div>
    )}

    {emailSent && (
      <div className="mt-6 sm:mt-8 bg-green-50 border-2 border-green-200 rounded-2xl p-4 sm:p-8 shadow-md">
        <div className="flex flex-col items-center gap-3 sm:gap-4 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="px-2">
            <h3 className="text-xl sm:text-2xl font-bold text-green-900 mb-2">Report Successfully Sent!</h3>
            <p className="text-green-700 text-sm sm:text-lg">Check your email for your complete skincare analysis with all images and recommendations.</p>
          </div>
        </div>
      </div>
    )}
  </div>
)}

          </div>
        )}

        {activeTab === 'chat' && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl sm:rounded-2xl shadow-xl overflow-hidden" style={{ height: 'calc(100vh - 250px)', maxHeight: '700px', minHeight: '500px' }}>
            <div className="flex flex-col h-full">
              {/* Header - Premium */}
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-8 py-8">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                    <MessageCircle size={32} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-extrabold">Ask Dr. Lazuk</h2>
                    <p className="text-blue-100 text-sm mt-1 font-medium">
                      Your Personal Skincare Advisor
                    </p>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/20">
                  <p className="text-sm text-white">
                    💡 <strong>Educational & cosmetic discussion only.</strong> This chat is not medical advice.
                  </p>
                </div>
              </div>

              {/* Messages Area - Enhanced */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-6">
                      <MessageCircle className="text-blue-600" size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">
                      Hello! I'm Dr. Lazuk's AI Assistant
                    </h3>
                    <p className="text-gray-600 max-w-md leading-relaxed mb-8">
                      I can help you think through your skincare in a cosmetic, educational way. Ask me about routines, ingredients, concerns, or anything skincare-related!
                    </p>
                    
                    {/* Starter Prompts */}
                    <div className="grid grid-cols-2 gap-3 max-w-lg">
                      <button
                        onClick={() => {
                          setInputMessage("What's a good routine for aging skin?");
                        }}
                        className="text-sm text-left px-4 py-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all"
                        type="button"
                      >
                        💆‍♀️ Aging skin routine?
                      </button>
                      <button
                        onClick={() => {
                          setInputMessage("How do I reduce dark spots?");
                        }}
                        className="text-sm text-left px-4 py-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all"
                        type="button"
                      >
                        ✨ Reduce dark spots?
                      </button>
                      <button
                        onClick={() => {
                          setInputMessage("What's the best moisturizer for dry skin?");
                        }}
                        className="text-sm text-left px-4 py-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all"
                        type="button"
                      >
                        💧 Best moisturizer?
                      </button>
                      <button
                        onClick={() => {
                          setInputMessage("How do I build a simple routine?");
                        }}
                        className="text-sm text-left px-4 py-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all"
                        type="button"
                      >
                        📋 Simple routine help?
                      </button>
                    </div>
                  </div>
                )}
                
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-6 py-4 shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white' 
                        : 'bg-white border-2 border-gray-200 text-gray-900'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border-2 border-gray-200 rounded-2xl px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Loader className="animate-spin text-blue-600" size={20} />
                        <span className="text-sm text-gray-600">Dr. Lazuk is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area - Premium */}
              <div className="border-t-2 border-gray-200 p-6 bg-white">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !chatLoading && sendMessage()}
                    placeholder="Ask about skincare, routines, ingredients..."
                    className="flex-1 px-6 py-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 text-base shadow-sm"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={chatLoading || !inputMessage.trim()}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center gap-2"
                    type="button"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'education' && (
          <div className="py-4">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-extrabold text-gray-900 mb-3">Our Esthetic Services</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Professional treatments designed to enhance your natural beauty
              </p>
            </div>
            
            <div className="grid md:grid-cols-1 gap-8">
              {estheticServices.map((s, i) => (
                <div 
                  key={i} 
                  className="group bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-500 p-8 transition-all duration-300 hover:shadow-2xl"
                >
                  {/* Service Icon */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 group-hover:from-blue-500 group-hover:to-indigo-500 flex items-center justify-center mb-6 transition-all duration-300">
                    <span className="text-3xl group-hover:scale-110 transition-transform">
                      {i === 0 ? '✨' : i === 1 ? '💆‍♀️' : '🌟'}
                    </span>
                  </div>
                  
                  <h3 className="font-extrabold text-2xl text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                    {s.name}
                  </h3>
                  <p className="text-gray-700 mb-6 leading-relaxed">{s.description}</p>
                  
                  <div className="mb-6 bg-blue-50 rounded-xl p-6 border border-blue-100">
                    <p className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="text-blue-600">✓</span> Benefits:
                    </p>
                    <ul className="space-y-2">
                      {s.benefits.map((b, j) => (
                        <li key={j} className="flex items-start gap-3 text-gray-700">
                          <span className="text-green-500 font-bold mt-0.5">✓</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <a
                    href="mailto:contact@skindoctor.ai"
                    onClick={() => gaEvent('services_learn_more_click', { serviceName: s.name })}
                    className="block text-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 px-6 font-bold rounded-xl transition-all duration-300 transform group-hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    Learn More About This Service →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'concierge' && (
          <ConversationalConcierge 
            analysisReport={analysisReport}
            userContext={{
              firstName: firstName || null,
              ageRange: ageRange || null,
              primaryConcern: primaryConcern || null
            }}
          />
        )}
      </div>

        <canvas ref={canvasRef} className="hidden" />
      <div className="bg-gray-900 text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400">© 2026 by SkinDoctor AI®</p>
          <p className="text-sm text-gray-400 mt-2">
            Dr. Lazuk Cosmetics® | Lazuk Esthetics® | Contact: contact@skindoctor.ai
          </p>
        </div>
      </div>
    </div>
  );

};

export default DermatologyApp;