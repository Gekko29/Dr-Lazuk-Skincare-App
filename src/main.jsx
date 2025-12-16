import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

if (GA_ID) {
  // Load gtag.js
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  // Init gtag
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", GA_ID, { send_page_view: true });
} else {
  console.warn("Missing VITE_GA_MEASUREMENT_ID");
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
