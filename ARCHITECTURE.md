# Architecture (Locked)

Frontend: Vite + React SPA  
Backend: Vercel Serverless Functions in `/api/*`

This project is NOT Next.js.

## Guardrails
- The `/pages/` directory MUST NOT exist.
- All server logic lives exclusively in `/api/`.
- Frontend routing is handled client-side (SPA).
