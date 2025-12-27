## Real Estate × Transit Analysis (Phase A)

This repo hosts a **static GitHub Pages** web app that compares **Zillow Research market metrics** (e.g. ZHVI) against a **precomputed “transit score”** (by market/geography).

### Why “Phase A”
- **No listing APIs, no keys, no backend**: everything runs in the browser.
- We start with **Zillow Research datasets** (CSV) and a **transit score lookup** (JSON).
- Later phases can add individual listings + routing, but that will likely require a small proxy/serverless layer.

### Local dev
```bash
cd web
npm install
npm run dev
```

### Build
```bash
cd web
npm run build
npm run preview
```

### Deploy (GitHub Pages)
- A GitHub Actions workflow at `.github/workflows/deploy.yml` builds `web/` and deploys `web/dist` to GitHub Pages.
- In your repo settings, set Pages to use **GitHub Actions**.

### Data formats (current prototype)
- **Zillow CSV**: any Zillow Research time-series CSV that includes `RegionName` plus date columns like `YYYY-MM-DD`.
- **Transit JSON**: an object keyed by market name → `{ score, serviceIntensity?, connectivity?, span?, destinationAccess? }`.
