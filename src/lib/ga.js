// src/lib/ga.js
// Minimal GA4 helper utilities for Vite + gtag
// Requires:
// - VITE_GA_MEASUREMENT_ID in env
// - gtag snippet installed in index.html

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
      page_title: title || document.title,
      page_location: window.location.href,
      page_path: path || window.location.pathname
    });
  } catch {
    // never block UX
  }
};

// Attempts to read the GA client id (useful for tying behavior → report generation)
export const getGaClientId = async () => {
  try {
    if (!GA_ID) return null;
    if (typeof window === "undefined") return null;
    if (typeof window.gtag !== "function") return null;

    const cid = await new Promise((resolve) => {
      window.gtag("get", GA_ID, "client_id", (clientId) => {
        resolve(clientId || null);
      });
    });

    return cid;
  } catch {
    return null;
  }
};
