// src/App.jsx
import React, { useState, useRef, useEffect } from 'react';
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

/* ---------------------------
   Google Analytics (GA4) — inline helpers (NO extra files)
   Requires:
   - VITE_GA_MEASUREMENT_ID in env
   - gtag snippet installed in index.html
---------------------------- */
const GA_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID;

const gaEvent = (name, params = {}) => {
  try {
    if (!GA_ID) return;
    if (typeof window === 'undefined') return;
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, params);
  } catch {
    // never block UX
  }
};

const gaPageView = (path, title) => {
  try {
    if (!GA_ID) return;
    if (typeof window === 'undefined') return;
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', 'page_view', {
      page_location: window.location.href,
      page_path: path,
      page_title: title || document.title
    });
  } catch {
    // never block UX
  }
};

const getGaClientId = () => {
  return new Promise((resolve) => {
    try {
      if (!GA_ID) return resolve(null);
      if (typeof window === 'undefined') return resolve(null);
      if (typeof window.gtag !== 'function') return resolve(null);

      window.gtag('get', GA_ID, 'client_id', (cid) => resolve(cid || null));
    } catch {
      resolve(null);
    }
  });
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Helper: check if user is locked out due to repeated non-face attempts
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

// Helper: register a non-face attempt and possibly lock for 30 days
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
    message:
      'We could not detect a face in this photo. Please upload a clear, front-facing photo of your face with good lighting and minimal obstructions.'
  };
};

// Helper: clear non-face fail count when we successfully detect a face
const clearFaceFailures = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('dl_faceFailCount');
};

// Face detection using the browser's FaceDetector API where available
const detectFaceInImageElement = async (imgEl) => {
  if (!imgEl) return false;

  if ('FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      const faces = await detector.detect(imgEl);
      return faces.length > 0;
    } catch (err) {
      console.error('FaceDetector error:', err);
      return false;
    }
  } else {
    // If FaceDetector is not supported, allow the image so the experience still works
    return true;
  }
};

// Helper: detect face from a data URL (for uploaded images)
const detectFaceFromDataUrl = (dataUrl) => {
  return new Promise((resolve) => {
    if (!('FaceDetector' in window)) {
      resolve(true);
      return;
    }

    const img = new Image();
    img.onload = async () => {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await detector.detect(img);
        resolve(faces.length > 0);
      } catch (err) {
        console.error('FaceDetector error (upload):', err);
        resolve(false);
      }
    };
    img.onerror = () => {
      resolve(false);
    };
    img.src = dataUrl;
  });
};

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

function gaEvent(name, params = {}) {
  if (!GA_ID) return;
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", name, params);
}

function gaPageView(path) {
  if (!GA_ID) return;
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", "page_view", {
    page_title: document.title,
    page_location: window.location.href,
    page_path: path || window.location.pathname,
  });
}

const DermatologyApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [step, setStep] = useState('photo');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);

  // ✅ NEW: first name is required by the API
  const [firstName, setFirstName] = useState('');

  const [userEmail, setUserEmail] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [primaryConcern, setPrimaryConcern] = useState('');
  const [visitorQuestion, setVisitorQuestion] = useState('');
  const [analysisReport, setAnalysisReport] = useState(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

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

  // Track page views when user navigates tabs/steps
  useEffect(() => {
    const path = `/app/${activeTab}/${step}`;
    gaPageView(path, `DermatologyApp - ${activeTab} - ${step}`);
  }, [activeTab, step]);

  const startCamera = async () => {
    gaEvent('camera_start_clicked', { step });

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      alert(lock.message);
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
      alert('Unable to access camera. Please ensure camera permissions are granted.');
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

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      alert(lock.message);
      return;
    }

    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const faceFound = await detectFaceInImageElement(canvas);
      if (!faceFound) {
        const result = registerFaceFailure();
        gaEvent('face_not_detected', { source: 'camera', lockedNow: !!result.lockedNow });
        alert(result.message);
        stopCamera();
        return;
      }

      clearFaceFailures();
      const imageData = canvas.toDataURL('image/jpeg');
      setCapturedImage(imageData);
      stopCamera();
      setStep('questions');
      gaEvent('selfie_captured', { source: 'camera' });
    }
  };

  const handleFileUpload = async (e) => {
    gaEvent('upload_clicked', { step });

    const file = e.target.files[0];
    if (!file) return;

    const lock = getFaceLockStatus();
    if (lock.locked) {
      gaEvent('face_locked', { step });
      alert(lock.message);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;

      const faceFound = await detectFaceFromDataUrl(dataUrl);
      if (!faceFound) {
        const result = registerFaceFailure();
        gaEvent('face_not_detected', { source: 'upload', lockedNow: !!result.lockedNow });
        alert(result.message);
        return;
      }

      clearFaceFailures();
      setCapturedImage(dataUrl);
      setStep('questions');
      gaEvent('selfie_uploaded', { source: 'upload' });
    };
    reader.readAsDataURL(file);
  };

  const handleQuestionsSubmit = () => {
    if (!ageRange || !primaryConcern) {
      gaEvent('questions_incomplete', { ageRangeFilled: !!ageRange, concernFilled: !!primaryConcern });
      alert('Please answer all required questions');
      return;
    }

    gaEvent('questions_submitted', { ageRange, primaryConcern });
    setStep('email');
  };

  const performAnalysis = async () => {
    setEmailSubmitting(true);

    const gaClientId = await getGaClientId();

    // Track intent
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
          firstName: firstName, // ✅ REQUIRED by backend
          email: userEmail,
          ageRange,
          primaryConcern,
          visitorQuestion,
          photoDataUrl: capturedImage,

          // Optional: helpful for backend-side GA stitching if you later add Measurement Protocol
          gaClientId
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const msg = data?.message || data?.error || 'Error generating report';
        gaEvent('analysis_error', {
          primaryConcern,
          ageRange,
          message: String(msg).slice(0, 120)
        });
        throw new Error(msg);
      }

      setAnalysisReport({
        report: data.report,
        recommendedProducts: getRecommendedProducts(primaryConcern),
        recommendedServices: getRecommendedServices(primaryConcern),
        fitzpatrickType: data.fitzpatrickType || null,
        fitzpatrickSummary: data.fitzpatrickSummary || null
      });

      console.log('Analysis generated for:', userEmail, ageRange, primaryConcern);

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

      setEmailSubmitting(false);
      setStep('results');
    } catch (error) {
      console.error('Analysis error:', error);
      setEmailSubmitting(false);
      alert(error?.message || 'There was an error. Please try again.');
    }
  };

  const handleEmailSubmit = async () => {
    const fn = String(firstName || '').trim();
    if (!fn) {
      gaEvent('email_step_error', { reason: 'missing_first_name' });
      alert('Please enter your first name');
      return;
    }

    if (!userEmail || !userEmail.includes('@')) {
      gaEvent('email_step_error', { reason: 'invalid_email' });
      alert('Please enter a valid email address');
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
        console.error('ask-dr-lazuk error:', data);

        gaEvent('chat_error', {
          message: String(data?.message || 'backend_error').slice(0, 120)
        });

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
    setFirstName(''); // ✅ reset
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
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
            {step === 'photo' && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="text-gray-900" size={28} />
                  <h2 className="text-2xl font-bold text-gray-900">Virtual Skin Analysis</h2>
                </div>

                {/* Disclaimer – entertainment only, no medical advice */}
                <div className="bg-gray-100 border border-gray-300 p-4 mb-4 flex items-start gap-3">
                  <Info className="text-gray-700 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-gray-800">
                    <strong>Disclaimer:</strong> This interactive skin analysis is intended{' '}
                    <strong>for entertainment and cosmetic education only</strong> and is{' '}
                    <strong>not medical advice</strong>. No medical conditions will be evaluated,
                    diagnosed, or treated during this analysis.
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-300 p-4 mb-8 flex items-start gap-3">
                  <Info className="text-gray-700 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-gray-700">
                    Take or upload a well-lit photo of your face. Your complete cosmetic report will
                    be emailed to you.
                  </p>
                </div>

                {!capturedImage && !cameraActive && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <button
                      onClick={startCamera}
                      className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-400 hover:border-gray-900 hover:bg-gray-50 transition-all"
                    >
                      <Camera size={56} className="text-gray-900 mb-4" />
                      <span className="font-bold text-gray-900 text-lg">Use Camera</span>
                    </button>
                    <button
                      onClick={() => {
                        gaEvent('upload_open_picker', { step });
                        fileInputRef.current?.click();
                      }}
                      className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-400 hover:border-gray-900 hover:bg-gray-50 transition-all"
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
                      >
                        Capture
                      </button>
                      <button
                        onClick={stopCamera}
                        className="px-8 py-3 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400"
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
                  <img
                    src={capturedImage}
                    alt="Your photo"
                    className="w-full border border-gray-300"
                  />
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
                    >
                      Start Over
                    </button>
                    <button
                      onClick={handleQuestionsSubmit}
                      className="flex-1 px-6 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800"
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
                    Enter your first name and email to receive your complete cosmetic report with
                    product and treatment recommendations. A copy will also be sent to our clinic team.
                  </p>
                  <div className="space-y-4">
                    {/* ✅ NEW: First Name */}
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      placeholder="First name"
                      className="w-full px-4 py-3 bg-white text-gray-900 border-2"
                    />

                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      placeholder="your.email@example.com"
                      className="w-full px-4 py-3 bg-white text-gray-900 border-2"
                    />
                    <button
                      onClick={handleEmailSubmit}
                      disabled={emailSubmitting}
                      className="w-full px-6 py-3 bg-white text-gray-900 font-bold hover:bg-gray-200 disabled:bg-gray-400 flex items-center justify-center gap-2"
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
                  </div>
                </div>
              </div>
            )}

            {step === 'results' && analysisReport && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold text-gray-900">Your Analysis</h3>
                  <button
                    onClick={resetAnalysis}
                    className="px-4 py-2 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400 text-sm"
                  >
                    New Analysis
                  </button>
                </div>

                {/* Fitzpatrick Card */}
                {(analysisReport.fitzpatrickType || analysisReport.fitzpatrickSummary) && (
                  <div className="bg-amber-50 border-2 border-amber-200 p-6">
                    <h4 className="text-lg font-bold text-amber-900 mb-2">
                      Fitzpatrick Skin Type (Cosmetic Estimate)
                    </h4>
                    {analysisReport.fitzpatrickType && (
                      <p className="font-semibold text-amber-900 mb-1">
                        Type {analysisReport.fitzpatrickType}
                      </p>
                    )}
                    {analysisReport.fitzpatrickSummary && (
                      <p className="text-sm text-amber-900 whitespace-pre-wrap">
                        {analysisReport.fitzpatrickSummary}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-amber-800">
                      This is a visual, cosmetic estimate only and is not a medical diagnosis.
                    </p>
                  </div>
                )}

                <div className="bg-white border-2 border-gray-900 p-8">
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                    {analysisReport.report}
                  </div>
                </div>

                <div className="bg-white border-2 border-gray-900 p-8">
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
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

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
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-4 ${
                        msg.role === 'user'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white border text-gray-900'
                      }`}
                    >
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
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask a cosmetic skincare question..."
                    className="flex-1 px-4 py-3 border-2 focus:outline-none focus:border-gray-900"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={chatLoading}
                    className="px-8 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800 disabled:bg-gray-400"
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
            <div className="grid md:grid-cols-2 gap-6">
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





