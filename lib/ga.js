//lib/ga.js
export const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

export function gaEvent(name, params = {}) {
  if (!GA_ID) return;
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

export function gaPageView(path, title) {
  if (!GA_ID) return;
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: title || document.title,
  });
}

// Optional but VERY useful: get GA4 client_id so server-side events can stitch sessions
export function getGaClientId() {
  return new Promise((resolve) => {
    if (!GA_ID) return resolve(null);
    if (typeof window === "undefined") return resolve(null);
    if (typeof window.gtag !== "function") return resolve(null);

    window.gtag("get", GA_ID, "client_id", (cid) => resolve(cid || null));
  });
}
