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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  // Hard reject only if truly unusable
  if (meanBrightness < 40) {
    return { ok: false, code: 'low_light', message: RETAKE_MESSAGES.low_light };
  }

  // Blur: keep conversion-friendly (less strict). Still blocks truly soft photos.
  if (gradVar < 40) {
    return { ok: false, code: 'blurry', message: RETAKE_MESSAGES.blurry };
  }

  if (faces && Array.isArray(faces) && faces.length > 0 && faces[0]?.boundingBox) {
    const bb = faces[0].boundingBox;
    const faceArea = bb.width * bb.height;
    const imgArea = img.width * img.height;
    const ratio = faceArea / imgArea;
    if (ratio < 0.10 || ratio > 0.70) {
      return { ok: false, code: 'framing', message: RETAKE_MESSAGES.framing };
    }
  }

  return { ok: true };
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
   Post-Image Reflection (BOTTOM ONLY)
   - No section labels
   - No internal scroll
   - Unlocks on reaching the end
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
              {/* ✅ Section label removed by design */}
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* Sentinel for unlock */}
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
        Nothing here is required. Choose what feels supportive — or simply save this and return later.
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
          onClick={() => onChoose?.("observe")}
          className="border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50 p-5 text-left"
          type="button"
        >
          <p className="font-bold text-gray-900">Observe</p>
          <p className="text-sm text-gray-700 mt-1">
            Save this moment and revisit when you feel ready.
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
  // data URL → Blob → File
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
};

const fetchUrlToFile = async (url, filename) => {
  // Might fail if CORS blocks; caller handles fallback.
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
    // fallback: open in new tab
    try {
      window.open(urlOrDataUrl, "_blank", "noopener,noreferrer");
      return false;
    } catch {
      return false;
    }
  }
};

const buildShareText = ({ label }) => {
  // Ethical: avoid fear; focus on agency + education
  return `I tried Dr. Lazuk’s Identity Lock™ cosmetic skin analysis. Here is my “Future Story” preview (${label}).

This is cosmetic education only—not medical advice.

SkinDoctor.ai`;
};

const DermatologyApp = () => {
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

  const [captureGuidanceSeen, setCaptureGuidanceSeen] = useState(false);
  const [captureSupportMessage, setCaptureSupportMessage] = useState(null);

  const [identityLockActivating, setIdentityLockActivating] = useState(false);
  const [identityLockEnabled, setIdentityLockEnabled] = useState(false);
  const [identityLockModalOpen, setIdentityLockModalOpen] = useState(false);

  const [reflectionSeen, setReflectionSeen] = useState(false);
  const [agencyChoice, setAgencyChoice] = useState(null);

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

  // ✅ NEW: section refs so “Paths Forward” always works (scrolls correctly)
  const understandRef = useRef(null);
  const guidanceRef = useRef(null);
  const observeRef = useRef(null);

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

  const showSupportiveRetake = (message) => {
    setCaptureSupportMessage(`${message}

${SUPPORTIVE_FOOTER_LINE}`);
  };

  const startCamera = async () => {
    gaEvent('camera_start_clicked', { step });

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      showSupportiveRetake(lock.message);
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
      showSupportiveRetake('Unable to access camera. Please ensure camera permissions are granted.');
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
    setCaptureSupportMessage(null);

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      showSupportiveRetake(lock.message);
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
        showSupportiveRetake(result.message);
        stopCamera();
        return;
      }

      clearFaceFailures();
      let imageData = canvas.toDataURL('image/jpeg');

      // Downscale for payload + consistency
      try {
        imageData = await downscaleDataUrl(imageData, 960, 0.92);
      } catch {
        // ignore if downscale fails
      }

      try {
        const q = await validateCapturedImage({
          dataUrl: imageData,
          faces: faceCheck.faces
        });

        if (!q.ok) {
          gaEvent('retake_requested', { source: 'camera', reason: q.code });
          showSupportiveRetake(q.message);
          return;
        }
      } catch {
        gaEvent('quality_check_soft_pass', { source: 'camera' });
      }

      setCapturedImage(imageData);
      stopCamera();

      // Identity Lock overlay is the single source of completion (no extra timers)
      setIdentityLockEnabled(false);
      setIdentityLockActivating(true);
      gaEvent('identity_lock_activation_started', { source: 'capture' });

      gaEvent('selfie_captured', { source: 'camera' });
    }
  };

  const handleFileUpload = async (e) => {
    gaEvent('upload_clicked', { step });
    setCaptureSupportMessage(null);

    const file = e.target.files[0];
    if (!file) return;

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      showSupportiveRetake(lock.message);
      // allow re-selecting same file later
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
        showSupportiveRetake(result.message);
        try { e.target.value = ""; } catch {}
        return;
      }

      clearFaceFailures();

      // Downscale uploads too
      try {
        dataUrl = await downscaleDataUrl(dataUrl, 960, 0.92);
      } catch {
        // ignore if downscale fails
      }

      try {
        const q = await validateCapturedImage({
          dataUrl,
          faces: faceCheck.faces
        });

        if (!q.ok) {
          gaEvent('retake_requested', { source: 'upload', reason: q.code });
          showSupportiveRetake(q.message);
          try { e.target.value = ""; } catch {}
          return;
        }
      } catch {
        gaEvent('quality_check_soft_pass', { source: 'upload' });
      }

      setCapturedImage(dataUrl);

      setIdentityLockEnabled(false);
      setIdentityLockActivating(true);
      gaEvent('identity_lock_activation_started', { source: 'upload' });

      gaEvent('selfie_uploaded', { source: 'upload' });

      // allow selecting the same file again later
      try { e.target.value = ""; } catch {}
    };
    reader.readAsDataURL(file);
  };

  const handleQuestionsSubmit = () => {
    if (!ageRange || !primaryConcern) {
      gaEvent('questions_incomplete', { ageRangeFilled: !!ageRange, concernFilled: !!primaryConcern });
      showSupportiveRetake('Please answer all required questions so Dr. Lazuk can tailor your analysis.');
      return;
    }
    gaEvent('questions_submitted', { ageRange, primaryConcern });
    setStep('email');
  };

  const performAnalysis = async () => {
    // ✅ Clear prior messages for the email step
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
          gaClientId
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const msg = data?.message || data?.error || 'Error generating report';

        // ✅ IMPORTANT: show cooldown + other server messages ON THE EMAIL SCREEN
        if (response.status === 429 || data?.error === 'cooldown_active') {
          setAnalysisUiError(String(msg));
          gaEvent('analysis_cooldown', {
            primaryConcern,
            ageRange,
            message: String(msg).slice(0, 160)
          });
          return; // stop here; finally will clear spinner
        }

        gaEvent('analysis_error', {
          primaryConcern,
          ageRange,
          message: String(msg).slice(0, 120)
        });
        throw new Error(msg);
      }

      // ✅ Reset gating on each new report
      setReflectionSeen(false);
      setAgencyChoice(null);

      setAnalysisReport({
        report: data.report,
        recommendedProducts: getRecommendedProducts(primaryConcern),
        recommendedServices: getRecommendedServices(primaryConcern),
        // ✅ Fitzpatrick is intentionally kept in data (email can include it),
        // but UI will not render it anywhere.
        fitzpatrickType: data.fitzpatrickType || null,
        fitzpatrickSummary: data.fitzpatrickSummary || null,
        agingPreviewImages: data.agingPreviewImages || null
      });

      gaEvent('analysis_success', {
        primaryConcern,
        ageRange,
        hasFitz: !!(data.fitzpatrickType || data.fitzpatrickSummary),
        hasAgingPreviews: !!(
          data?.agingPreviewImages?.noChange10 ||
          data?.agingPreviewImages?.noChange20 ||
          data?.agingPreviewImages?.withCare10 ||
          data?.agingPreviewImages?.withCare20
        )
      });

      setStep('results');
    } catch (error) {
      console.error('Analysis error:', error);

      // ✅ Email-step visible error (prevents “app feels broken”)
      setAnalysisUiError(error?.message || 'There was an error. Please try again.');
      gaEvent('analysis_error', { message: String(error?.message || 'exception').slice(0, 160) });

      // keep your supportive messaging behavior (doesn't hurt)
      showSupportiveRetake(error?.message || 'There was an error. Please try again.');
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleEmailSubmit = async () => {
    const fn = String(firstName || '').trim();
    if (!fn) {
      gaEvent('email_step_error', { reason: 'missing_first_name' });
      showSupportiveRetake('Please enter your first name.');
      setAnalysisUiError('Please enter your first name.');
      return;
    }

    if (!userEmail || !userEmail.includes('@')) {
      gaEvent('email_step_error', { reason: 'invalid_email' });
      showSupportiveRetake('Please enter a valid email address.');
      setAnalysisUiError('Please enter a valid email address.');
      return;
    }

    gaEvent('email_step_submitted', { hasFirstName: true, hasEmail: true });
    await performAnalysis();
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
    setIdentityLockEnabled(false);
    setIdentityLockActivating(false);
    setReflectionSeen(false);
    setAgencyChoice(null);

    // ✅ reset email-step messages too
    setAnalysisUiError('');
    setAnalysisUiNotice('');
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const agingImages = useMemo(() => {
    const p = analysisReport?.agingPreviewImages || {};
    return [
      { key: 'noChange10', label: '10 Years (No Change)', url: p.noChange10 || null },
      { key: 'noChange20', label: '20 Years (No Change)', url: p.noChange20 || null },
      { key: 'withCare10', label: '10 Years (With Care)', url: p.withCare10 || null },
      { key: 'withCare20', label: '20 Years (With Care)', url: p.withCare20 || null }
    ].filter((x) => !!x.url);
  }, [analysisReport]);

  const handleShare = async ({ url, label }) => {
    if (!reflectionSeen) {
      gaEvent("share_blocked_before_reflection", { label });
      showToast("Take your time — sharing becomes available after you’ve read Dr. Lazuk’s note.");
      return;
    }

    const shareText = buildShareText({ label });
    gaEvent("share_clicked", { label });

    // Prefer native share if possible
    try {
      // If share supports files, share the image itself
      if (navigator?.canShare) {
        let file = null;
        const filename = `skindoctor_future_story_${label.replace(/\s+/g, "_").toLowerCase()}.jpg`;

        try {
          if (String(url).startsWith("data:")) file = await dataUrlToFile(url, filename);
          else file = await fetchUrlToFile(url, filename);
        } catch (e) {
          // CORS likely blocked; fall back to text-only share
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
    } catch (err) {
      // fall through to clipboard
    }

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

      {/* Tiny toast for share/save */}
      {shareToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 text-sm shadow-lg">
          {shareToast}
        </div>
      )}

      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">DR. LAZUK</h1>
              <p className="text-sm mt-1 text-gray-300">
                ESTHETICS | COSMETICS | BIOTICS | NUTRITION
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Virtual Skincare Analysis
              </p>
              <p className="text-sm text-gray-300 mt-1">Enhancing the Beautiful You, Naturally</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveTab('home');
                gaEvent('tab_changed', { tab: 'home' });
              }}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${
                activeTab === 'home'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
              type="button"
            >
              <Camera size={18} />
              <span>Skin Analysis</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('chat');
                gaEvent('tab_changed', { tab: 'chat' });
              }}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${
                activeTab === 'chat'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
              type="button"
            >
              <MessageCircle size={18} />
              <span>Ask Dr. Lazuk</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('education');
                gaEvent('tab_changed', { tab: 'education' });
              }}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${
                activeTab === 'education'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
              type="button"
            >
              <BookOpen size={18} />
              <span>Services</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'home' && (
          <div className="bg-white border border-gray-200 shadow-sm p-8">
            {/* ✅ Everything above this point unchanged */}
            {/* ✅ RESULTS FLOW FIX:
                - Report shows immediately (always)
                - “Understand” ONLY reveals aging images
                - Reflection is always at the very bottom
                - Paths Forward buttons scroll reliably
                - Fitzpatrick removed from UI rendering
            */}

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
                      onClick={resetAnalysis}
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

                    {/* ✅ NEW: Patience notice + cooldown error shown right on this screen */}
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
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold text-gray-900">Your Results</h3>
                  <button
                    onClick={resetAnalysis}
                    className="px-4 py-2 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400 text-sm"
                    type="button"
                  >
                    New Analysis
                  </button>
                </div>

                {/* ✅ REPORT IS IMMEDIATE (always visible) */}
                <div className="bg-white border border-gray-200 p-6">
                  <h4 className="text-xl font-bold text-gray-900 mb-2">
                    What I’m Seeing (Cosmetic Education)
                  </h4>

                  {/* ✅ Fitzpatrick removed from onscreen UI by requirement */}

                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {analysisReport?.report || "Your report is loading."}
                  </p>
                </div>

                {/* ✅ Paths Forward works + scrolls */}
                <AgencyLayer
                  onChoose={(choice) => {
                    setAgencyChoice(choice);
                    gaEvent('agency_choice', { choice });

                    window.requestAnimationFrame(() => {
                      const map = {
                        understand: understandRef.current,
                        guidance: guidanceRef.current,
                        observe: observeRef.current
                      };
                      const target = map[choice];
                      if (target?.scrollIntoView) {
                        target.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    });
                  }}
                />

                {!agencyChoice && (
                  <div className="bg-gray-50 border border-gray-200 p-5">
                    <p className="text-sm text-gray-700">
                      Your report is ready above. If you’d like, choose a path here — nothing is required.
                    </p>
                  </div>
                )}

                {/* ✅ UNDERSTAND = IMAGES ONLY */}
                {agencyChoice === 'understand' && (
                  <div ref={understandRef}>
                    {agingImages.length > 0 ? (
                      <div className="bg-white border border-gray-200 p-6">
                        <h4 className="text-xl font-bold text-gray-900 mb-2">
                          Your Future Story (Cosmetic Projection)
                        </h4>
                        <p className="text-sm text-gray-700 mb-6">
                          These are visual projections anchored to your selfie.
                        </p>

                        <div className="grid md:grid-cols-2 gap-4">
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

                {/* GUIDANCE: products + treatments */}
                {agencyChoice === 'guidance' && (
                  <div ref={guidanceRef} className="bg-white border-2 border-gray-900 p-8">
                    <h4 className="font-bold text-gray-900 mb-4 text-2xl">Recommended Products</h4>
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
                    <div className="grid md:grid-cols-2 gap-4">
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

                {/* OBSERVE */}
                {agencyChoice === 'observe' && (
                  <div ref={observeRef} className="bg-gray-50 border border-gray-200 p-6">
                    <p className="text-sm text-gray-700">
                      If you’d like, you can simply return to your email later.
                      There is no urgency — and no required schedule.
                    </p>
                  </div>
                )}

                {/* ✅ Reflection is ALWAYS at the bottom (independent of choice) */}
                <PostImageReflection
                  onSeen={() => {
                    if (!reflectionSeen) {
                      setReflectionSeen(true);
                      gaEvent('reflection_seen', { step: 'results' });
                      showToast("Thank you. Sharing and saving are now available.");
                    }
                  }}
                />
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {/* chat + education tabs unchanged */}
        {activeTab === 'chat' && (
          <div className="bg-white border shadow-sm overflow-hidden" style={{ height: '600px' }}>
            <div className="flex flex-col h-full">
              <div className="bg-gray-900 text-white p-6">
                <h2 className="text-2xl font-bold">Ask Dr. Lazuk</h2>
                <p className="text-xs text-gray-300 mt-1">
                  Educational and cosmetic discussion only. This chat is not medical advice.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 ${
                      msg.role === 'user' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-900'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border p-4">
                      <Loader className="animate-spin" size={20} />
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t p-4 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask a cosmetic skincare question..."
                    className="flex-1 px-4 py-3 border-2 focus:outline-none focus:border-gray-900"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={chatLoading}
                    className="px-8 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800 disabled:bg-gray-400"
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
          <div className="bg-white border shadow-sm p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Esthetic Services</h2>
            <div className="grid md:grid-cols-1 gap-6">
              {estheticServices.map((s, i) => (
                <div key={i} className="border-2 p-6">
                  <h3 className="font-bold text-xl text-gray-900 mb-2">{s.name}</h3>
                  <p className="text-gray-700 mb-4">{s.description}</p>
                  <div className="mb-4">
                    <p className="font-bold text-gray-900 mb-2">Benefits:</p>
                    <ul className="text-sm text-gray-700">
                      {s.benefits.map((b, j) => (
                        <li key={j}>✓ {b}</li>
                      ))}
                    </ul>
                  </div>
                  <a
                    href="mailto:contact@skindoctor.ai"
                    onClick={() => gaEvent('services_learn_more_click', { serviceName: s.name })}
                    className="block text-center bg-gray-900 text-white py-3 font-bold hover:bg-gray-800"
                  >
                    Learn More
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400">© 2026 by SkinDoctor AI®</p>
          <p className="text-sm text-gray-400 mt-2">
            Dr. Lazuk Cosmetics® | Dr. Lazuk Esthetics® | Contact: contact@skindoctor.ai
          </p>
        </div>
      </div>
    </div>
  );
};

export default DermatologyApp;








