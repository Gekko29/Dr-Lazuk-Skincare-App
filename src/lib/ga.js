// src/lib/ga.js
// Lightweight GA4 helpers for Vite + gtag.js
// Requires VITE_GA_MEASUREMENT_ID and the gtag snippet loaded in index.html.

const GA_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID;

export const gaEvent = (name, params = {}) => {
  try {
    if (!GA_ID) return;
    if (typeof window === "undefined") return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, params);
  } catch {
    // never block UX
  }
};

export const gaPageView = (path, title) => {
  try {
    if (!GA_ID) return;
    if (typeof window === "undefined") return;
    if (typeof window.gtag !== "function") return;

    window.gtag("event", "page_view", {
      page_path: path,
      page_title: title || document?.title || ""
    });
  } catch {
    // never block UX
  }
};

// Returns GA client_id if gtag is available; otherwise null.
export const getGaClientId = async () => {
  try {
    if (!GA_ID) return null;
    if (typeof window === "undefined") return null;
    if (typeof window.gtag !== "function") return null;

    return await new Promise((resolve) => {
      window.gtag("get", GA_ID, "client_id", (cid) => resolve(cid || null));
      // soft timeout guard
      setTimeout(() => resolve(null), 800);
    });
  } catch {
    return null;
  }
};

