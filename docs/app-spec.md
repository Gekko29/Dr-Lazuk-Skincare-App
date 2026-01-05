# Dr. Lazuk Skincare App — Application Specification
Version: 1.0  
Status: Canonical / Authoritative  
Last Updated: YYYY-MM-DD

---

## 1. PURPOSE

This document is the **single source of truth** for the Dr. Lazuk Skincare App.
All development, prompts, UI changes, and releases **must align** with this spec.

If a change is not represented here, it is **not considered complete**.

---

## 2. SYSTEM GUIDING RULE (NON-NEGOTIABLE)

> **Nothing may be added that increases emotional intensity without increasing clarity.  
> When clarity and intensity compete, clarity wins.  
> When in doubt, restraint wins.**

---

## 3. WHAT THIS SYSTEM IS / IS NOT

### The system IS:
- Observational, not diagnostic
- Pattern-based, not predictive
- Calm, restrained, and dermatology-informed
- Designed to support informed skincare decisions

### The system IS NOT:
- A diagnostic tool
- A fear-based experience
- A grading or scoring engine
- A “skin age” calculator

---

## 4. LOCKED END-STATE PROTOCOLS

These are the **only** conversion endpoints:

- Radiant Protocol  
- Luxe Renewal  
- Clarite Protocol  
- Serein Balance  

Rules:
- Mapped by **condition**, not age
- One **Primary** protocol, one optional **Secondary**
- Language must always explain *why* a protocol was selected

---

## 5. REQUIRED REPORT STRUCTURE (ORDERED)

Every report MUST contain the following sections, in order:

1. User Intent Framing  
2. Image Context & Integrity  
3. Observed Skin Patterns (High Confidence)  
4. Interpretive Insights (Moderate Confidence)  
5. Known Limitations  
6. Condition Weighting Summary  
7. Protocol Recommendation (Primary / Secondary)  
8. Expectation Setting  
9. Aging Imagery (if shown) — governed by Section 7

---

## 6. IMPLEMENTATION CHECKLIST (WITH IDS)

### MUST-HAVE — REQUIRED NOW

#### Core Intelligence
- ☐ AI-INT-001 — Dynamic Condition Weighting Engine  
- ☐ AI-INT-002 — Confidence / Interpretation / Limitation Structuring  

#### Funnel Logic
- ☐ AI-FNL-001 — Primary vs Secondary Protocol Logic  
- ☐ AI-FNL-002 — Recommendation Non-Exclusivity Clause  

#### Image & Analysis Transparency
- ☐ AI-IMG-001 — Image Quality Transparency Signal  
- ☐ AI-IMG-002 — Causal Visual Adjustment Disclosure  

#### Governance
- ☐ AI-GOV-001 — Medical Boundary Layer (Observation ≠ Diagnosis)  
- ☐ AI-LNG-002 — No Moral Language Rule  

#### UX & Psychology
- ☐ AI-UX-001 — Severity Ceiling Enforcement  
- ☐ AI-UX-002 — Insight Suppression Logic  
- ☐ AI-UX-003 — Cognitive Load Pacing  
- ☐ AI-UX-004 — Insight Echo Consistency  
- ☐ AI-UX-005 — User Intent Framing  

#### Authority Signaling
- ☐ AI-LNG-001 — Dermatologic Reasoning Breadcrumbs  

---

## 7. AGING IMAGERY POLICY (MANDATORY)

All aging imagery must comply with **Aging Imagery Policy v1**.

Required components:
- ☐ AI-IMG-010 — Purpose Definition (directional, not predictive)
- ☐ AI-IMG-011 — Methodology Transparency
- ☐ AI-IMG-012 — Confidence vs Limitation Split
- ☐ AI-IMG-013 — Emotional Safety Framing
- ☐ AI-IMG-014 — Care-Path Bridge
- ☐ AI-IMG-015 — Severity & Tone Constraints

See: `/docs/Aging_Imagery_Policy.pdf`

---

## 8. MANDATORY WHEN RE-ANALYSIS LAUNCHES

- ☐ AI-LONG-001 — Aging Imagery Exposure Control  
- ☐ AI-LONG-002 — Longitudinal Consistency Guard  
- ☐ AI-UX-006 — User Sensitivity Heuristic  

---

## 9. DEFERRABLE (NON-BLOCKING)

- ☐ AI-INT-003 — Comparative Baseline (You vs Healthy Range)  
- ☐ AI-INT-004 — Lifestyle Risk Flagging  
- ☐ AI-LONG-003 — Protocol Journey Mode  
- ☐ AI-LONG-004 — Progress Tracking / Re-analysis  
- ☐ AI-FNL-003 — Email Personalization Tokens  
- ☐ AI-FNL-004 — Localized Treatment Recommendations  
- ☐ AI-GOV-002 — Clinician Review Mode  
- ☐ AI-QA-001 — Internal Insight Suppression Audit Note  

---

## 10. DEFINITION OF DONE (GLOBAL)

A feature is considered complete only when:
- Its checkbox ID is checked
- Required report sections are present
- Aging imagery policy (if applicable) is enforced
- No banned language is introduced
- PR references the relevant ID(s)

---
